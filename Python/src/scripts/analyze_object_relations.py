"""
Script to analyze Oracle DB object relationships through Solr search results.

This script:
1. Queries Solr for all Oracle database objects
2. Loads column information for each object from tables_views.json
3. Finds relationships between objects based on column name matches
4. Calculates relationship strength statistics
5. Outputs relationship analysis results
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any, Tuple, Set
from collections import defaultdict, Counter
import requests
import re

# Add src to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from utils.data_utils import get_data_path, get_project_root


class ObjectRelationAnalyzer:
    """Analyze relationships between Oracle database objects."""
    
    def __init__(self, solr_url: str, core_name: str = "oracle_db_search"):
        """Initialize the analyzer."""
        self.solr_url = solr_url.rstrip('/')
        self.core_name = core_name
        self.solr_core_url = f"{self.solr_url}/solr/{core_name}"
        self.object_columns = {}
        self.objects_in_solr = set()
        
    def load_object_metadata(self, tables_views_file: str) -> None:
        """Load object column information from tables_views.json."""
        print(f"Loading object metadata from: {tables_views_file}")
        
        with open(tables_views_file, 'r') as f:
            tables_views_data = json.load(f)
        
        # Build column mapping from flat structure
        object_columns = {}
        for item in tables_views_data:
            object_name = item.get('object_name', '')
            column_name = item.get('column_name', '')
            
            if object_name and column_name:
                if object_name not in object_columns:
                    object_columns[object_name] = []
                object_columns[object_name].append(column_name)
        
        self.object_columns = object_columns
        print(f"Loaded column data for {len(self.object_columns)} objects")
        
        # Print sample for debugging
        if self.object_columns:
            sample_object = list(self.object_columns.keys())[0]
            sample_columns = self.object_columns[sample_object][:5]
            print(f"Sample: {sample_object} has columns: {sample_columns}")
    
    def get_objects_from_solr(self) -> Set[str]:
        """Get all unique object names from Solr."""
        try:
            query_url = f"{self.solr_core_url}/select"
            params = {
                'q': '*:*',
                'rows': 0,
                'facet': 'true',
                'facet.field': 'object_name',
                'facet.limit': 1000
            }
            
            response = requests.get(query_url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                facets = data.get('facet_counts', {}).get('facet_fields', {})
                object_names = facets.get('object_name', [])
                
                # Extract object names (every other element in the facet list)
                objects = set(object_names[i] for i in range(0, len(object_names), 2))
                self.objects_in_solr = objects
                print(f"Found {len(objects)} unique objects in Solr")
                return objects
            else:
                print(f"Error querying Solr: {response.text}")
                return set()
                
        except Exception as e:
            print(f"Error getting objects from Solr: {e}")
            return set()
    
    def search_object_cooccurrence(self, object1: str, object2: str) -> Dict[str, Any]:
        """Search for documents where both objects appear in all_text."""
        try:
            query_url = f"{self.solr_core_url}/select"
            params = {
                'q': f'all_text:"{object1}" AND all_text:"{object2}"',
                'rows': 100,
                'fl': 'id,object_name,file_path,line_text,all_text'
            }
            
            response = requests.get(query_url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                docs = data.get('response', {}).get('docs', [])
                return {
                    'success': True,
                    'count': data.get('response', {}).get('numFound', 0),
                    'documents': docs
                }
            else:
                return {'success': False, 'error': response.text}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def find_column_matches(self, object1: str, object2: str) -> Dict[str, Any]:
        """Find matching column names between two objects."""
        cols1 = set(self.object_columns.get(object1, []))
        cols2 = set(self.object_columns.get(object2, []))
        
        if not cols1 or not cols2:
            return {
                'object1_columns': len(cols1),
                'object2_columns': len(cols2),
                'exact_matches': [],
                'match_score': 0.0
            }
        
        # Find exact matches only - no similarity analysis
        exact_matches = list(cols1.intersection(cols2))
        
        # Calculate match score based only on exact matches
        total_columns = len(cols1) + len(cols2)
        match_score = (len(exact_matches) * 2) / total_columns if total_columns > 0 else 0
        
        return {
            'object1_columns': len(cols1),
            'object2_columns': len(cols2),
            'exact_matches': exact_matches,
            'match_score': round(match_score, 3)
        }
    
    def search_column_cooccurrence(self, object1: str, object2: str, column1: str, column2: str) -> Dict[str, Any]:
        """Search for documents where both object columns appear together."""
        try:
            query_url = f"{self.solr_core_url}/select"
            params = {
                'q': f'all_text:"{column1}" AND all_text:"{column2}"',
                'rows': 100,
                'fl': 'id,object_name,file_path,line_text,line_number',
                'hl': 'true',
                'hl.fl': 'all_text',
                'hl.simple.pre': '<mark>',
                'hl.simple.post': '</mark>'
            }
            
            response = requests.get(query_url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'success': True,
                    'count': data.get('response', {}).get('numFound', 0),
                    'documents': data.get('response', {}).get('docs', []),
                    'highlighting': data.get('highlighting', {})
                }
            else:
                return {'success': False, 'error': response.text}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def search_column_in_text(self, object_name: str, column_name: str) -> Dict[str, Any]:
        """Search for specific column usage in the context of an object."""
        try:
            query_url = f"{self.solr_core_url}/select"
            params = {
                'q': f'object_name:"{object_name}" AND all_text:"{column_name}"',
                'rows': 50,
                'fl': 'id,object_name,file_path,line_text,line_number',
                'hl': 'true',
                'hl.fl': 'all_text',
                'hl.simple.pre': '<mark>',
                'hl.simple.post': '</mark>'
            }
            
            response = requests.get(query_url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'success': True,
                    'count': data.get('response', {}).get('numFound', 0),
                    'documents': data.get('response', {}).get('docs', []),
                    'highlighting': data.get('highlighting', {})
                }
            else:
                return {'success': False, 'error': response.text}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def analyze_relationship(self, object1: str, object2: str) -> Dict[str, Any]:
        """Comprehensive relationship analysis between two objects."""
        print(f"\nAnalyzing relationship: {object1} <-> {object2}")
        
        # Check if both objects exist in our data
        if object1 not in self.object_columns:
            return {'error': f'Object {object1} not found in metadata'}
        if object2 not in self.object_columns:
            return {'error': f'Object {object2} not found in metadata'}
        
        # Search for co-occurrence in Solr
        cooccurrence = self.search_object_cooccurrence(object1, object2)
        
        # Find column matches
        column_analysis = self.find_column_matches(object1, object2)
        
        # Search for column usage and co-occurrence in Solr
        column_usage = {}
        column_cooccurrence = {}
        
        if column_analysis['exact_matches']:
            for col in column_analysis['exact_matches'][:5]:  # Limit to first 5 matches
                # Individual column usage
                usage1 = self.search_column_in_text(object1, col)
                usage2 = self.search_column_in_text(object2, col)
                column_usage[col] = {
                    'object1_usage': usage1.get('count', 0),
                    'object2_usage': usage2.get('count', 0)
                }
                
                # Column co-occurrence in documents
                cooccur = self.search_column_cooccurrence(object1, object2, col, col)
                column_cooccurrence[col] = cooccur.get('count', 0)
        
        # Also check cross-column relationships (object1 columns with object2 columns)
        cols1 = self.object_columns.get(object1, [])
        cols2 = self.object_columns.get(object2, [])
        
        cross_column_relationships = {}
        max_cross_relationships = 10  # Limit to avoid too many queries
        processed_cross = 0
        
        for col1 in cols1[:5]:  # Limit object1 columns
            for col2 in cols2[:5]:  # Limit object2 columns
                if processed_cross >= max_cross_relationships:
                    break
                if col1 != col2:  # Don't check same column names
                    cross_cooccur = self.search_column_cooccurrence(object1, object2, col1, col2)
                    if cross_cooccur.get('count', 0) > 0:
                        cross_column_relationships[f"{col1}__{col2}"] = {
                            'object1_column': col1,
                            'object2_column': col2,
                            'cooccurrence_count': cross_cooccur.get('count', 0)
                        }
                    processed_cross += 1
            if processed_cross >= max_cross_relationships:
                break
        
        # Calculate relationship strength
        relationship_strength = self._calculate_relationship_strength(
            cooccurrence.get('count', 0),
            column_analysis['match_score'],
            len(column_analysis['exact_matches']),
            cross_column_relationships
        )
        
        return {
            'object1': object1,
            'object2': object2,
            'cooccurrence_count': cooccurrence.get('count', 0),
            'column_analysis': column_analysis,
            'column_usage': column_usage,
            'column_cooccurrence': column_cooccurrence,
            'cross_column_relationships': cross_column_relationships,
            'relationship_strength': relationship_strength,
            'success': True
        }
    
    def _calculate_relationship_strength(self, cooccurrence: int, column_score: float, exact_matches: int, cross_column_relationships: Dict = None) -> Dict[str, Any]:
        """Calculate overall relationship strength."""
        # Normalize scores
        cooccurrence_score = min(cooccurrence / 10, 1.0)  # Cap at 10 co-occurrences
        column_match_score = min(exact_matches / 5, 1.0)  # Cap at 5 exact matches
        
        # Cross-column relationship bonus
        cross_column_score = 0
        if cross_column_relationships:
            cross_column_score = min(len(cross_column_relationships) / 10, 0.2)
        
        # Weighted combination
        overall_score = (cooccurrence_score * 0.4 + column_score * 0.3 + column_match_score * 0.2 + cross_column_score * 0.1)
        
        # Determine relationship level
        if overall_score >= 0.7:
            level = "STRONG"
        elif overall_score >= 0.4:
            level = "MODERATE"
        elif overall_score >= 0.1:
            level = "WEAK"
        else:
            level = "MINIMAL"
        
        return {
            'overall_score': round(overall_score, 3),
            'level': level,
            'components': {
                'cooccurrence_score': round(cooccurrence_score, 3),
                'column_score': round(column_score, 3),
                'exact_match_score': round(column_match_score, 3),
                'cross_column_score': round(cross_column_score, 3)
            }
        }
    
    def find_all_relationships(self, min_score: float = 0.1) -> List[Dict[str, Any]]:
        """Find all significant relationships between objects."""
        print("Finding all object relationships...")
        
        objects = list(self.objects_in_solr.intersection(set(self.object_columns.keys())))
        relationships = []
        
        total_pairs = len(objects) * (len(objects) - 1) // 2
        processed = 0
        
        for i, obj1 in enumerate(objects):
            for j, obj2 in enumerate(objects[i+1:], i+1):
                processed += 1
                if processed % 10 == 0:
                    print(f"Progress: {processed}/{total_pairs} pairs analyzed")
                
                result = self.analyze_relationship(obj1, obj2)
                if (result.get('success') and 
                    result.get('relationship_strength', {}).get('overall_score', 0) >= min_score):
                    relationships.append(result)
        
        # Sort by relationship strength
        relationships.sort(key=lambda x: x.get('relationship_strength', {}).get('overall_score', 0), reverse=True)
        
        return relationships
    
    def generate_report(self, relationships: List[Dict[str, Any]], output_file: str = None) -> str:
        """Generate a comprehensive relationship report."""
        report_lines = [
            "# Oracle Database Object Relationship Analysis Report",
            f"Generated on: {Path().cwd()}",
            f"Total relationships analyzed: {len(relationships)}",
            "",
            "## Summary Statistics",
            ""
        ]
        
        # Statistics
        if relationships:
            levels = Counter(r.get('relationship_strength', {}).get('level', 'UNKNOWN') for r in relationships)
            report_lines.extend([
                f"- Strong relationships: {levels.get('STRONG', 0)}",
                f"- Moderate relationships: {levels.get('MODERATE', 0)}",
                f"- Weak relationships: {levels.get('WEAK', 0)}",
                f"- Minimal relationships: {levels.get('MINIMAL', 0)}",
                ""
            ])
        
        # Top relationships
        report_lines.extend([
            "## Top Relationships",
            ""
        ])
        
        for i, rel in enumerate(relationships[:20], 1):
            strength = rel.get('relationship_strength', {})
            column_analysis = rel.get('column_analysis', {})
            
            report_lines.extend([
                f"### {i}. {rel['object1']} ↔ {rel['object2']}",
                f"**Relationship Strength:** {strength.get('level', 'UNKNOWN')} ({strength.get('overall_score', 0)})",
                f"**Co-occurrence Count:** {rel.get('cooccurrence_count', 0)}",
                f"**Column Matches:** {len(column_analysis.get('exact_matches', []))} exact",
                ""
            ])
            
            if column_analysis.get('exact_matches'):
                report_lines.append("**Exact Column Matches:**")
                for col in column_analysis['exact_matches'][:5]:
                    usage = rel.get('column_usage', {}).get(col, {})
                    report_lines.append(f"- `{col}` (used {usage.get('object1_usage', 0)} + {usage.get('object2_usage', 0)} times)")
                report_lines.append("")
        
        report_content = "\n".join(report_lines)
        
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(report_content)
            print(f"Report saved to: {output_file}")
        
        return report_content


def main():
    """Main function to analyze object relationships."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Analyze Oracle DB object relationships via Solr')
    parser.add_argument('--config', default='oracle_db_example_to_solr', 
                       help='Configuration name (default: oracle_db_example_to_solr)')
    parser.add_argument('--solr-url', default='http://localhost:8983', 
                       help='Solr URL (default: http://localhost:8983)')
    parser.add_argument('--core', default='oracle_db_search', 
                       help='Solr core name (default: oracle_db_search)')
    parser.add_argument('--object1', help='First object to analyze (optional)')
    parser.add_argument('--object2', help='Second object to analyze (optional)')
    parser.add_argument('--min-score', type=float, default=0.1,
                       help='Minimum relationship score (default: 0.1)')
    parser.add_argument('--output', help='Output file for report')
    
    args = parser.parse_args()
    
    try:
        # Initialize analyzer
        analyzer = ObjectRelationAnalyzer(args.solr_url, args.core)
        
        # Load configuration and metadata
        config_file = get_project_root() / "config" / f"{args.config}.json"
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        tables_views_file = Path(config['tables_views'])
        analyzer.load_object_metadata(str(tables_views_file))
        
        # Get objects from Solr
        analyzer.get_objects_from_solr()
        
        if args.object1 and args.object2:
            # Analyze specific relationship
            print(f"Analyzing specific relationship: {args.object1} <-> {args.object2}")
            result = analyzer.analyze_relationship(args.object1, args.object2)
            
            if result.get('success'):
                print(f"\n=== Relationship Analysis Results ===")
                print(f"Objects: {result['object1']} ↔ {result['object2']}")
                print(f"Co-occurrence in Solr: {result['cooccurrence_count']} documents")
                
                col_analysis = result['column_analysis']
                print(f"Column Analysis:")
                print(f"  - {result['object1']}: {col_analysis['object1_columns']} columns")
                print(f"  - {result['object2']}: {col_analysis['object2_columns']} columns")
                print(f"  - Exact matches: {len(col_analysis['exact_matches'])}")
                print(f"  - Match score: {col_analysis['match_score']}")
                
                if col_analysis['exact_matches']:
                    print(f"  - Exact column matches: {', '.join(col_analysis['exact_matches'][:5])}")
                
                strength = result['relationship_strength']
                print(f"Relationship Strength: {strength['level']} ({strength['overall_score']})")
                
                print(f"\nColumn Usage in Code:")
                for col, usage in result.get('column_usage', {}).items():
                    print(f"  - {col}: {usage['object1_usage']} + {usage['object2_usage']} occurrences")
            else:
                print(f"Error: {result.get('error', 'Unknown error')}")
        
        else:
            # Find all relationships
            print("Finding all significant relationships...")
            relationships = analyzer.find_all_relationships(args.min_score)
            
            print(f"\nFound {len(relationships)} significant relationships")
            
            # Generate report
            output_file = args.output
            if not output_file:
                output_dir = get_data_path('output') / args.config
                output_dir.mkdir(exist_ok=True)
                output_file = output_dir / 'object_relationships_report.md'
            
            report = analyzer.generate_report(relationships, str(output_file))
            
            # Print summary
            print(f"\n=== Top 5 Relationships ===")
            for i, rel in enumerate(relationships[:5], 1):
                strength = rel.get('relationship_strength', {})
                print(f"{i}. {rel['object1']} ↔ {rel['object2']} "
                      f"({strength.get('level', 'UNKNOWN')}: {strength.get('overall_score', 0)})")
        
        print("\nObject relationship analysis completed!")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
