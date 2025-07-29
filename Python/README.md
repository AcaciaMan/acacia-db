# Python Project Structure

This project follows a structured approach to organize Python scripts, data, and sample files.

## Directory Structure

```
Python/
├── src/                    # Source code
│   ├── scripts/           # Main Python scripts
│   ├── modules/           # Reusable modules/libraries
│   └── utils/             # Utility functions
├── data/                  # Data files
│   ├── raw/              # Raw, unprocessed data
│   ├── processed/        # Cleaned/processed data
│   ├── external/         # Third-party data
│   └── output/           # Generated output files
├── samples/              # Sample data for testing/demos
│   ├── input/           # Sample input files
│   └── expected/        # Expected output for samples
├── tests/               # Test files
├── docs/                # Documentation
├── config/              # Configuration files
└── notebooks/           # Jupyter notebooks (optional)
```

## Folder Descriptions

### `src/` - Source Code
- **`scripts/`**: Main executable Python scripts
- **`modules/`**: Reusable Python modules and packages
- **`utils/`**: Utility functions and helper scripts

### `data/` - Data Management
- **`raw/`**: Original, unmodified data files
- **`processed/`**: Cleaned and transformed data
- **`external/`**: Third-party datasets and external data
- **`output/`**: Generated files, reports, and results

### `samples/` - Sample Data
- **`input/`**: Small sample datasets for testing and demonstrations
- **`expected/`**: Expected output files for validation

### `tests/` - Testing
- Unit tests, integration tests, and test data

### `docs/` - Documentation
- Project documentation, API docs, and usage guides

### `config/` - Configuration
- Configuration files, settings, and environment variables

### `notebooks/` - Jupyter Notebooks
- Exploratory data analysis and prototyping notebooks

## Best Practices

1. **Keep data files out of version control** (add them to `.gitignore`)
2. **Use relative paths** when referencing data files
3. **Document data sources** and processing steps
4. **Include sample data** for easy testing and onboarding
5. **Separate configuration** from code

## Key Scripts

### Oracle Database Analysis Pipeline

1. **`src/scripts/tables_views_to_solr.py`** - Main search script
   - Searches Oracle database objects in source code using ripgrep
   - Extracts context lines around matches (+/- 50 lines)
   - Outputs structured JSON results

2. **`src/scripts/index_to_solr.py`** - Solr indexing script
   - Transforms search results into Solr documents
   - Indexes with full-text search capabilities
   - Includes context data for rich analysis

3. **`src/scripts/analyze_object_relations.py`** - Relationship analysis
   - Finds relationships between Oracle database objects
   - Analyzes column name matches and co-occurrence patterns
   - Generates comprehensive relationship reports
   - Usage examples:
     ```bash
     # Analyze specific relationship
     python src/scripts/analyze_object_relations.py --object1 EMPLOYEES --object2 DEPARTMENTS
     
     # Find all significant relationships
     python src/scripts/analyze_object_relations.py --min-score 0.3
     ```

4. **`src/scripts/parse_al_tables.py`** - AL Table Parser for Microsoft Dynamics 365 BC
   - Parses *.Table.al files to extract table and column schema information
   - Supports complex AL syntax including enums, calculated fields, and table relations
   - Converts AL table definitions to tables_views.json format
   - Usage examples:
     ```bash
     # Parse AL tables using MSDynamics configuration
     python src/scripts/parse_al_tables.py --config config/MSDynamics.json
     
     # Parse with custom configuration
     python src/scripts/parse_al_tables.py --config path/to/custom/config.json
     ```

### Usage Workflow

1. **Search for object mentions**: `python src/scripts/tables_views_to_solr.py`
2. **Index to Solr**: `python src/scripts/index_to_solr.py --clear`
3. **Analyze relationships**: `python src/scripts/analyze_object_relations.py`
4. **Query via Solr Admin**: `http://localhost:8983/solr/#/oracle_db_search`
