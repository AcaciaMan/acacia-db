"""
Script to process Oracle DB tables/views and find their mentions in source code.

This script:
1. Reads configuration from oracle_db_example_to_solr.json
2. Loads tables/views from the specified JSON file
3. Uses ripgrep to search for object mentions in source code
4. Stores results with context (+- 50 lines) in data/output folder
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Set, Any
from collections import defaultdict

# Add src to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from utils.data_utils import (
    get_data_path, 
    get_project_root,
    ensure_dir_exists
)
from utils.python_grep import PythonGrep


class TableViewsProcessor:
    """Process Oracle tables/views and find their mentions in source code."""
    
    def __init__(self, config_name: str = "oracle_db_example_to_solr"):
        """Initialize with configuration name."""
        self.config_name = config_name
        self.config = self._load_config()
        self.output_dir = get_data_path('output') / config_name
        ensure_dir_exists(self.output_dir)
        
        # Initialize Python grep as fallback
        self.python_grep = PythonGrep(context_lines=50)
        self.use_ripgrep = self._check_ripgrep_available()
        
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from JSON file."""
        config_path = get_project_root() / "config" / f"{self.config_name}.json"
        
        if not config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")
        
        with open(config_path, 'r') as f:
            return json.load(f)
    
    def _load_tables_views(self) -> List[Dict[str, Any]]:
        """Load tables and views from JSON file."""
        tables_views_path = Path(self.config['tables_views'])
        
        if not tables_views_path.exists():
            raise FileNotFoundError(f"Tables/views file not found: {tables_views_path}")
        
        with open(tables_views_path, 'r') as f:
            return json.load(f)
    
    def _get_unique_objects(self, tables_views: List[Dict[str, Any]]) -> Set[str]:
        """Extract unique table/view names from the data."""
        objects = set()
        
        for item in tables_views:
            object_name = item.get('object_name', '')
            if object_name:
                objects.add(object_name)
        
        return objects
    
    def _check_ripgrep_available(self) -> bool:
        """Check if ripgrep is available on the system."""
        try:
            result = subprocess.run(
                ['rg', '--version'],
                capture_output=True,
                text=True
            )
            return result.returncode == 0
        except FileNotFoundError:
            return False
    
    def _run_search(self, search_term: str, source_path: str) -> Dict[str, Any]:
        """
        Run search using ripgrep or Python fallback.
        
        Args:
            search_term: Term to search for
            source_path: Path to search in
            
        Returns:
            Dictionary with search results
        """
        if self.use_ripgrep:
            return self._run_ripgrep(search_term, source_path)
        else:
            print("  Using Python grep (ripgrep not available)")
            return self._run_python_grep(search_term, source_path)
    
    def _run_python_grep(self, search_term: str, source_path: str) -> Dict[str, Any]:
        """Run Python-based search as fallback."""
        try:
            result = self.python_grep.search(search_term, source_path)
            if result['success']:
                # Convert to format compatible with ripgrep parser
                stdout_lines = []
                for match in result['matches']:
                    stdout_lines.append(json.dumps(match))
                
                return {
                    'success': True,
                    'stdout': '\n'.join(stdout_lines),
                    'stderr': '',
                    'returncode': 0
                }
            else:
                return {
                    'success': False,
                    'stdout': '',
                    'stderr': 'Python grep search failed',
                    'returncode': 1
                }
        except Exception as e:
            return {
                'success': False,
                'stdout': '',
                'stderr': f'Python grep error: {str(e)}',
                'returncode': 1
            }
    
    def _run_ripgrep(self, search_term: str, source_path: str) -> Dict[str, Any]:
        """
        Run ripgrep to search for term in source code with context.
        
        Args:
            search_term: Term to search for
            source_path: Path to search in
            
        Returns:
            Dictionary with search results
        """
        try:
            # Ripgrep command with context lines and JSON output
            cmd = [
                'rg',
                '--json',
                '--context', '50',  # 50 lines before and after
                '--ignore-case',
                search_term,
                source_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding='utf-8'
            )
            
            return {
                'success': result.returncode == 0,
                'stdout': result.stdout,
                'stderr': result.stderr,
                'returncode': result.returncode
            }
            
        except FileNotFoundError:
            return {
                'success': False,
                'error': 'ripgrep (rg) not found. Please install ripgrep.',
                'stdout': '',
                'stderr': 'ripgrep not installed',
                'returncode': -1
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'stdout': '',
                'stderr': str(e),
                'returncode': -1
            }
    
    def _parse_ripgrep_json(self, rg_output: str) -> List[Dict[str, Any]]:
        """Parse ripgrep JSON output into structured data with context."""
        all_entries = []
        
        # Parse all entries (matches and context)
        for line in rg_output.strip().split('\n'):
            if not line:
                continue
                
            try:
                data = json.loads(line)
                if data.get('type') in ['match', 'context']:
                    all_entries.append(data)
            except json.JSONDecodeError:
                continue
        
        # Group entries by file and organize matches with their context
        matches_with_context = []
        
        i = 0
        while i < len(all_entries):
            entry = all_entries[i]
            
            if entry.get('type') == 'match':
                match_data = entry
                file_path = match_data['data']['path']['text']
                match_line_num = match_data['data']['line_number']
                
                # Collect context before this match
                context_before = []
                j = i - 1
                while j >= 0 and all_entries[j].get('type') == 'context':
                    ctx_entry = all_entries[j]
                    if (ctx_entry['data']['path']['text'] == file_path and 
                        ctx_entry['data']['line_number'] < match_line_num):
                        # Handle different line text formats
                        line_text = ''
                        if 'lines' in ctx_entry['data']:
                            line_text = ctx_entry['data']['lines'].get('text', '')
                        elif 'text' in ctx_entry['data']:
                            line_text = ctx_entry['data']['text']
                        
                        context_before.insert(0, {
                            'line_number': ctx_entry['data']['line_number'],
                            'line_text': line_text
                        })
                    else:
                        break
                    j -= 1
                
                # Collect context after this match
                context_after = []
                j = i + 1
                while j < len(all_entries) and all_entries[j].get('type') == 'context':
                    ctx_entry = all_entries[j]
                    if (ctx_entry['data']['path']['text'] == file_path and 
                        ctx_entry['data']['line_number'] > match_line_num):
                        # Handle different line text formats
                        line_text = ''
                        if 'lines' in ctx_entry['data']:
                            line_text = ctx_entry['data']['lines'].get('text', '')
                        elif 'text' in ctx_entry['data']:
                            line_text = ctx_entry['data']['text']
                        
                        context_after.append({
                            'line_number': ctx_entry['data']['line_number'],
                            'line_text': line_text
                        })
                    else:
                        break
                    j += 1
                
                # Add context to match data
                enhanced_match = {
                    'type': 'match',
                    'data': match_data['data'].copy()
                }
                enhanced_match['data']['context_before'] = context_before
                enhanced_match['data']['context_after'] = context_after
                
                matches_with_context.append(enhanced_match)
            
            i += 1
        
        return matches_with_context
    
    def _format_match_result(self, object_name: str, matches: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Format match results for output."""
        if not matches:
            return {
                'object_name': object_name,
                'found': False,
                'total_matches': 0,
                'files': []
            }
        
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
                'match_end': match['data'].get('submatches', [{}])[0].get('end', 0),
                'context_before': context_before,
                'context_after': context_after
            })
        
        return {
            'object_name': object_name,
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
    
    def process_all_objects(self) -> Dict[str, Any]:
        """Process all tables/views and search for mentions in source code."""
        print(f"Loading configuration: {self.config_name}")
        print(f"Output directory: {self.output_dir}")
        
        # Load tables and views
        tables_views = self._load_tables_views()
        unique_objects = self._get_unique_objects(tables_views)
        
        print(f"Found {len(tables_views)} total entries")
        print(f"Found {len(unique_objects)} unique objects")
        
        source_path = self.config['source_code_folder']['path']
        print(f"Searching in: {source_path}")
        
        # Display search method
        if self.use_ripgrep:
            print("Using ripgrep for fast searching")
        else:
            print("Using Python-based search (ripgrep not available)")
        
        # Process each unique object
        results = {
            'config': self.config,
            'summary': {
                'total_objects': len(unique_objects),
                'processed_objects': 0,
                'found_objects': 0,
                'total_matches': 0
            },
            'objects': []
        }
        
        for i, obj_name in enumerate(sorted(unique_objects), 1):
            print(f"Processing {i}/{len(unique_objects)}: {obj_name}")
            
            # Run search (ripgrep or Python fallback)
            search_result = self._run_search(obj_name, source_path)
            
            if search_result['success']:
                matches = self._parse_ripgrep_json(search_result['stdout'])
                formatted_result = self._format_match_result(obj_name, matches)
            else:
                formatted_result = {
                    'object_name': obj_name,
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
            f.write("Oracle DB Objects Search Results Summary\n")
            f.write("=" * 50 + "\n\n")
            
            summary = results['summary']
            f.write(f"Total objects searched: {summary['total_objects']}\n")
            f.write(f"Objects found in code: {summary['found_objects']}\n")
            f.write(f"Total matches: {summary['total_matches']}\n")
            f.write(f"Success rate: {summary['found_objects']/summary['total_objects']*100:.1f}%\n\n")
            
            # List found objects
            f.write("Objects found in source code:\n")
            f.write("-" * 30 + "\n")
            for obj in results['objects']:
                if obj['found']:
                    f.write(f"- {obj['object_name']} ({obj['total_matches']} matches in {obj.get('total_files', 0)} files)\n")
            
            # List not found objects
            f.write("\nObjects NOT found in source code:\n")
            f.write("-" * 35 + "\n")
            for obj in results['objects']:
                if not obj['found']:
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
    print("Script started...")
    
    try:
        print("Creating processor...")
        processor = TableViewsProcessor()
        
        print("Starting Oracle DB objects search...")
        print("=" * 50)
        
        # Process all objects
        results = processor.process_all_objects()
        
        # Save results
        processor.save_results(results)
        
        print("\n" + "=" * 50)
        print("Search completed successfully!")
        print("Summary:")
        print(f"- Total objects: {results['summary']['total_objects']}")
        print(f"- Found in code: {results['summary']['found_objects']}")
        print(f"- Total matches: {results['summary']['total_matches']}")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    print("Running main function...")
    main()
