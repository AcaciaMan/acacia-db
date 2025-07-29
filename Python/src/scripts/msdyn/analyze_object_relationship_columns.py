"""
Script to find MSDynamics AL object relationships and analyze first object's top columns in relation documents.

This script:
1. Finds pairs of AL objects that appear together in the same Solr documents
2. For each relationship, analyzes the first object's columns mentioned in those documents
3. Uses proximity-based scoring where closer mentions to the first object get higher scores
4. Weights mentions: line_text & context_after = 3x, context_before = 1x
5. Returns top 3 columns for the first object in each relationship
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any, Tuple
from collections import defaultdict
import requests
import re
import math

# Add src to path for imports
sys.path.append(str(Path(__file__).parent.parent.parent))

from utils.data_utils import get_data_path


class MSDynamicsObjectRelationshipAnalyzer:
    """Analyzes relationships between MSDynamics AL objects and first object's columns in relation documents."""
    
    def __init__(self, solr_url: str = "http://localhost:8983/solr/MSDyn"):
        self.solr_url = solr_url
        self.object_columns = {}
        self.relationships = {}
        
    def load_object_metadata(self, metadata_file: str = None) -> bool:
        """Load AL object and column metadata from JSON file."""
        if not metadata_file:
            metadata_file = get_data_path() / "external" / "msdyn" / "tables_views.json"
        
        print(f"Loading AL object metadata from: {metadata_file}")
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Process MSDynamics nested structure: {object_name: {columns: [...]}}
            self.object_columns = {}
            for object_name, object_info in data.items():
                if isinstance(object_info, dict) and 'columns' in object_info:
                    # Preserve original case for AL table names, uppercase columns
                    columns = [col.upper() for col in object_info['columns']]
                    self.object_columns[object_name] = columns
            
            print(f"Loaded column data for {len(self.object_columns)} AL objects")
            if self.object_columns:
                sample_obj = next(iter(self.object_columns))
                print(f"Sample: {sample_obj} has columns: {self.object_columns[sample_obj]}")
            
            return True
            
        except Exception as e:
            print(f"Error loading AL metadata: {e}")
            return False
    
    def find_object_relationships(self, min_cooccurrence: int = 1) -> Dict[Tuple[str, str], int]:
        """Find pairs of AL objects that appear together in Solr documents."""
        print("Finding AL object relationships...")
        
        relationships = defaultdict(int)
        
        # Get all objects that exist in Solr
        available_objects = list(self.object_columns.keys())
        
        # Check each pair of objects
        for i, obj1 in enumerate(available_objects):
            for j, obj2 in enumerate(available_objects):
                if i >= j:  # Skip self and already checked pairs
                    continue
                    
                print(f"Checking relationships for: {obj1} <-> {obj2}")
                
                # Search for documents containing both objects (case-sensitive for exact AL object names)
                query = (f'(line_text:"{obj1}" OR context_before:"{obj1}" OR context_after:"{obj1}") AND '
                        f'(line_text:"{obj2}" OR context_before:"{obj2}" OR context_after:"{obj2}")')
                
                try:
                    response = requests.get(f"{self.solr_url}/select", params={
                        'q': query,
                        'rows': 0,  # Just count, don't need docs
                        'wt': 'json'
                    }, timeout=30)
                    
                    if response.status_code != 200:
                        continue
                        
                    data = response.json()
                    count = data.get('response', {}).get('numFound', 0)
                    
                    if count > 0:
                        # Create ordered pair (always put lexicographically first object first)
                        pair = tuple(sorted([obj1, obj2]))
                        relationships[pair] = count
                        
                except Exception as e:
                    print(f"Error checking relationship {obj1} <-> {obj2}: {e}")
                    continue
        
        # Filter by minimum co-occurrence
        filtered_relationships = {
            pair: count for pair, count in relationships.items() 
            if count >= min_cooccurrence
        }
        
        print(f"Found {len(filtered_relationships)} AL object relationships")
        return filtered_relationships
    
    def get_relationship_documents(self, object1: str, object2: str) -> List[Dict]:
        """Get all documents where both AL objects appear together."""
        # Search for documents containing both objects in any text field
        query = (f'(line_text:"{object1}" OR context_before:"{object1}" OR context_after:"{object1}") AND '
                f'(line_text:"{object2}" OR context_before:"{object2}" OR context_after:"{object2}")')
        
        try:
            response = requests.get(f"{self.solr_url}/select", params={
                'q': query,
                'rows': 1000,
                'fl': 'id,object_name,line_text,context_before,context_after',
                'wt': 'json'
            }, timeout=30)
            
            if response.status_code != 200:
                print(f"Error searching for relationship documents: {response.status_code}")
                return []
            
            data = response.json()
            docs = data.get('response', {}).get('docs', [])
            
            print(f"Found {len(docs)} documents with both {object1} and {object2}")
            return docs
            
        except Exception as e:
            print(f"Error getting relationship documents: {e}")
            return []
    
    def calculate_column_proximity_in_relationship(self, docs: List[Dict], target_object: str, 
                                                 target_columns: List[str]) -> Dict[str, Dict]:
        """Calculate proximity scores for target object's columns in relationship documents."""
        column_scores = defaultdict(lambda: {
            'total_weighted_score': 0,
            'total_mentions': 0,
            'context_before_score': 0,
            'line_text_score': 0,
            'context_after_score': 0,
            'best_proximity': 0,
            'min_distance': float('inf'),
            'documents_found_in': 0
        })
        
        for doc in docs:
            # Extract text fields
            context_before = doc.get('context_before', [])
            line_text = doc.get('line_text', '')
            context_after = doc.get('context_after', [])
            
            # Combine all text with position tracking for cross-field proximity
            all_text = ""
            field_positions = {}
            
            context_before_text = ' '.join(context_before)
            context_after_text = ' '.join(context_after)
            
            current_pos = 0
            if context_before_text:
                all_text += context_before_text + " "
                field_positions['context_before'] = (current_pos, current_pos + len(context_before_text))
                current_pos = len(all_text)
            
            if line_text:
                all_text += line_text + " "
                field_positions['line_text'] = (current_pos, current_pos + len(line_text))
                current_pos = len(all_text)
            
            if context_after_text:
                all_text += context_after_text
                field_positions['context_after'] = (current_pos, current_pos + len(context_after_text))
            
            if not all_text:
                continue
            
            # Find target object positions in combined text (case-insensitive search)
            all_text_upper = all_text.upper()
            object_pattern = r'\b' + re.escape(target_object.upper()) + r'\b'
            object_matches = list(re.finditer(object_pattern, all_text_upper))
            
            if not object_matches:
                continue
            
            # Process each target column
            for column in target_columns:
                column_pattern = r'\b' + re.escape(column) + r'\b'
                column_matches = list(re.finditer(column_pattern, all_text_upper))
                
                if not column_matches:
                    continue
                
                # Calculate best proximity between target object and column
                min_distance = float('inf')
                for obj_match in object_matches:
                    obj_pos = obj_match.start()
                    for col_match in column_matches:
                        col_pos = col_match.start()
                        distance = abs(obj_pos - col_pos)
                        min_distance = min(min_distance, distance)
                
                if min_distance == float('inf'):
                    continue
                
                proximity_score = math.exp(-min_distance / 100.0)
                
                # Update best proximity for this column
                column_scores[column]['best_proximity'] = max(
                    column_scores[column]['best_proximity'], 
                    proximity_score
                )
                column_scores[column]['min_distance'] = min(
                    column_scores[column]['min_distance'], 
                    min_distance
                )
                column_scores[column]['documents_found_in'] += 1
                
                # Calculate field-specific scores
                fields_data = [
                    ('context_before', context_before_text, 1),  # 1x weight
                    ('line_text', line_text, 3),                # 3x weight
                    ('context_after', context_after_text, 3)    # 3x weight
                ]
                
                for field_name, text, weight in fields_data:
                    if not text:
                        continue
                    
                    field_column_matches = list(re.finditer(column_pattern, text.upper()))
                    field_mentions = len(field_column_matches)
                    
                    if field_mentions > 0:
                        field_score = proximity_score * field_mentions * weight
                        column_scores[column]['total_weighted_score'] += field_score
                        column_scores[column]['total_mentions'] += field_mentions
                        column_scores[column][f'{field_name}_score'] += field_score
        
        # Clean up infinite distances
        for column_data in column_scores.values():
            if column_data['min_distance'] == float('inf'):
                column_data['min_distance'] = None
        
        return dict(column_scores)
    
    def analyze_relationship(self, object1: str, object2: str, top_n: int = 3) -> Dict[str, Any]:
        """Analyze a specific AL object relationship and return top columns for the first object."""
        print(f"\nAnalyzing AL object relationship: {object1} <-> {object2}")
        
        # Case-insensitive lookup for user input
        actual_object1 = None
        actual_object2 = None
        
        for obj in self.object_columns.keys():
            if obj.upper() == object1.upper():
                actual_object1 = obj
            if obj.upper() == object2.upper():
                actual_object2 = obj
        
        if not actual_object1:
            return {'error': f'AL object {object1} not found in metadata'}
        if not actual_object2:
            return {'error': f'AL object {object2} not found in metadata'}
        
        # Get documents where both objects appear
        docs = self.get_relationship_documents(actual_object1, actual_object2)
        
        if not docs:
            return {'error': f'No documents found with both {actual_object1} and {actual_object2}'}
        
        # Analyze first object's columns in these relationship documents
        target_columns = self.object_columns[actual_object1]
        column_scores = self.calculate_column_proximity_in_relationship(docs, actual_object1, target_columns)
        
        if not column_scores:
            return {
                'object1': actual_object1,
                'object2': actual_object2,
                'object1_type': 'AL_TABLE',
                'object2_type': 'AL_TABLE',
                'relationship_documents': len(docs),
                'columns_analyzed': len(target_columns),
                'columns_with_mentions': 0,
                f'top_{top_n}_columns': []
            }
        
        # Sort columns by weighted score and get top N
        sorted_columns = sorted(column_scores.items(), 
                              key=lambda x: x[1]['total_weighted_score'], 
                              reverse=True)[:top_n]
        
        result = {
            'object1': actual_object1,
            'object2': actual_object2,
            'object1_type': 'AL_TABLE',
            'object2_type': 'AL_TABLE',
            'relationship_documents': len(docs),
            'columns_analyzed': len(target_columns),
            'columns_with_mentions': len(column_scores),
            f'top_{top_n}_columns': []
        }
        
        for i, (column, scores) in enumerate(sorted_columns, 1):
            result[f'top_{top_n}_columns'].append({
                'rank': i,
                'column_name': column,
                'total_weighted_score': round(scores['total_weighted_score'], 3),
                'total_mentions': scores['total_mentions'],
                'context_before_score': round(scores['context_before_score'], 3),
                'line_text_score': round(scores['line_text_score'], 3),
                'context_after_score': round(scores['context_after_score'], 3),
                'best_proximity': round(scores['best_proximity'], 3),
                'min_distance_chars': scores['min_distance'],
                'documents_found_in': scores['documents_found_in']
            })
        
        return result
    
    def analyze_all_relationships(self, min_cooccurrence: int = 2, top_n: int = 3, 
                                output_file: str = None) -> Dict[str, Any]:
        """Analyze all AL object relationships and their first object's top columns."""
        print("Starting comprehensive AL object relationship analysis...")
        
        # Find all relationships
        relationships = self.find_object_relationships(min_cooccurrence)
        
        if not relationships:
            print("No AL object relationships found!")
            return {'relationships': {}, 'summary': {}}
        
        # Analyze each relationship
        all_results = {}
        total_relationships = len(relationships)
        
        for i, ((obj1, obj2), cooccurrence_count) in enumerate(relationships.items(), 1):
            print(f"Progress: {i}/{total_relationships} - {obj1} <-> {obj2} ({cooccurrence_count} docs)")
            
            result = self.analyze_relationship(obj1, obj2, top_n)
            result['cooccurrence_count'] = cooccurrence_count
            
            relationship_key = f"{obj1}__{obj2}"
            all_results[relationship_key] = result
        
        # Generate summary
        summary = self._generate_summary(all_results, top_n)
        
        # Save results if output file specified
        if output_file:
            self._save_results(all_results, summary, output_file, top_n)
        
        return {
            'relationships': all_results,
            'summary': summary
        }
    
    def _generate_summary(self, results: Dict[str, Any], top_n: int) -> Dict[str, Any]:
        """Generate summary statistics from relationship analysis."""
        total_relationships = len(results)
        successful_analyses = sum(1 for r in results.values() 
                                if not r.get('error') and r.get('columns_with_mentions', 0) > 0)
        
        # Collect all top columns across all relationships
        all_top_columns = []
        for rel_result in results.values():
            if not rel_result.get('error') and rel_result.get(f'top_{top_n}_columns'):
                for col_info in rel_result[f'top_{top_n}_columns']:
                    all_top_columns.append({
                        'relationship': f"{rel_result['object1']} <-> {rel_result['object2']}",
                        'object1': rel_result['object1'],
                        'column': col_info['column_name'],
                        'weighted_score': col_info['total_weighted_score'],
                        'proximity': col_info['best_proximity'],
                        'rank': col_info['rank']
                    })
        
        # Find globally most important columns in relationships
        global_column_scores = defaultdict(float)
        for col_info in all_top_columns:
            global_column_scores[f"{col_info['object1']}.{col_info['column']}"] += col_info['weighted_score']
        
        top_global_columns = sorted(global_column_scores.items(), 
                                  key=lambda x: x[1], reverse=True)[:10]
        
        return {
            'total_relationships_analyzed': total_relationships,
            'successful_analyses': successful_analyses,
            'success_rate': f"{successful_analyses}/{total_relationships} ({successful_analyses/total_relationships*100:.1f}%)",
            'total_top_columns_found': len(all_top_columns),
            'weighting_scheme': 'line_text=3x, context_after=3x, context_before=1x',
            'proximity_algorithm': 'exponential_decay(-distance/100)',
            'al_object_type': 'Microsoft Dynamics 365 Business Central AL Tables',
            'top_10_global_columns_in_relationships': [
                {
                    'object_column': col_obj, 
                    'total_weighted_score': round(score, 3)
                }
                for col_obj, score in top_global_columns
            ]
        }
    
    def _save_results(self, results: Dict[str, Any], summary: Dict[str, Any], 
                     output_file: str, top_n: int):
        """Save relationship analysis results to file."""
        output_data = {
            'analysis_type': 'msdynamics_object_relationship_column_analysis',
            'description': 'Analysis of first AL object columns in documents where two AL objects appear together',
            'object_type': 'AL_TABLE',
            'weighting_scheme': 'line_text=3x, context_after=3x, context_before=1x',
            'proximity_algorithm': 'exponential_decay(-distance/100)',
            'top_n_per_relationship': top_n,
            'timestamp': str(Path().cwd()),
            'summary': summary,
            'relationship_results': results
        }
        
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        print(f"\nResults saved to: {output_path}")
    
    def print_results(self, results: Dict[str, Any]):
        """Print formatted results to console."""
        summary = results.get('summary', {})
        relationship_results = results.get('relationships', {})
        
        print("\n" + "="*80)
        print("MSDYNAMICS AL OBJECT RELATIONSHIP COLUMN ANALYSIS RESULTS")
        print("="*80)
        
        print("\nSUMMARY:")
        print(f"Total AL Relationships Analyzed: {summary.get('total_relationships_analyzed', 0)}")
        print(f"Successful Analyses: {summary.get('successful_analyses', 0)}")
        print(f"Success Rate: {summary.get('success_rate', 'N/A')}")
        print(f"Total Top Columns Found: {summary.get('total_top_columns_found', 0)}")
        print(f"Weighting: {summary.get('weighting_scheme', 'N/A')}")
        print(f"AL Object Type: {summary.get('al_object_type', 'N/A')}")
        
        print("\nTOP 10 GLOBAL COLUMNS IN AL RELATIONSHIPS:")
        for i, col_info in enumerate(summary.get('top_10_global_columns_in_relationships', [])[:10], 1):
            print(f"{i:2d}. {col_info['object_column']:<30} (Score: {col_info['total_weighted_score']:.3f})")
        
        print("\nDETAILED AL RELATIONSHIP RESULTS:")
        print("-"*80)
        
        for rel_key, rel_result in relationship_results.items():
            if rel_result.get('error'):
                print(f"\n{rel_key}: {rel_result['error']}")
                continue
            
            obj1 = rel_result['object1']
            obj2 = rel_result['object2']
            print(f"\n{obj1} <-> {obj2} (AL Tables):")
            print(f"  Co-occurrence documents: {rel_result.get('cooccurrence_count', 0)}")
            print(f"  Relationship documents: {rel_result.get('relationship_documents', 0)}")
            print(f"  Columns with mentions: {rel_result.get('columns_with_mentions', 0)}/{rel_result.get('columns_analyzed', 0)}")
            
            # Get the top columns key dynamically
            top_cols_key = [k for k in rel_result.keys() if k.startswith('top_') and k.endswith('_columns')]
            if top_cols_key:
                top_columns = rel_result.get(top_cols_key[0], [])
                if top_columns:
                    print(f"  Top columns for {obj1}:")
                    for col_info in top_columns:
                        print(f"    {col_info['rank']}. {col_info['column_name']:<15} "
                              f"(Score: {col_info['total_weighted_score']:.3f}, "
                              f"Proximity: {col_info['best_proximity']:.3f}, "
                              f"Distance: {col_info['min_distance_chars']} chars)")
                else:
                    print(f"  No column mentions found for {obj1}")


