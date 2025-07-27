"""
Script to transform ripgrep search results into Solr documents and index them.

This script:
1. Reads the search results JSON from tables_views_to_solr.py
2. Transforms the data into Solr-compatible documents
3. Indexes the documents into Solr
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any, Generator
from datetime import datetime
import requests
import uuid

# Add src to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from utils.data_utils import get_data_path, get_project_root


class SolrIndexer:
    """Transform and index ripgrep results into Solr."""
    
    def __init__(self, solr_url: str, core_name: str = "oracle_db_search"):
        """Initialize Solr indexer."""
        self.solr_url = solr_url.rstrip('/')
        self.core_name = core_name
        self.solr_core_url = f"{self.solr_url}/solr/{core_name}"
        
    def _create_document_id(self, object_name: str, file_path: str, line_number: int) -> str:
        """Create unique document ID."""
        return f"{object_name}_{hash(file_path)}_{line_number}_{str(uuid.uuid4())[:8]}"
    
    def _extract_file_info(self, file_path: str) -> Dict[str, str]:
        """Extract file information from path."""
        path_obj = Path(file_path)
        return {
            'file_name': path_obj.name,
            'file_extension': path_obj.suffix.lstrip('.') if path_obj.suffix else 'no_extension'
        }
    
    def _transform_match_to_document(
        self, 
        object_name: str, 
        object_type: str, 
        object_owner: str,
        file_match: Dict[str, Any], 
        match_detail: Dict[str, Any],
        config_info: Dict[str, Any],
        summary_info: Dict[str, Any],
        search_timestamp: str
    ) -> Dict[str, Any]:
        """Transform a single match into a Solr document."""
        
        file_info = self._extract_file_info(file_match['file_path'])
        
        doc = {
            'id': self._create_document_id(
                object_name, 
                file_match['file_path'], 
                match_detail['line_number']
            ),
            'config_name': str(config_info.get('script_folder', 'unknown')),
            'source_code_folder': str(config_info.get('source_code_folder', {}).get('path', '')),
            'tables_views_file': str(config_info.get('tables_views', '')),
            'search_timestamp': search_timestamp,
            'search_method': 'ripgrep',  # Could be enhanced to detect actual method
            
            # Oracle DB Object fields
            'object_name': str(object_name),
            'object_type': str(object_type),
            'object_owner': str(object_owner),
            'found': True,
            'total_matches': int(len(file_match['matches'])),
            'total_files': 1,  # This document represents one file
            
            # Match details
            'match_id': f"{object_name}_{file_match['file_path']}_{match_detail['line_number']}",
            'file_path': str(file_match['file_path']),
            'file_name': str(file_info['file_name']),
            'file_extension': str(file_info['file_extension']),
            'line_number': int(match_detail['line_number']),
            'line_text': str(match_detail['line_text']),
            'match_start': int(match_detail.get('match_start', 0)),
            'match_end': int(match_detail.get('match_end', 0)),
            
            # Summary fields
            'summary_total_objects': int(summary_info.get('total_objects', 0)),
            'summary_found_objects': int(summary_info.get('found_objects', 0)),
            'summary_total_matches': int(summary_info.get('total_matches', 0)),
            'summary_success_rate': f"{summary_info.get('found_objects', 0) / max(summary_info.get('total_objects', 1), 1) * 100:.1f}%",
            
            # Error handling
            'has_error': False
        }
        
        # Add context if available
        if 'context_before' in match_detail and match_detail['context_before']:
            # Flatten context_before to text array
            doc['context_before'] = [ctx['line_text'] for ctx in match_detail['context_before']]
        else:
            doc['context_before'] = []
            
        if 'context_after' in match_detail and match_detail['context_after']:
            # Flatten context_after to text array  
            doc['context_after'] = [ctx['line_text'] for ctx in match_detail['context_after']]
        else:
            doc['context_after'] = []
        
        # Create combined text field for full-text search
        all_text_parts = [match_detail['line_text']]
        all_text_parts.extend(doc['context_before'])
        all_text_parts.extend(doc['context_after'])
        doc['all_text'] = all_text_parts
            
        return doc
    
    def _transform_error_to_document(
        self, 
        object_name: str,
        error_info: Dict[str, Any],
        config_info: Dict[str, Any],
        summary_info: Dict[str, Any],
        search_timestamp: str
    ) -> Dict[str, Any]:
        """Transform an error result into a Solr document."""
        
        doc = {
            'id': f"error_{object_name}_{str(uuid.uuid4())[:8]}",
            'config_name': config_info.get('script_folder', 'unknown'),
            'source_code_folder': config_info.get('source_code_folder', {}).get('path', ''),
            'tables_views_file': config_info.get('tables_views', ''),
            'search_timestamp': search_timestamp,
            'search_method': 'ripgrep',
            
            # Oracle DB Object fields
            'object_name': object_name,
            'object_type': 'UNKNOWN',
            'object_owner': 'UNKNOWN',
            'found': False,
            'total_matches': 0,
            'total_files': 0,
            
            # Error details
            'error_message': error_info.get('error', 'Unknown error'),
            'has_error': True,
            
            # Summary fields
            'summary_total_objects': summary_info.get('total_objects', 0),
            'summary_found_objects': summary_info.get('found_objects', 0),
            'summary_total_matches': summary_info.get('total_matches', 0),
            'summary_success_rate': f"{summary_info.get('found_objects', 0) / max(summary_info.get('total_objects', 1), 1) * 100:.1f}%"
        }
        
        return doc
    
    def transform_results_to_documents(
        self, 
        results: Dict[str, Any], 
        tables_views_data: List[Dict[str, Any]]
    ) -> Generator[Dict[str, Any], None, None]:
        """Transform search results into Solr documents."""
        
        # Create lookup for object metadata
        object_metadata = {}
        for item in tables_views_data:
            obj_name = item.get('object_name', '')
            if obj_name and obj_name not in object_metadata:
                object_metadata[obj_name] = {
                    'object_type': item.get('object_type', 'UNKNOWN'),
                    'owner': item.get('owner', 'UNKNOWN')
                }
        
        config_info = results.get('config', {})
        summary_info = results.get('summary', {})
        search_timestamp = datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
        
        # Process each object result
        for obj_result in results.get('objects', []):
            object_name = obj_result.get('object_name', '')
            metadata = object_metadata.get(object_name, {
                'object_type': 'UNKNOWN',
                'owner': 'UNKNOWN'
            })
            
            if obj_result.get('found', False):
                # Process found objects with matches
                for file_match in obj_result.get('files', []):
                    for match_detail in file_match.get('matches', []):
                        doc = self._transform_match_to_document(
                            object_name=object_name,
                            object_type=metadata['object_type'],
                            object_owner=metadata['owner'],
                            file_match=file_match,
                            match_detail=match_detail,
                            config_info=config_info,
                            summary_info=summary_info,
                            search_timestamp=search_timestamp
                        )
                        yield doc
            else:
                # Process objects not found (with potential errors)
                doc = self._transform_error_to_document(
                    object_name=object_name,
                    error_info=obj_result,
                    config_info=config_info,
                    summary_info=summary_info,
                    search_timestamp=search_timestamp
                )
                yield doc
    
    def delete_all_documents(self) -> bool:
        """Delete all documents from the Solr core."""
        try:
            delete_url = f"{self.solr_core_url}/update"
            delete_data = {"delete": {"query": "*:*"}}
            
            response = requests.post(
                delete_url,
                json=delete_data,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                # Commit the deletion
                commit_response = requests.post(
                    f"{delete_url}?commit=true",
                    headers={'Content-Type': 'application/json'}
                )
                return commit_response.status_code == 200
            
            return False
            
        except Exception as e:
            print(f"Error deleting documents: {e}")
            return False
    
    def index_documents(self, documents: List[Dict[str, Any]], batch_size: int = 100) -> bool:
        """Index documents into Solr in batches."""
        try:
            update_url = f"{self.solr_core_url}/update"
            
            # Process documents in batches
            for i in range(0, len(documents), batch_size):
                batch = documents[i:i + batch_size]
                
                # Debug: Print first document structure in first batch
                if i == 0 and batch:
                    print(f"Sample document structure:")
                    print(f"  ID: {batch[0].get('id', 'N/A')}")
                    print(f"  Object: {batch[0].get('object_name', 'N/A')}")
                    print(f"  Line: {batch[0].get('line_number', 'N/A')}")
                    print(f"  Context before: {len(batch[0].get('context_before', []))} lines")
                    print(f"  Context after: {len(batch[0].get('context_after', []))} lines")
                
                response = requests.post(
                    update_url,
                    json=batch,
                    headers={'Content-Type': 'application/json'}
                )
                
                if response.status_code != 200:
                    print(f"Error indexing batch {i//batch_size + 1}:")
                    print(f"Status: {response.status_code}")
                    print(f"Response: {response.text}")
                    
                    # Try to identify problematic document
                    if "doc=" in response.text:
                        import re
                        doc_match = re.search(r'doc=([^\]]+)', response.text)
                        if doc_match:
                            print(f"Problematic document ID: {doc_match.group(1)}")
                    
                    return False
                
                print(f"✓ Indexed batch {i//batch_size + 1}/{(len(documents) + batch_size - 1)//batch_size}")
            
            # Commit all changes
            print("Committing changes...")
            commit_response = requests.post(
                f"{update_url}?commit=true",
                headers={'Content-Type': 'application/json'}
            )
            
            if commit_response.status_code != 200:
                print(f"Commit failed: {commit_response.text}")
                return False
            
            return True
            
        except Exception as e:
            print(f"Error indexing documents: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def verify_indexing(self) -> Dict[str, Any]:
        """Verify the indexing by querying Solr."""
        try:
            query_url = f"{self.solr_core_url}/select"
            params = {
                'q': '*:*',
                'rows': 0,
                'facet': 'true',
                'facet.field': ['object_name', 'object_type', 'found', 'file_extension']
            }
            
            response = requests.get(query_url, params=params)
            
            if response.status_code == 200:
                return response.json()
            else:
                return {'error': f'Query failed: {response.text}'}
                
        except Exception as e:
            return {'error': f'Verification failed: {str(e)}'}


def main():
    """Main function to index search results into Solr."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Index Oracle DB search results into Solr')
    parser.add_argument('--config', default='oracle_db_example_to_solr', 
                       help='Configuration name (default: oracle_db_example_to_solr)')
    parser.add_argument('--solr-url', default='http://localhost:8983', 
                       help='Solr URL (default: http://localhost:8983)')
    parser.add_argument('--core', default='oracle_db_search', 
                       help='Solr core name (default: oracle_db_search)')
    parser.add_argument('--clear', action='store_true', 
                       help='Clear existing documents before indexing')
    
    args = parser.parse_args()
    
    try:
        # Initialize Solr indexer
        indexer = SolrIndexer(args.solr_url, args.core)
        
        # Load search results
        results_file = get_data_path('output') / args.config / 'search_results.json'
        if not results_file.exists():
            print(f"Error: Results file not found: {results_file}")
            sys.exit(1)
        
        with open(results_file, 'r', encoding='utf-8') as f:
            results = json.load(f)
        
        # Load tables/views metadata
        config_file = get_project_root() / "config" / f"{args.config}.json"
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        tables_views_file = Path(config['tables_views'])
        with open(tables_views_file, 'r') as f:
            tables_views_data = json.load(f)
        
        print("Starting Solr indexing...")
        print(f"Solr URL: {args.solr_url}")
        print(f"Core: {args.core}")
        
        # Clear existing documents if requested
        if args.clear:
            print("Clearing existing documents...")
            if indexer.delete_all_documents():
                print("✓ Existing documents cleared")
            else:
                print("✗ Failed to clear existing documents")
                sys.exit(1)
        
        # Transform results to documents
        print("Transforming results to Solr documents...")
        documents = list(indexer.transform_results_to_documents(results, tables_views_data))
        print(f"Generated {len(documents)} documents")
        
        # Index documents
        print("Indexing documents...")
        if indexer.index_documents(documents):
            print("✓ Documents indexed successfully")
        else:
            print("✗ Failed to index documents")
            sys.exit(1)
        
        # Verify indexing
        print("Verifying indexing...")
        verification = indexer.verify_indexing()
        if 'error' in verification:
            print(f"✗ Verification failed: {verification['error']}")
        else:
            response = verification.get('response', {})
            facets = verification.get('facet_counts', {}).get('facet_fields', {})
            
            print("✓ Indexing verified:")
            print(f"  - Total documents: {response.get('numFound', 0)}")
            
            if 'object_name' in facets:
                unique_objects = len([x for i, x in enumerate(facets['object_name']) if i % 2 == 0])
                print(f"  - Unique objects: {unique_objects}")
            
            if 'found' in facets:
                found_stats = dict(zip(facets['found'][::2], facets['found'][1::2]))
                print(f"  - Found objects: {found_stats}")
        
        print("\nSolr indexing completed successfully!")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
