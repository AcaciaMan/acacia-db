"""
Example Python script demonstrating how to use the organized folder structure.

This script shows best practices for:
- Importing utilities
- Loading configuration
- Working with data files
- Using sample data
"""

import sys
from pathlib import Path

# Add src to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from utils.data_utils import (
    get_data_path, 
    get_sample_path, 
    load_config, 
    ensure_dir_exists,
    list_data_files
)


def main():
    """Main script function."""
    print("Python Script Organization Demo")
    print("=" * 40)
    
    # Example 1: Load configuration
    try:
        # config = load_config('settings')
        # print(f"Loaded config: {config}")
        print("Configuration loading ready (create config/settings.yaml)")
    except FileNotFoundError as e:
        print(f"Config not found: {e}")
    
    # Example 2: Work with sample data
    sample_input = get_sample_path('input', 'sample_data.csv')
    print(f"Sample input path: {sample_input}")
    
    # Example 3: Prepare output directory
    output_dir = get_data_path('output')
    ensure_dir_exists(output_dir)
    print(f"Output directory ready: {output_dir}")
    
    # Example 4: List available data files
    raw_files = list_data_files('raw')
    print(f"Raw data files: {len(raw_files)} files found")
    
    # Example 5: Process data (placeholder)
    print("\nProcessing workflow:")
    print("1. Load raw data from data/raw/")
    print("2. Process using modules from src/modules/")
    print("3. Save results to data/output/")
    print("4. Validate against samples/expected/")


if __name__ == "__main__":
    main()
