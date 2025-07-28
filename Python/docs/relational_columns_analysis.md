# Relational Columns Analysis Script

## Overview

The `analyze_relational_columns.py` script analyzes Oracle database object columns used in relational contexts with advanced proximity-based weighting. It identifies which columns are most frequently mentioned near their parent objects, giving higher importance to mentions in `line_text` and `context_after` (3x weight) compared to `context_before` (1x weight).

## Key Features

### Proximity-Based Analysis
- **Distance Calculation**: Measures character distance between object and column mentions
- **Proximity Scoring**: Uses exponential decay function: `e^(-distance/100)`
- **Closer = Higher Score**: Columns mentioned closer to objects get higher scores

### Advanced Weighting System
- **`line_text`**: 3x weight (most important - actual code usage)
- **`context_after`**: 3x weight (important - follows the object reference)
- **`context_before`**: 1x weight (less important - precedes the object)

### Comprehensive Metrics
- Total weighted score per column
- Best proximity score achieved
- Minimum character distance to object
- Number of documents where relationship appears
- Breakdown by context type (before/line/after)

## Usage

### Analyze All Objects
```bash
python src/scripts/analyze_relational_columns.py
```

### Analyze Specific Object
```bash
python src/scripts/analyze_relational_columns.py --object "EMPLOYEES"
```

### Custom Number of Top Columns
```bash
python src/scripts/analyze_relational_columns.py --top-n 3
```

### Custom Output File
```bash
python src/scripts/analyze_relational_columns.py --output "relations.json"
```

### Custom Solr URL
```bash
python src/scripts/analyze_relational_columns.py --solr-url "http://localhost:8983/solr/custom"
```

## Results Analysis

### Top Global Relational Columns (from example run):

1. **LOCATION_ID** (Score: 244.168, Proximity: 0.905)
   - Most relationally important column across all objects
   - High proximity to object references
   - Strong indicator of geographic relationships

2. **SALARY** (Score: 114.760, Proximity: 0.905)
   - Critical business attribute
   - Frequently mentioned in employee-related contexts
   - High relational importance in HR operations

3. **EMPLOYEE_ID** (Score: 110.788, Proximity: 0.905)
   - Primary identifier with strong relational usage
   - Consistently appears near object references
   - Key foreign key relationship indicator

4. **COUNTRY_ID** (Score: 55.871, Proximity: 0.905)
   - Geographic relationship identifier
   - Important for location-based queries

5. **LAST_NAME** (Score: 54.838, Proximity: 0.905)
   - Human-readable identifier
   - High business relevance in reporting

### Object-Specific Insights:

#### EMPLOYEES Object:
- **SALARY**: Top relational column (Score: 114.760)
- **EMPLOYEE_ID**: Strong identifier usage (Score: 97.564)
- **LAST_NAME**: Important for reporting (Score: 54.838)

#### JOB_HISTORY Object:
- **EMPLOYEE_ID**: Primary relationship (Score: 13.224)
- **START_DATE**: Temporal relationship (Score: 12.454)
- **END_DATE**: Duration context (Score: 9.930)

#### LOCATIONS Object:
- **LOCATION_ID**: Dominant identifier (Score: 238.873)
- **CITY**: Geographic descriptor (Score: 34.120)

## Technical Details

### Proximity Algorithm
```
proximity_score = e^(-distance_in_characters / 100)
```
- **Range**: 0.0 (far apart) to 1.0 (adjacent)
- **Decay**: Exponential, favoring close proximity
- **Threshold**: Effectively zero after ~500 characters

### Weighted Score Calculation
```
field_score = proximity_score × mentions_count × context_weight
total_score = sum(field_scores_across_all_documents)
```

### Context Weights
- **Line Text**: 3x (direct code usage)
- **Context After**: 3x (follows object reference)
- **Context Before**: 1x (precedes object reference)

## Output Formats

### Console Output
- Progress indicators for batch processing
- Top N relational columns per object
- Proximity scores and character distances
- Global rankings across all objects
- Summary statistics and success rates

### JSON Output
- Complete analysis metadata
- Algorithm documentation
- Per-object detailed results
- Global rankings with scores
- Proximity and distance metrics

## Key Metrics

- **Success Rate**: 68.2% (15/22 objects found relational usage)
- **Total Documents Analyzed**: 2,681 across all objects
- **Proximity Range**: 0.861 - 0.951 (high proximity scores)
- **Distance Range**: 5 - 15 characters (very close relationships)

## Use Cases

1. **Database Design**: Identify most important relational columns
2. **Query Optimization**: Focus on high-proximity column relationships
3. **Data Modeling**: Understand real-world column usage patterns
4. **Documentation**: Generate relationship documentation automatically
5. **Migration Planning**: Prioritize critical relational columns

## Comparison with Basic Column Analysis

| Aspect | Basic Analysis | Relational Analysis |
|--------|---------------|-------------------|
| Context Weighting | Equal weight | Contextual preference (3x vs 1x) |
| Proximity | Not considered | Exponential decay based on distance |
| Relationship Focus | General mentions | Object-column relationships |
| Scoring | Simple counts | Proximity × Context × Frequency |
| Output | Top mentioned | Top relational usage |

## Dependencies

- `requests`: Solr API communication
- `json`: Data processing and output
- `pathlib`: File system operations
- `collections.defaultdict`: Data aggregation
- `re`: Pattern matching and distance calculation
- `math`: Exponential proximity calculations

## Error Handling

- Validates object existence in metadata
- Handles missing Solr documents gracefully
- Reports proximity calculation failures
- Provides detailed error messages
- Handles edge cases (no object/column matches)
