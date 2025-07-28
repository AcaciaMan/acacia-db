# Top Columns Analysis Script

## Overview

The `analyze_top_columns.py` script analyzes Oracle database objects to find the top 3 most frequently mentioned columns in Solr search results. It uses a weighted scoring system where mentions in `context_before` and `line_text` are weighted 3 times more heavily than mentions in `context_after`.

## Features

- **Weighted Column Analysis**: Different weights for different field types
  - `context_before`: 3x weight
  - `line_text`: 3x weight  
  - `context_after`: 1x weight

- **Individual Object Analysis**: Analyze specific objects for detailed column insights

- **Comprehensive Analysis**: Process all objects and generate global statistics

- **JSON Output**: Save detailed results for further processing

## Usage

### Analyze All Objects
```bash
python src/scripts/analyze_top_columns.py
```

### Analyze Specific Object
```bash
python src/scripts/analyze_top_columns.py --object "EMPLOYEES"
```

### Custom Output File
```bash
python src/scripts/analyze_top_columns.py --output "custom_analysis.json"
```

### Custom Solr URL
```bash
python src/scripts/analyze_top_columns.py --solr-url "http://localhost:8983/solr/custom_core"
```

## Output

### Console Output
- Progress indicators for batch processing
- Top 3 columns per object with weighted scores
- Breakdown of mentions by field type (before/line/after)
- Global top 10 columns across all objects
- Success rate and summary statistics

### JSON Output
- Complete analysis results with metadata
- Weighting scheme documentation
- Summary statistics
- Detailed per-object results

## Results Analysis

### Top Global Columns (from example run):
1. **EMPLOYEE_ID** (Score: 799.0) - Most referenced across objects
2. **SALARY** (Score: 749.0) - Highly mentioned in business logic
3. **DEPARTMENT_ID** (Score: 667.0) - Key organizational identifier
4. **LOCATION_ID** (Score: 456.0) - Geographic reference
5. **JOB_ID** (Score: 241.0) - Employment categorization

### Object-Specific Insights:
- **EMPLOYEES**: SALARY, EMPLOYEE_ID, DEPARTMENT_ID most mentioned
- **JOB_HISTORY**: EMPLOYEE_ID, JOB_ID, DEPARTMENT_ID (relationship focus)
- **LOCATIONS**: LOCATION_ID, CITY (geographic focus)

## Key Metrics

- **Success Rate**: 68.2% (15/22 objects had column mentions)
- **Total Documents Analyzed**: 2,683 across all objects
- **Coverage**: Analyzes all available objects in metadata

## Dependencies

- `requests`: Solr API communication
- `json`: Data processing
- `pathlib`: File system operations
- `collections.defaultdict`: Data organization
- `re`: Pattern matching for column extraction

## Error Handling

- Validates object existence in metadata
- Handles Solr connection issues gracefully
- Reports objects with no documents found
- Provides detailed error messages for troubleshooting
