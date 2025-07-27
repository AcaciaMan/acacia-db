"""
Alternative search implementation using Python's built-in capabilities.

This module provides a fallback when ripgrep is not available.
"""

import os
import re
from pathlib import Path
from typing import Dict, List, Any, Iterator
import mimetypes

class PythonGrep:
    """Python-based text search as alternative to ripgrep."""
    
    def __init__(self, context_lines: int = 50):
        """Initialize with context lines setting."""
        self.context_lines = context_lines
        self.code_extensions = {
            '.sql', '.py', '.java', '.js', '.ts', '.php', '.pl', 
            '.sh', '.bat', '.cmd', '.ps1', '.c', '.cpp', '.h', 
            '.cs', '.vb', '.rb', '.go', '.rs', '.kt', '.scala'
        }
    
    def _is_code_file(self, file_path: Path) -> bool:
        """Check if file is a code file based on extension."""
        return file_path.suffix.lower() in self.code_extensions
    
    def _is_text_file(self, file_path: Path) -> bool:
        """Check if file is likely a text file."""
        try:
            mime_type, _ = mimetypes.guess_type(str(file_path))
            if mime_type and mime_type.startswith('text'):
                return True
            
            # Additional check for files without clear mime type
            if self._is_code_file(file_path):
                return True
                
            return False
        except Exception:
            return False
    
    def _find_files(self, search_path: str) -> Iterator[Path]:
        """Find all code files in the search path."""
        search_dir = Path(search_path)
        
        if not search_dir.exists():
            return
        
        for root, dirs, files in os.walk(search_dir):
            # Skip common non-code directories
            dirs[:] = [d for d in dirs if d not in {
                '.git', '.svn', '.hg', '__pycache__', 'node_modules',
                '.pytest_cache', '.mypy_cache', 'venv', 'env'
            }]
            
            for file in files:
                file_path = Path(root) / file
                if self._is_text_file(file_path):
                    yield file_path
    
    def _search_in_file(self, file_path: Path, search_term: str, ignore_case: bool = True) -> List[Dict[str, Any]]:
        """Search for term in a single file and return matches with context."""
        matches = []
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except Exception:
            return matches
        
        # Compile regex pattern
        flags = re.IGNORECASE if ignore_case else 0
        try:
            pattern = re.compile(re.escape(search_term), flags)
        except re.error:
            return matches
        
        # Search through lines
        for line_num, line in enumerate(lines, 1):
            if pattern.search(line):
                # Calculate context range
                start_line = max(0, line_num - self.context_lines - 1)
                end_line = min(len(lines), line_num + self.context_lines)
                
                # Get context lines
                context_before = lines[start_line:line_num-1]
                context_after = lines[line_num:end_line]
                
                match_info = {
                    'line_number': line_num,
                    'line_text': line.rstrip('\n\r'),
                    'context_before': [line.rstrip('\n\r') for line in context_before],
                    'context_after': [line.rstrip('\n\r') for line in context_after],
                    'match_start': 0,  # Simplified - could be enhanced
                    'match_end': len(line.rstrip())
                }
                
                matches.append(match_info)
        
        return matches
    
    def search(self, search_term: str, search_path: str) -> Dict[str, Any]:
        """
        Search for term in all code files under search_path.
        
        Args:
            search_term: Term to search for
            search_path: Directory path to search in
            
        Returns:
            Dictionary with search results in ripgrep-like format
        """
        all_matches = []
        files_processed = 0
        files_with_matches = 0
        
        print(f"  Searching with Python grep in: {search_path}")
        
        for file_path in self._find_files(search_path):
            files_processed += 1
            if files_processed % 100 == 0:
                print(f"    Processed {files_processed} files...")
            
            matches = self._search_in_file(file_path, search_term)
            
            if matches:
                files_with_matches += 1
                for match in matches:
                    # Format to be compatible with ripgrep parser
                    match_data = {
                        'type': 'match',
                        'data': {
                            'path': {'text': str(file_path)},
                            'line_number': match['line_number'],
                            'lines': {'text': match['line_text']},
                            'submatches': [{'start': 0, 'end': len(match['line_text'])}],
                            'context_before': match['context_before'],
                            'context_after': match['context_after']
                        }
                    }
                    all_matches.append(match_data)
        
        print(f"    Processed {files_processed} files, found matches in {files_with_matches} files")
        
        return {
            'success': True,
            'matches': all_matches,
            'stats': {
                'files_processed': files_processed,
                'files_with_matches': files_with_matches,
                'total_matches': len(all_matches)
            }
        }