def main():
    """Main function to run the MSDynamics relationship column analysis."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Analyze first AL object columns in AL object relationships')
    parser.add_argument('--object1', type=str, help='Analyze specific first AL object')
    parser.add_argument('--object2', type=str, help='Analyze specific second AL object (requires --object1)')
    parser.add_argument('--min-cooccurrence', type=int, default=2, 
                       help='Minimum co-occurrence count for relationships (default: 2)')
    parser.add_argument('--top-n', type=int, default=3, 
                       help='Number of top columns to return per relationship (default: 3)')
    parser.add_argument('--output', type=str, help='Output file path for results')
    parser.add_argument('--solr-url', type=str, 
                       default='http://localhost:8983/solr/MSDyn',
                       help='Solr URL (default: http://localhost:8983/solr/MSDyn)')
    
    args = parser.parse_args()
    
    # Initialize analyzer
    analyzer = MSDynamicsObjectRelationshipAnalyzer(solr_url=args.solr_url)
    
    # Load AL metadata
    if not analyzer.load_object_metadata():
        print("Failed to load AL object metadata. Exiting.")
        sys.exit(1)
    
    # Set default output file
    if not args.output:
        output_dir = get_data_path() / "output" / "msdynamics"
        args.output = str(output_dir / "object_relationship_columns_analysis.json")
    
    # Run analysis
    if args.object1 and args.object2:
        # Analyze specific relationship
        print(f"Analyzing specific AL relationship: {args.object1} <-> {args.object2}")
        result = analyzer.analyze_relationship(args.object1, args.object2, args.top_n)
        
        if result.get('error'):
            print(f"Error: {result['error']}")
        else:
            print(f"\n=== AL Relationship Analysis: {args.object1} <-> {args.object2} ===")
            print(f"Object Types: {result.get('object1_type', 'AL_TABLE')} <-> {result.get('object2_type', 'AL_TABLE')}")
            print(f"Relationship documents: {result.get('relationship_documents', 0)}")
            print(f"Columns with mentions: {result.get('columns_with_mentions', 0)}/{result.get('columns_analyzed', 0)}")
            
            top_cols_key = [k for k in result.keys() if k.startswith('top_') and k.endswith('_columns')]
            if top_cols_key:
                print(f"Top columns for {args.object1}:")
                for col_info in result.get(top_cols_key[0], []):
                    print(f"{col_info['rank']}. {col_info['column_name']} "
                          f"(Score: {col_info['total_weighted_score']:.3f}, "
                          f"Proximity: {col_info['best_proximity']:.3f}, "
                          f"Distance: {col_info['min_distance_chars']} chars)")
    else:
        # Analyze all relationships
        results = analyzer.analyze_all_relationships(args.min_cooccurrence, args.top_n, args.output)
        analyzer.print_results(results)
    
    print("\nMSDynamics AL object relationship column analysis completed!")


if __name__ == "__main__":
    main()
