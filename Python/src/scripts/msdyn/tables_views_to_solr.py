"""
Script to process Microsoft Dynamics 365 BC tables and find their mentions in source code.

This script:
1. Reads configuration from MSDynamics.json
2. Loads tables from the specified tables_views.json file (AL format)
3. Uses ripgrep with whole word matching to search for table mentions in AL source code
4. Stores results with context lines in data/output folder
"""

import json
import sys
from pathlib import Path
from typing import Dict, Set, Any
from collections import defaultdict

# Add src to path for imports
sys.path.append(str(Path(__file__).parent.parent.parent))

from utils.data_utils import (
    get_data_path, 
    get_project_root,
    ensure_dir_exists
)
from utils.python_grep import PythonGrep


class MSDynamicsTablesProcessor:
    """Process Microsoft Dynamics 365 BC tables and find their mentions in source code."""
    
    def __init__(self, config_name: str = "MSDynamics"):
        """Initialize with configuration name."""
        self.config_name = config_name
        self.config = self._load_config()
        self.output_dir = get_data_path('output') / config_name.lower()
        ensure_dir_exists(self.output_dir)
        
        # Initialize Python grep for searching
        self.python_grep = PythonGrep(context_lines=3)
        
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from JSON file."""
        config_path = get_project_root() / "config" / f"{self.config_name}.json"
        
        if not config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")
        
        with open(config_path, 'r') as f:
            return json.load(f)
    
    def _load_tables_views(self) -> Dict[str, Any]:
        """Load tables from the AL tables_views.json file."""
        tables_views_path = Path(self.config['tables_views'])
        
        if not tables_views_path.exists():
            raise FileNotFoundError(f"Tables/views file not found: {tables_views_path}")
        
        with open(tables_views_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def _get_unique_objects(self, tables_views: Dict[str, Any]) -> Set[str]:
        """Extract unique table names from the AL data structure."""
        objects = set()
        
        # In the AL format, each key is a table name
        for table_name, table_info in tables_views.items():
            if table_info.get('object_type') == 'TABLE' and table_name:
                # Add the table name
                objects.add(table_name)
                
                # Also add column names for more comprehensive search
                columns = table_info.get('columns', [])
                for column in columns:
                    if column and len(column) > 2:  # Skip very short column names
                        objects.add(column)
        
        return objects
    
    def _get_table_names_only(self, tables_views: Dict[str, Any]) -> Set[str]:
        """Extract only table names (not columns) from the AL data structure."""
        objects = set()
        
        # In the AL format, each key is a table name
        for table_name, table_info in tables_views.items():
            if table_info.get('object_type') == 'TABLE' and table_name:
                objects.add(table_name)
        
        return objects
    
    def _run_search(self, search_term: str, source_path: str) -> Dict[str, Any]:
        """
        Run ripgrep search with whole word matching.
        
        Args:
            search_term: Term to search for
            source_path: Path to search in
            
        Returns:
            Dictionary with search results
        """
        import subprocess
        import json
        
        try:
            # Build ripgrep command with whole word search and AL file extension
            cmd = [
                'rg',
                '--word-regexp',  # Whole word matching
                '--type-add', 'al:*.al',  # Add AL file type
                '--type', 'al',  # Search only AL files
                '--json',  # JSON output for easy parsing
                '--context', str(self.python_grep.context_lines),  # Context lines
                '--ignore-case',  # Case insensitive search (correct flag)
                search_term,
                source_path
            ]
            
            # Run ripgrep - use bytes to avoid encoding issues
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=False,  # Get raw bytes to handle encoding manually
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode == 0:
                # Decode output with UTF-8 and error handling
                try:
                    stdout_text = result.stdout.decode('utf-8', errors='replace')
                except UnicodeDecodeError:
                    # Fallback to latin-1 which can handle any byte sequence
                    stdout_text = result.stdout.decode('latin-1', errors='replace')
                
                # Parse JSON output and collect context with matches
                matches = []
                all_items = []
                
                # First, collect all JSON items
                for line in stdout_text.strip().split('\n'):
                    if line:
                        try:
                            data = json.loads(line)
                            all_items.append(data)
                        except json.JSONDecodeError:
                            continue
                
                # Process items to associate context with matches
                for i, item in enumerate(all_items):
                    if item.get('type') == 'match':
                        match_data = item
                        file_path = match_data['data']['path']['text']
                        
                        # Collect context_before: look backwards for context lines in same file
                        context_before = []
                        for j in range(i - 1, -1, -1):
                            prev_item = all_items[j]
                            if prev_item.get('type') == 'context':
                                if prev_item['data']['path']['text'] == file_path:
                                    context_line = prev_item['data']['lines']['text'].rstrip('\r\n')
                                    context_before.insert(0, context_line)  # Insert at beginning
                                    if len(context_before) >= self.python_grep.context_lines:
                                        break
                            elif prev_item.get('type') in ['begin', 'end']:
                                break
                        
                        # Collect context_after: look forwards for context lines in same file
                        context_after = []
                        for j in range(i + 1, len(all_items)):
                            next_item = all_items[j]
                            if next_item.get('type') == 'context':
                                if next_item['data']['path']['text'] == file_path:
                                    context_line = next_item['data']['lines']['text'].rstrip('\r\n')
                                    context_after.append(context_line)
                                    if len(context_after) >= self.python_grep.context_lines:
                                        break
                            elif next_item.get('type') in ['match', 'end']:
                                break
                        
                        # Add context to match data
                        match_data['data']['context_before'] = context_before
                        match_data['data']['context_after'] = context_after
                        matches.append(match_data)
                
                # Decode stderr with error handling
                try:
                    stderr_text = result.stderr.decode('utf-8', errors='replace')
                except UnicodeDecodeError:
                    stderr_text = result.stderr.decode('latin-1', errors='replace')
                
                return {
                    'success': True,
                    'stdout': {'success': True, 'matches': matches},
                    'stderr': stderr_text,
                    'returncode': 0
                }
            elif result.returncode == 1:  # No matches found (not an error)
                # Decode stderr with error handling
                try:
                    stderr_text = result.stderr.decode('utf-8', errors='replace')
                except UnicodeDecodeError:
                    stderr_text = result.stderr.decode('latin-1', errors='replace')
                
                return {
                    'success': True,
                    'stdout': {'success': True, 'matches': []},
                    'stderr': stderr_text,
                    'returncode': 0
                }
            else:
                # Decode stderr with error handling
                try:
                    stderr_text = result.stderr.decode('utf-8', errors='replace') if result.stderr else 'Ripgrep search failed'
                except UnicodeDecodeError:
                    stderr_text = result.stderr.decode('latin-1', errors='replace') if result.stderr else 'Ripgrep search failed'
                
                return {
                    'success': False,
                    'stdout': '',
                    'stderr': stderr_text,
                    'returncode': result.returncode
                }
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'stdout': '',
                'stderr': 'Search timeout exceeded',
                'returncode': 1
            }
        except FileNotFoundError:
            return {
                'success': False,
                'stdout': '',
                'stderr': 'Ripgrep not found. Please install ripgrep.',
                'returncode': 1
            }
        except Exception as e:
            return {
                'success': False,
                'stdout': '',
                'stderr': f'Ripgrep error: {str(e)}',
                'returncode': 1
            }
    
    def _format_match_result(self, object_name: str, search_result: Dict[str, Any], object_type: str = "TABLE") -> Dict[str, Any]:
        """Format match results for output."""
        if not search_result or not search_result.get('matches'):
            return {
                'object_name': object_name,
                'object_type': object_type,
                'found': False,
                'total_matches': 0,
                'files': []
            }
        
        matches = search_result['matches']
        files_data = defaultdict(list)
        
        for match in matches:
            file_path = match['data']['path']['text']
            line_number = match['data']['line_number']
            line_text = match['data']['lines']['text']
            
            # Extract context information
            context_before = match['data'].get('context_before', [])
            context_after = match['data'].get('context_after', [])
            
            files_data[file_path].append({
                'line_number': line_number,
                'line_text': line_text,
                'match_start': match['data'].get('submatches', [{}])[0].get('start', 0),
                'match_end': match['data'].get('submatches', [{}])[0].get('end', len(line_text)),
                'context_before': context_before,
                'context_after': context_after
            })
        
        return {
            'object_name': object_name,
            'object_type': object_type,
            'found': True,
            'total_matches': len(matches),
            'total_files': len(files_data),
            'files': [
                {
                    'file_path': file_path,
                    'matches_count': len(file_matches),
                    'matches': file_matches
                }
                for file_path, file_matches in files_data.items()
            ]
        }
    
    def process_all_objects(self, tables_only: bool = False, limit: int = None) -> Dict[str, Any]:
        """
        Process all tables/columns and search for mentions in source code.
        
        Args:
            tables_only: If True, search only table names. If False, search tables and columns.
            limit: If specified, only process the first N objects
        """
        print(f"Loading configuration: {self.config_name}")
        print(f"Output directory: {self.output_dir}")
        
        # Load tables and views
        tables_views = self._load_tables_views()
        
        if tables_only:
            unique_objects = self._get_table_names_only(tables_views)
            search_type = "tables only"
        else:
            unique_objects = self._get_unique_objects(tables_views)
            search_type = "tables and columns"
        
        # Apply limit if specified
        if limit and limit > 0:
            unique_objects = list(unique_objects)[:limit]
            search_type += f" (limited to {limit})"
        else:
            unique_objects = list(unique_objects)
        
        print(f"Found {len(tables_views)} AL tables")
        print(f"Found {len(unique_objects)} unique objects to search ({search_type})")
        
        source_path = self.config['source_code_folder']['path']
        print(f"Searching in: {source_path}")
        print("Using ripgrep with whole word matching for AL files")
        
        # Process each unique object
        results = {
            'config': self.config,
            'search_type': search_type,
            'summary': {
                'total_tables': len(tables_views),
                'total_objects': len(unique_objects),
                'processed_objects': 0,
                'found_objects': 0,
                'total_matches': 0,
                'success_rate': 0.0
            },
            'objects': []
        }
        
        # Determine object type for each object
        table_names = set(tables_views.keys())
        
        for i, obj_name in enumerate(sorted(unique_objects), 1):
            print(f"Processing {i}/{len(unique_objects)}: {obj_name}")
            
            # Determine if this is a table or column
            object_type = "TABLE" if obj_name in table_names else "COLUMN"
            
            # Run search using ripgrep
            search_result = self._run_search(obj_name, source_path)
            
            if search_result['success']:
                formatted_result = self._format_match_result(obj_name, search_result['stdout'], object_type)
            else:
                formatted_result = {
                    'object_name': obj_name,
                    'object_type': object_type,
                    'found': False,
                    'error': search_result.get('error', search_result['stderr']),
                    'total_matches': 0,
                    'files': []
                }
            
            results['objects'].append(formatted_result)
            
            # Update summary
            results['summary']['processed_objects'] += 1
            if formatted_result['found']:
                results['summary']['found_objects'] += 1
                results['summary']['total_matches'] += formatted_result.get('total_matches', 0)
        
        # Calculate success rate
        if results['summary']['total_objects'] > 0:
            results['summary']['success_rate'] = (
                results['summary']['found_objects'] / results['summary']['total_objects'] * 100
            )
        
        return results
    
    def save_results(self, results: Dict[str, Any]) -> None:
        """Save results to output files."""
        # Save main results
        results_file = self.output_dir / 'search_results.json'
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        print(f"Results saved to: {results_file}")
        
        # Save summary report
        summary_file = self.output_dir / 'summary_report.txt'
        with open(summary_file, 'w', encoding='utf-8') as f:
            f.write("Microsoft Dynamics 365 BC Objects Search Results Summary\n")
            f.write("=" * 60 + "\n\n")
            
            summary = results['summary']
            f.write(f"Search type: {results['search_type']}\n")
            f.write(f"Total AL tables: {summary['total_tables']}\n")
            f.write(f"Total objects searched: {summary['total_objects']}\n")
            f.write(f"Objects found in code: {summary['found_objects']}\n")
            f.write(f"Total matches: {summary['total_matches']}\n")
            f.write(f"Success rate: {summary['success_rate']:.1f}%\n\n")
            
            # Separate tables and columns
            table_results = [obj for obj in results['objects'] if obj.get('object_type') == 'TABLE']
            column_results = [obj for obj in results['objects'] if obj.get('object_type') == 'COLUMN']
            
            # List found tables
            found_tables = [obj for obj in table_results if obj['found']]
            if found_tables:
                f.write("AL Tables found in source code:\n")
                f.write("-" * 35 + "\n")
                for obj in found_tables:
                    f.write(f"- {obj['object_name']} ({obj['total_matches']} matches in {obj.get('total_files', 0)} files)\n")
                f.write("\n")
            
            # List found columns
            found_columns = [obj for obj in column_results if obj['found']]
            if found_columns:
                f.write("AL Columns found in source code:\n")
                f.write("-" * 36 + "\n")
                for obj in found_columns[:20]:  # Limit to first 20
                    f.write(f"- {obj['object_name']} ({obj['total_matches']} matches in {obj.get('total_files', 0)} files)\n")
                if len(found_columns) > 20:
                    f.write(f"... and {len(found_columns) - 20} more columns\n")
                f.write("\n")
            
            # List not found tables
            not_found_tables = [obj for obj in table_results if not obj['found']]
            if not_found_tables:
                f.write("AL Tables NOT found in source code:\n")
                f.write("-" * 39 + "\n")
                for obj in not_found_tables:
                    f.write(f"- {obj['object_name']}\n")
        
        print(f"Summary report saved to: {summary_file}")
        
        # Save found objects only (for easier review)
        found_objects = [obj for obj in results['objects'] if obj['found']]
        if found_objects:
            found_file = self.output_dir / 'found_objects.json'
            with open(found_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'summary': {
                        'found_objects': len(found_objects),
                        'total_matches': sum(obj.get('total_matches', 0) for obj in found_objects)
                    },
                    'objects': found_objects
                }, f, indent=2, ensure_ascii=False)
            
            print(f"Found objects saved to: {found_file}")


def main():
    """Main function to run the processor."""
    print("Microsoft Dynamics 365 BC Tables Search Script")
    print("=" * 50)
    
    try:
        print("Creating processor...")
        processor = MSDynamicsTablesProcessor()
        
        print("\nStarting AL tables search...")
        print("=" * 50)
        
        # Process all objects (tables only by default for better performance)
        # Set tables_only=False to search tables and columns
        results = processor.process_all_objects(tables_only=True)
        
        # Save results
        processor.save_results(results)
        
        print("\n" + "=" * 50)
        print("Search completed successfully!")
        print("Summary:")
        print(f"- Total AL tables: {results['summary']['total_tables']}")
        print(f"- Total objects searched: {results['summary']['total_objects']}")
        print(f"- Found in code: {results['summary']['found_objects']}")
        print(f"- Total matches: {results['summary']['total_matches']}")
        print(f"- Success rate: {results['summary']['success_rate']:.1f}%")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    print("Running AL tables search script...")
    main()
