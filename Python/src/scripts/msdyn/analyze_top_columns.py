"""
Script to analyze Microsoft Dynamics 365 BC AL objects and find top 3 columns mentioned in Solr.

This script:
1. Loads AL object metadata from tables_views.json (MSDynamics format)
2. Queries Solr for all documents containing each AL object
3. Searches for column mentions in context_before, line_text, and context_after
4. Weights mentions: context_before & line_text = 3x, context_after = 1x
5. Returns top 3 columns for each AL object based on weighted scores
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any
from collections import defaultdict
import requests
import re

# Add src to path for imports
sys.path.append(str(Path(__file__).parent.parent.parent))

from utils.data_utils import get_data_path, get_project_root


class MSDynamicsTopColumnsAnalyzer:
    """Analyzes Microsoft Dynamics 365 BC AL objects to find top mentioned columns."""
    
    def __init__(self, solr_url: str = "http://localhost:8983/solr/MSDyn"):
        self.solr_url = solr_url
        self.object_columns = {}
        self.results = {}
        
    def load_object_metadata(self, metadata_file: str = None) -> bool:
        """Load AL object and column metadata from JSON file."""
        if not metadata_file:
            # Use MSDynamics configuration to find the tables_views file
            config_file = get_project_root() / "config" / "MSDynamics.json"
            with open(config_file, 'r') as f:
                config = json.load(f)
            metadata_file = Path(config['tables_views'])
        
        print(f"Loading AL object metadata from: {metadata_file}")
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # AL format: each key is a table name with table info containing columns
            self.object_columns = {}
            for table_name, table_info in data.items():
                if table_info.get('object_type') == 'TABLE' and table_name:
                    columns = table_info.get('columns', [])
                    # Filter out very short column names and normalize to uppercase
                    valid_columns = [col.upper() for col in columns if col and len(col) > 2]
                    if valid_columns:
                        # Keep original case for table name (don't convert to uppercase)
                        self.object_columns[table_name] = valid_columns
            
            print(f"Loaded column data for {len(self.object_columns)} AL tables")
            if self.object_columns:
                sample_obj = next(iter(self.object_columns))
                sample_cols = self.object_columns[sample_obj][:5]  # Show first 5 columns
                print(f"Sample: {sample_obj} has {len(self.object_columns[sample_obj])} columns, first 5: {sample_cols}")
            
            return True
            
        except Exception as e:
            print(f"Error loading AL metadata: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def search_object_documents(self, object_name: str, max_docs: int = 1000) -> List[Dict]:
        """Search Solr for all documents containing the AL object."""
        query_params = {
            'q': f'object_name:"{object_name}"',
            'rows': max_docs,
            'fl': 'id,object_name,line_text,context_before,context_after',
            'wt': 'json'
        }
        
        try:
            response = requests.get(f"{self.solr_url}/select", params=query_params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            docs = data.get('response', {}).get('docs', [])
            print(f"Found {len(docs)} documents for {object_name}")
            return docs
            
        except Exception as e:
            print(f"Error searching for {object_name}: {e}")
            return []
    
    def extract_column_mentions(self, text: str, columns: List[str]) -> Dict[str, int]:
        """Extract column mentions from text using word boundaries."""
        if not text or not columns:
            return {}
        
        mentions = {}
        text_upper = text.upper()
        
        for column in columns:
            # Use word boundaries to find exact column name matches
            # Also handle AL-specific syntax like field references
            patterns = [
                r'\b' + re.escape(column) + r'\b',  # Standard word boundary
                r'"' + re.escape(column) + r'"',     # Quoted field names in AL
                r'\.' + re.escape(column) + r'\b',   # Property access like Rec.FieldName
            ]
            
            total_matches = 0
            for pattern in patterns:
                matches = re.findall(pattern, text_upper)
                total_matches += len(matches)
            
            if total_matches > 0:
                mentions[column] = total_matches
        
        return mentions
    
    def analyze_object_columns(self, object_name: str) -> Dict[str, Any]:
        """Analyze column mentions for a specific AL object."""
        print(f"\nAnalyzing columns for AL table: {object_name}")
        
        if object_name not in self.object_columns:
            return {'error': f'AL table {object_name} not found in metadata'}
        
        columns = self.object_columns[object_name]
        documents = self.search_object_documents(object_name)
        
        if not documents:
            return {'error': f'No documents found for {object_name} in Solr'}
        
        # Initialize column counters with weights
        weighted_scores = defaultdict(float)
        mention_details = defaultdict(lambda: {
            'context_before': 0,
            'line_text': 0, 
            'context_after': 0,
            'total_weighted': 0
        })
        
        # Process each document
        for doc in documents:
            # Extract mentions from different fields
            context_before_text = ' '.join(doc.get('context_before', []))
            line_text = doc.get('line_text', '')
            context_after_text = ' '.join(doc.get('context_after', []))
            
            # Find column mentions in each field
            before_mentions = self.extract_column_mentions(context_before_text, columns)
            line_mentions = self.extract_column_mentions(line_text, columns)
            after_mentions = self.extract_column_mentions(context_after_text, columns)
            
            # Apply weights and accumulate scores
            for column in columns:
                before_count = before_mentions.get(column, 0)
                line_count = line_mentions.get(column, 0)
                after_count = after_mentions.get(column, 0)
                
                # Weight: context_before & line_text = 3x, context_after = 1x
                weighted_score = (before_count * 3) + (line_count * 3) + (after_count * 1)
                
                if weighted_score > 0:
                    weighted_scores[column] += weighted_score
                    mention_details[column]['context_before'] += before_count
                    mention_details[column]['line_text'] += line_count
                    mention_details[column]['context_after'] += after_count
                    mention_details[column]['total_weighted'] += weighted_score
        
        # Get top 3 columns
        top_columns = sorted(weighted_scores.items(), key=lambda x: x[1], reverse=True)[:3]
        
        result = {
            'object_name': object_name,
            'object_type': 'AL_TABLE',
            'total_columns': len(columns),
            'documents_analyzed': len(documents),
            'columns_with_mentions': len(weighted_scores),
            'top_3_columns': []
        }
        
        for i, (column, score) in enumerate(top_columns, 1):
            details = mention_details[column]
            result['top_3_columns'].append({
                'rank': i,
                'column_name': column,
                'weighted_score': score,
                'context_before_mentions': details['context_before'],
                'line_text_mentions': details['line_text'],
                'context_after_mentions': details['context_after'],
                'total_raw_mentions': (details['context_before'] + 
                                     details['line_text'] + 
                                     details['context_after'])
            })
        
        return result
    
    def analyze_all_objects(self, output_file: str = None) -> Dict[str, Any]:
        """Analyze top columns for all AL objects."""
        print("Starting analysis of all AL tables...")
        
        all_results = {}
        total_objects = len(self.object_columns)
        
        for i, object_name in enumerate(self.object_columns.keys(), 1):
            print(f"Progress: {i}/{total_objects} - {object_name}")
            result = self.analyze_object_columns(object_name)
            all_results[object_name] = result
        
        # Generate summary statistics
        summary = self._generate_summary(all_results)
        
        # Save results if output file specified
        if output_file:
            self._save_results(all_results, summary, output_file)
        
        return {
            'results': all_results,
            'summary': summary
        }
    
    def _generate_summary(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """Generate summary statistics from analysis results."""
        total_objects = len(results)
        objects_with_mentions = sum(1 for r in results.values() 
                                  if not r.get('error') and r.get('columns_with_mentions', 0) > 0)
        
        # Collect all top columns across all objects
        all_top_columns = []
        for obj_result in results.values():
            if not obj_result.get('error') and obj_result.get('top_3_columns'):
                for col_info in obj_result['top_3_columns']:
                    all_top_columns.append({
                        'object': obj_result['object_name'],
                        'column': col_info['column_name'],
                        'weighted_score': col_info['weighted_score'],
                        'rank': col_info['rank']
                    })
        
        # Find globally most mentioned columns
        global_column_scores = defaultdict(float)
        for col_info in all_top_columns:
            global_column_scores[col_info['column']] += col_info['weighted_score']
        
        top_global_columns = sorted(global_column_scores.items(), 
                                  key=lambda x: x[1], reverse=True)[:10]
        
        return {
            'total_al_tables_analyzed': total_objects,
            'tables_with_column_mentions': objects_with_mentions,
            'success_rate': f"{objects_with_mentions}/{total_objects} ({objects_with_mentions/total_objects*100:.1f}%)",
            'total_top_columns_found': len(all_top_columns),
            'top_10_global_columns': [
                {'column_name': col, 'total_weighted_score': score}
                for col, score in top_global_columns
            ]
        }
    
    def _save_results(self, results: Dict[str, Any], summary: Dict[str, Any], output_file: str):
        """Save analysis results to file."""
        from datetime import datetime
        
        output_data = {
            'analysis_type': 'msdynamics_top_columns_analysis',
            'platform': 'Microsoft Dynamics 365 BC',
            'weighting_scheme': 'context_before=3x, line_text=3x, context_after=1x',
            'timestamp': datetime.now().isoformat(),
            'summary': summary,
            'detailed_results': results
        }
        
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        print(f"\nResults saved to: {output_path}")
    
    def print_results(self, results: Dict[str, Any]):
        """Print formatted results to console."""
        summary = results.get('summary', {})
        detailed_results = results.get('results', {})
        
        print("\n" + "="*80)
        print("MICROSOFT DYNAMICS 365 BC TOP COLUMNS ANALYSIS RESULTS")
        print("="*80)
        
        print("\nSUMMARY:")
        print(f"Total AL Tables Analyzed: {summary.get('total_al_tables_analyzed', 0)}")
        print(f"Tables with Column Mentions: {summary.get('tables_with_column_mentions', 0)}")
        print(f"Success Rate: {summary.get('success_rate', 'N/A')}")
        print(f"Total Top Columns Found: {summary.get('total_top_columns_found', 0)}")
        
        print("\nTOP 10 GLOBAL COLUMNS (across all AL tables):")
        for i, col_info in enumerate(summary.get('top_10_global_columns', [])[:10], 1):
            print(f"{i:2d}. {col_info['column_name']:<20} (Score: {col_info['total_weighted_score']:.1f})")
        
        print("\nDETAILED RESULTS BY AL TABLE:")
        print("-"*80)
        
        for obj_name, obj_result in detailed_results.items():
            if obj_result.get('error'):
                print(f"\n{obj_name}: {obj_result['error']}")
                continue
            
            print(f"\n{obj_name}:")
            print(f"  Documents analyzed: {obj_result.get('documents_analyzed', 0)}")
            print(f"  Columns with mentions: {obj_result.get('columns_with_mentions', 0)}/{obj_result.get('total_columns', 0)}")
            
            top_columns = obj_result.get('top_3_columns', [])
            if top_columns:
                print("  Top 3 columns:")
                for col_info in top_columns:
                    print(f"    {col_info['rank']}. {col_info['column_name']:<15} "
                          f"(Score: {col_info['weighted_score']:.1f}, "
                          f"Before: {col_info['context_before_mentions']}, "
                          f"Line: {col_info['line_text_mentions']}, "
                          f"After: {col_info['context_after_mentions']})")
            else:
                print("  No column mentions found")


def main():
    """Main function to run the Microsoft Dynamics 365 BC analysis."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Analyze top columns mentioned in Microsoft Dynamics 365 BC AL objects')
    parser.add_argument('--object', type=str, help='Analyze specific AL table only')
    parser.add_argument('--output', type=str, help='Output file path for results')
    parser.add_argument('--solr-url', type=str, 
                       default='http://localhost:8983/solr/MSDyn',
                       help='Solr URL (default: http://localhost:8983/solr/MSDyn)')
    parser.add_argument('--config', type=str, default='MSDynamics',
                       help='Configuration name (default: MSDynamics)')
    
    args = parser.parse_args()
    
    # Initialize analyzer
    analyzer = MSDynamicsTopColumnsAnalyzer(solr_url=args.solr_url)
    
    # Load AL metadata
    if not analyzer.load_object_metadata():
        print("Failed to load AL object metadata. Exiting.")
        sys.exit(1)
    
    # Set default output file
    if not args.output:
        output_dir = get_data_path() / "output" / args.config.lower()
        args.output = str(output_dir / "top_columns_analysis.json")
    
    # Run analysis
    if args.object:
        # Analyze single AL table - find the actual table name case
        search_table = args.object
        actual_table_name = None
        
        # Find the table with case-insensitive match
        for table_name in analyzer.object_columns.keys():
            if table_name.upper() == search_table.upper():
                actual_table_name = table_name
                break
        
        if actual_table_name:
            print(f"Analyzing AL table: {actual_table_name}")
            result = analyzer.analyze_object_columns(actual_table_name)
        else:
            print(f"AL table '{search_table}' not found in metadata")
            available_tables = [name for name in analyzer.object_columns.keys() 
                              if search_table.upper() in name.upper()]
            if available_tables:
                print(f"Did you mean one of these? {available_tables}")
            sys.exit(1)
        
        if result.get('error'):
            print(f"Error: {result['error']}")
        else:
            print(f"\n=== Results for {actual_table_name} ===")
            print(f"Documents analyzed: {result.get('documents_analyzed', 0)}")
            print(f"Columns with mentions: {result.get('columns_with_mentions', 0)}/{result.get('total_columns', 0)}")
            
            for col_info in result.get('top_3_columns', []):
                print(f"{col_info['rank']}. {col_info['column_name']} "
                      f"(Score: {col_info['weighted_score']:.1f}, "
                      f"Before: {col_info['context_before_mentions']}, "
                      f"Line: {col_info['line_text_mentions']}, "
                      f"After: {col_info['context_after_mentions']})")
    else:
        # Analyze all AL tables
        results = analyzer.analyze_all_objects(args.output)
        analyzer.print_results(results)
    
    print("\nMicrosoft Dynamics 365 BC top columns analysis completed!")


if __name__ == "__main__":
    main()
