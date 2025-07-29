"""
Script to analyze MSDynamics AL object columns used in relations with proximity-based weighting.

This script:
1. Loads AL object metadata from tables_views.json
2. For each object, finds documents in Solr where the object appears
3. Searches for column mentions in relation to the object
4. Weights mentions based on proximity and context:
   - line_text & context_after = 3x weight (more important)
   - context_before = 1x weight (less important)
5. Calculates proximity scores (closer to object = higher score)
6. Returns top columns used in relations for each object
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

from utils.data_utils import get_data_path


class MSDynamicsRelationalColumnsAnalyzer:
    """Analyzes MSDynamics AL object columns used in relations with proximity weighting."""
    
    def __init__(self, solr_url: str = "http://localhost:8983/solr/MSDyn"):
        self.solr_url = solr_url
        self.object_columns = {}
        self.results = {}
        
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
    
    def calculate_proximity_score(self, text: str, object_name: str, column_name: str) -> Dict[str, Any]:
        """Calculate proximity score between object and column mentions."""
        if not text:
            return {'score': 0, 'mentions': 0, 'min_distance': float('inf')}
        
        text_upper = text.upper()
        # Use case-insensitive search but preserve original object case
        object_pattern = r'\b' + re.escape(object_name.upper()) + r'\b'
        column_pattern = r'\b' + re.escape(column_name) + r'\b'
        
        # Find all object positions
        object_matches = list(re.finditer(object_pattern, text_upper))
        column_matches = list(re.finditer(column_pattern, text_upper))
        
        if not object_matches or not column_matches:
            return {'score': 0, 'mentions': len(column_matches), 'min_distance': float('inf')}
        
        # Calculate minimum distance between any object and column mention
        min_distance = float('inf')
        for obj_match in object_matches:
            obj_pos = obj_match.start()
            for col_match in column_matches:
                col_pos = col_match.start()
                distance = abs(obj_pos - col_pos)
                min_distance = min(min_distance, distance)
        
        # Convert distance to proximity score (closer = higher score)
        # Use exponential decay: score = e^(-distance/100)
        import math
        if min_distance == float('inf'):
            proximity_score = 0
        else:
            proximity_score = math.exp(-min_distance / 100.0)
        
        return {
            'score': proximity_score,
            'mentions': len(column_matches),
            'min_distance': min_distance if min_distance != float('inf') else None
        }
    
    def extract_relational_column_mentions(self, object_name: str, columns: List[str], 
                                         context_before: List[str], line_text: str, 
                                         context_after: List[str]) -> Dict[str, Dict]:
        """Extract column mentions with proximity and context weighting."""
        column_scores = {}
        
        # Combine all text with field markers for cross-field proximity calculation
        all_text = ""
        field_positions = {}
        
        # Build combined text with position tracking
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
        
        # Find object and column positions in combined text
        if not all_text:
            return column_scores
            
        all_text_upper = all_text.upper()
        object_pattern = r'\b' + re.escape(object_name.upper()) + r'\b'
        
        # Find all object positions
        object_matches = list(re.finditer(object_pattern, all_text_upper))
        if not object_matches:
            return column_scores
        
        # Process each column
        for column in columns:
            column_pattern = r'\b' + re.escape(column) + r'\b'
            column_matches = list(re.finditer(column_pattern, all_text_upper))
            
            if not column_matches:
                continue
            
            # Calculate proximity between object and column mentions
            min_distance = float('inf')
            best_proximity = 0
            
            for obj_match in object_matches:
                obj_pos = obj_match.start()
                for col_match in column_matches:
                    col_pos = col_match.start()
                    distance = abs(obj_pos - col_pos)
                    min_distance = min(min_distance, distance)
            
            if min_distance != float('inf'):
                import math
                proximity_score = math.exp(-min_distance / 100.0)
                best_proximity = proximity_score
            
            # Now calculate weighted scores by field
            column_scores[column] = {
                'total_weighted_score': 0,
                'total_mentions': 0,
                'context_before_score': 0,
                'line_text_score': 0,
                'context_after_score': 0,
                'best_proximity': best_proximity,
                'min_distance': min_distance if min_distance != float('inf') else None
            }
            
            # Calculate mentions and scores per field
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
                    # Use the best proximity score for all mentions in this field
                    field_score = best_proximity * field_mentions * weight
                    column_scores[column]['total_weighted_score'] += field_score
                    column_scores[column]['total_mentions'] += field_mentions
                    column_scores[column][f'{field_name}_score'] += field_score
        
        return column_scores
    
    def analyze_object_relational_columns(self, object_name: str, top_n: int = 5) -> Dict[str, Any]:
        """Analyze relational column usage for a specific AL object."""
        print(f"\nAnalyzing relational columns for AL object: {object_name}")
        
        # Case-insensitive lookup for user input
        actual_object_name = None
        for obj in self.object_columns.keys():
            if obj.upper() == object_name.upper():
                actual_object_name = obj
                break
        
        if not actual_object_name:
            return {'error': f'AL object {object_name} not found in metadata'}
        
        columns = self.object_columns[actual_object_name]
        documents = self.search_object_documents(actual_object_name)
        
        if not documents:
            return {'error': f'No documents found for {actual_object_name} in Solr'}
        
        # Aggregate column scores across all documents
        aggregated_scores = defaultdict(lambda: {
            'total_weighted_score': 0,
            'total_mentions': 0,
            'context_before_score': 0,
            'line_text_score': 0,
            'context_after_score': 0,
            'best_proximity': 0,
            'min_distance': float('inf'),
            'documents_found_in': 0
        })
        
        # Process each document
        for doc in documents:
            context_before = doc.get('context_before', [])
            line_text = doc.get('line_text', '')
            context_after = doc.get('context_after', [])
            
            doc_column_scores = self.extract_relational_column_mentions(
                actual_object_name, columns, context_before, line_text, context_after
            )
            
            # Aggregate scores
            for column, scores in doc_column_scores.items():
                agg = aggregated_scores[column]
                agg['total_weighted_score'] += scores['total_weighted_score']
                agg['total_mentions'] += scores['total_mentions']
                agg['context_before_score'] += scores['context_before_score']
                agg['line_text_score'] += scores['line_text_score']
                agg['context_after_score'] += scores['context_after_score']
                agg['best_proximity'] = max(agg['best_proximity'], scores['best_proximity'])
                agg['documents_found_in'] += 1
                
                if scores['min_distance'] is not None:
                    agg['min_distance'] = min(agg['min_distance'], scores['min_distance'])
        
        # Clean up infinite distances and sort results
        for column_data in aggregated_scores.values():
            if column_data['min_distance'] == float('inf'):
                column_data['min_distance'] = None
        
        # Get top N columns by weighted score
        sorted_columns = sorted(aggregated_scores.items(), 
                              key=lambda x: x[1]['total_weighted_score'], 
                              reverse=True)[:top_n]
        
        result = {
            'object_name': actual_object_name,
            'object_type': 'AL_TABLE',
            'total_columns': len(columns),
            'documents_analyzed': len(documents),
            'columns_with_relational_usage': len(aggregated_scores),
            f'top_{top_n}_relational_columns': []
        }
        
        for i, (column, scores) in enumerate(sorted_columns, 1):
            result[f'top_{top_n}_relational_columns'].append({
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
    
    def analyze_all_objects(self, top_n: int = 5, output_file: str = None) -> Dict[str, Any]:
        """Analyze relational columns for all AL objects."""
        print("Starting relational column analysis for all AL objects...")
        
        all_results = {}
        total_objects = len(self.object_columns)
        
        for i, object_name in enumerate(self.object_columns.keys(), 1):
            print(f"Progress: {i}/{total_objects} - {object_name}")
            result = self.analyze_object_relational_columns(object_name, top_n)
            all_results[object_name] = result
        
        # Generate summary statistics
        summary = self._generate_summary(all_results, top_n)
        
        # Save results if output file specified
        if output_file:
            self._save_results(all_results, summary, output_file, top_n)
        
        return {
            'results': all_results,
            'summary': summary
        }
    
    def _generate_summary(self, results: Dict[str, Any], top_n: int) -> Dict[str, Any]:
        """Generate summary statistics from relational analysis results."""
        total_objects = len(results)
        objects_with_relations = sum(1 for r in results.values() 
                                   if not r.get('error') and r.get('columns_with_relational_usage', 0) > 0)
        
        # Collect all top relational columns across all objects
        all_relational_columns = []
        for obj_result in results.values():
            if not obj_result.get('error') and obj_result.get(f'top_{top_n}_relational_columns'):
                for col_info in obj_result[f'top_{top_n}_relational_columns']:
                    all_relational_columns.append({
                        'object': obj_result['object_name'],
                        'column': col_info['column_name'],
                        'weighted_score': col_info['total_weighted_score'],
                        'proximity': col_info['best_proximity'],
                        'rank': col_info['rank']
                    })
        
        # Find globally most relational columns
        global_column_scores = defaultdict(float)
        global_column_proximity = defaultdict(float)
        for col_info in all_relational_columns:
            global_column_scores[col_info['column']] += col_info['weighted_score']
            global_column_proximity[col_info['column']] = max(
                global_column_proximity[col_info['column']], 
                col_info['proximity']
            )
        
        top_global_columns = sorted(global_column_scores.items(), 
                                  key=lambda x: x[1], reverse=True)[:10]
        
        return {
            'total_objects_analyzed': total_objects,
            'objects_with_relational_usage': objects_with_relations,
            'success_rate': f"{objects_with_relations}/{total_objects} ({objects_with_relations/total_objects*100:.1f}%)",
            'total_relational_columns_found': len(all_relational_columns),
            'weighting_scheme': 'line_text=3x, context_after=3x, context_before=1x',
            'proximity_algorithm': 'exponential_decay(distance/100)',
            'al_object_type': 'Microsoft Dynamics 365 Business Central AL Tables',
            'top_10_global_relational_columns': [
                {
                    'column_name': col, 
                    'total_weighted_score': round(score, 3),
                    'best_proximity': round(global_column_proximity[col], 3)
                }
                for col, score in top_global_columns
            ]
        }
    
    def _save_results(self, results: Dict[str, Any], summary: Dict[str, Any], 
                     output_file: str, top_n: int):
        """Save relational analysis results to file."""
        output_data = {
            'analysis_type': 'msdynamics_relational_columns_analysis',
            'object_type': 'AL_TABLE',
            'weighting_scheme': 'line_text=3x, context_after=3x, context_before=1x',
            'proximity_algorithm': 'exponential_decay(-distance/100)',
            'top_n_per_object': top_n,
            'timestamp': str(Path().cwd()),
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
        print("MSDYNAMICS AL RELATIONAL COLUMNS ANALYSIS RESULTS")
        print("="*80)
        
        print("\nSUMMARY:")
        print(f"Total AL Objects Analyzed: {summary.get('total_objects_analyzed', 0)}")
        print(f"Objects with Relational Usage: {summary.get('objects_with_relational_usage', 0)}")
        print(f"Success Rate: {summary.get('success_rate', 'N/A')}")
        print(f"Total Relational Columns Found: {summary.get('total_relational_columns_found', 0)}")
        print(f"Weighting: {summary.get('weighting_scheme', 'N/A')}")
        print(f"Proximity: {summary.get('proximity_algorithm', 'N/A')}")
        print(f"AL Object Type: {summary.get('al_object_type', 'N/A')}")
        
        print("\nTOP 10 GLOBAL RELATIONAL COLUMNS:")
        for i, col_info in enumerate(summary.get('top_10_global_relational_columns', [])[:10], 1):
            print(f"{i:2d}. {col_info['column_name']:<20} "
                  f"(Score: {col_info['total_weighted_score']:.3f}, "
                  f"Proximity: {col_info['best_proximity']:.3f})")
        
        print("\nDETAILED RESULTS BY AL OBJECT:")
        print("-"*80)
        
        for obj_name, obj_result in detailed_results.items():
            if obj_result.get('error'):
                print(f"\n{obj_name}: {obj_result['error']}")
                continue
            
            print(f"\n{obj_name} (AL Table):")
            print(f"  Documents analyzed: {obj_result.get('documents_analyzed', 0)}")
            print(f"  Columns with relational usage: {obj_result.get('columns_with_relational_usage', 0)}/{obj_result.get('total_columns', 0)}")
            
            # Get the top columns key dynamically
            top_cols_key = [k for k in obj_result.keys() if k.startswith('top_') and k.endswith('_relational_columns')]
            if top_cols_key:
                top_columns = obj_result.get(top_cols_key[0], [])
                if top_columns:
                    print("  Top relational columns:")
                    for col_info in top_columns:
                        print(f"    {col_info['rank']}. {col_info['column_name']:<15} "
                              f"(Score: {col_info['total_weighted_score']:.3f}, "
                              f"Proximity: {col_info['best_proximity']:.3f}, "
                              f"Distance: {col_info['min_distance_chars']} chars)")
                else:
                    print("  No relational column usage found")


def main():
    """Main function to run the MSDynamics relational columns analysis."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Analyze columns used in relations for MSDynamics AL objects')
    parser.add_argument('--object', type=str, help='Analyze specific AL object only')
    parser.add_argument('--top-n', type=int, default=5, help='Number of top columns to return per object (default: 5)')
    parser.add_argument('--output', type=str, help='Output file path for results')
    parser.add_argument('--solr-url', type=str, 
                       default='http://localhost:8983/solr/MSDyn',
                       help='Solr URL (default: http://localhost:8983/solr/MSDyn)')
    
    args = parser.parse_args()
    
    # Initialize analyzer
    analyzer = MSDynamicsRelationalColumnsAnalyzer(solr_url=args.solr_url)
    
    # Load AL metadata
    if not analyzer.load_object_metadata():
        print("Failed to load AL object metadata. Exiting.")
        sys.exit(1)
    
    # Set default output file
    if not args.output:
        output_dir = get_data_path() / "output" / "msdynamics"
        args.output = str(output_dir / "relational_columns_analysis.json")
    
    # Run analysis
    if args.object:
        # Analyze single object
        print(f"Analyzing relational columns for AL object: {args.object}")
        result = analyzer.analyze_object_relational_columns(args.object, args.top_n)
        
        if result.get('error'):
            print(f"Error: {result['error']}")
        else:
            print(f"\n=== Relational Columns for {args.object} ===")
            print(f"Object Type: {result.get('object_type', 'AL_TABLE')}")
            print(f"Documents analyzed: {result.get('documents_analyzed', 0)}")
            print(f"Columns with relational usage: {result.get('columns_with_relational_usage', 0)}/{result.get('total_columns', 0)}")
            
            top_cols_key = [k for k in result.keys() if k.startswith('top_') and k.endswith('_relational_columns')]
            if top_cols_key:
                for col_info in result.get(top_cols_key[0], []):
                    print(f"{col_info['rank']}. {col_info['column_name']} "
                          f"(Score: {col_info['total_weighted_score']:.3f}, "
                          f"Proximity: {col_info['best_proximity']:.3f}, "
                          f"Distance: {col_info['min_distance_chars']} chars)")
    else:
        # Analyze all objects
        results = analyzer.analyze_all_objects(args.top_n, args.output)
        analyzer.print_results(results)
    
    print("\nMSDynamics AL relational columns analysis completed!")


if __name__ == "__main__":
    main()
