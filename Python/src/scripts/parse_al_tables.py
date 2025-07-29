#!/usr/bin/env python3
"""
AL Table Parser for Microsoft Dynamics 365 Business Central

This script parses *.Table.al files to extract table and column information
and stores them in tables_views.json format compatible with the analysis pipeline.

Usage:
    python parse_al_tables.py [--config CONFIG_FILE]

AL Table File Format:
    table <id> <TableName>
    {
        fields
        {
            field(<id>; <FieldName>; <DataType>[<Length>])
            {
                Caption = '<Display Name>';
                ...
            }
        }
    }
"""

import os
import re
import json
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass


@dataclass
class ALField:
    """Represents a field in an AL table."""
    id: int
    name: str
    data_type: str
    length: Optional[int] = None
    caption: Optional[str] = None
    description: Optional[str] = None


@dataclass
class ALTable:
    """Represents an AL table."""
    id: int
    name: str
    fields: List[ALField]
    file_path: str


class ALTableParser:
    """Parser for AL Table files."""
    
    def __init__(self, source_folder: str):
        self.source_folder = Path(source_folder)
        self.tables = []
        
        # Regex patterns for parsing AL syntax
        self.table_pattern = re.compile(r'table\s+(\d+)\s+"?([^"\s{]+)"?\s*', re.IGNORECASE)
        self.field_pattern = re.compile(
            r'field\s*\(\s*(\d+)\s*;\s*"?([^";]+)"?\s*;\s*([^);\s]+)(?:\[(\d+)\])?\s*\)',
            re.IGNORECASE
        )
        self.caption_pattern = re.compile(r'Caption\s*=\s*[\'"]([^\'"]*)[\'"]', re.IGNORECASE)
        
    def find_al_table_files(self) -> List[Path]:
        """Find all *.Table.al files in the source folder."""
        print(f"Searching for *.Table.al files in: {self.source_folder}")
        
        table_files = list(self.source_folder.glob("**/*.Table.al"))
        print(f"Found {len(table_files)} AL table files")
        
        return table_files
    
    def parse_field_block(self, lines: List[str], start_idx: int) -> Tuple[ALField, int]:
        """Parse a field block and return the field and next line index."""
        field_line = lines[start_idx].strip()
        field_match = self.field_pattern.search(field_line)
        
        if not field_match:
            raise ValueError(f"Invalid field syntax: {field_line}")
        
        field_id = int(field_match.group(1))
        field_name = field_match.group(2).strip('"')
        data_type = field_match.group(3)
        length = int(field_match.group(4)) if field_match.group(4) else None
        
        field = ALField(
            id=field_id,
            name=field_name,
            data_type=data_type,
            length=length
        )
        
        # Look for field properties (Caption, etc.)
        current_idx = start_idx + 1
        brace_count = 0
        if '{' in field_line:
            brace_count = 1
            
            while current_idx < len(lines) and brace_count > 0:
                line = lines[current_idx].strip()
                
                # Count braces
                brace_count += line.count('{') - line.count('}')
                
                # Look for Caption
                caption_match = self.caption_pattern.search(line)
                if caption_match:
                    field.caption = caption_match.group(1)
                
                current_idx += 1
        
        return field, current_idx
    
    def parse_al_table_file(self, file_path: Path) -> Optional[ALTable]:
        """Parse a single AL table file."""
        try:
            with open(file_path, 'r', encoding='utf-8-sig') as f:
                content = f.read()
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            return None
        
        lines = content.split('\n')
        
        # Find table declaration
        table_match = None
        table_line_idx = -1
        
        for i, line in enumerate(lines):
            table_match = self.table_pattern.search(line)
            if table_match:
                table_line_idx = i
                break
        
        if not table_match:
            print(f"No table declaration found in {file_path}")
            return None
        
        table_id = int(table_match.group(1))
        table_name = table_match.group(2).strip('"')
        
        # Find fields section
        fields = []
        in_fields_section = False
        fields_brace_count = 0
        
        i = table_line_idx + 1
        while i < len(lines):
            line = lines[i].strip()
            
            # Look for fields section
            if not in_fields_section and 'fields' in line.lower():
                in_fields_section = True
                fields_brace_count = line.count('{') - line.count('}')
                i += 1
                continue
            
            if in_fields_section:
                # Track brace count to know when fields section ends
                fields_brace_count += line.count('{') - line.count('}')
                
                if fields_brace_count <= 0:
                    break
                
                # Look for field declarations
                if 'field(' in line.lower():
                    try:
                        field, next_idx = self.parse_field_block(lines, i)
                        fields.append(field)
                        i = next_idx - 1  # -1 because loop will increment
                    except Exception as e:
                        print(f"Error parsing field in {file_path} at line {i + 1}: {e}")
            
            i += 1
        
        return ALTable(
            id=table_id,
            name=table_name,
            fields=fields,
            file_path=str(file_path)
        )
    
    def parse_all_tables(self) -> List[ALTable]:
        """Parse all AL table files and return list of tables."""
        table_files = self.find_al_table_files()
        tables = []
        
        print("Parsing AL table files...")
        for i, file_path in enumerate(table_files):
            if i % 100 == 0:
                print(f"Progress: {i}/{len(table_files)} files processed")
            
            table = self.parse_al_table_file(file_path)
            if table:
                tables.append(table)
        
        print(f"Successfully parsed {len(tables)} tables from {len(table_files)} files")
        return tables
    
    def convert_to_tables_views_format(self, tables: List[ALTable]) -> Dict:
        """Convert parsed tables to tables_views.json format."""
        result = {}
        
        for table in tables:
            # Extract column names
            columns = [field.name for field in table.fields]
            
            result[table.name] = {
                "object_type": "TABLE",
                "object_owner": "dbo",  # Default for AL tables
                "columns": columns,
                "metadata": {
                    "table_id": table.id,
                    "field_count": len(table.fields),
                    "source_file": os.path.basename(table.file_path),
                    "fields_detail": [
                        {
                            "id": field.id,
                            "name": field.name,
                            "data_type": field.data_type,
                            "length": field.length,
                            "caption": field.caption
                        }
                        for field in table.fields
                    ]
                }
            }
        
        return result
    
    def save_tables_views_json(self, output_path: str, tables: List[ALTable]):
        """Save tables in tables_views.json format."""
        tables_views_data = self.convert_to_tables_views_format(tables)
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(tables_views_data, f, indent=2, ensure_ascii=False)
        
        print(f"Saved {len(tables)} tables to {output_path}")
        
        # Print summary
        total_columns = sum(len(table.fields) for table in tables)
        print("\nSummary:")
        print(f"  Total tables: {len(tables)}")
        print(f"  Total columns: {total_columns}")
        print(f"  Average columns per table: {total_columns / len(tables):.1f}")


def load_config(config_path: str) -> Dict:
    """Load configuration from JSON file."""
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='Parse AL Table files and extract schema information')
    parser.add_argument(
        '--config',
        default='config/MSDynamics.json',
        help='Configuration file path (default: config/MSDynamics.json)'
    )
    
    args = parser.parse_args()
    
    # Load configuration
    print(f"Loading configuration from: {args.config}")
    config = load_config(args.config)
    
    source_folder = config['source_code_folder']['path']
    output_path = config['tables_views']
    
    print(f"Source folder: {source_folder}")
    print(f"Output file: {output_path}")
    
    # Parse AL tables
    parser = ALTableParser(source_folder)
    tables = parser.parse_all_tables()
    
    if not tables:
        print("No tables found!")
        return
    
    # Save results
    parser.save_tables_views_json(output_path, tables)
    
    print("\nDone!")


if __name__ == '__main__':
    main()
