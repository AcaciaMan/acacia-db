# Analysis Results Format

## Overview

The extension automatically saves analysis results to `.vscode/table_refs.json` in your workspace. This file contains a complete snapshot of the database usage analysis, including table references, relationships, and summary statistics.

## File Location

```
<workspace>/.vscode/table_refs.json
```

This file is:
- **Auto-generated**: Created/updated after each analysis run
- **Workspace-specific**: Each workspace has its own results file
- **Git-ignored**: Added to `.gitignore` by default (workspace-specific data)
- **JSON format**: Human-readable and machine-parseable
- **Sorted**: Data is sorted for consistency and easy reading

## Data Sorting

All data in the results file is sorted for consistency:

1. **Tables**: 
   - Primary: By reference count (descending) - most referenced tables first
   - Secondary: By table name (ascending) - alphabetical for same reference count

2. **References within each table**:
   - Primary: By file path (ascending) - alphabetical
   - Secondary: By line number (ascending) - top to bottom within each file

3. **Relationships**:
   - Primary: By occurrence count (descending) - strongest relationships first
   - Secondary: By table names (ascending) - alphabetical

4. **Files arrays**: Sorted alphabetically

5. **Proximity instances**: Sorted by file path, then by line number

This consistent sorting makes it easy to:
- Quickly find the most/least referenced tables
- Compare results between analysis runs
- Generate deterministic diffs for version control
- Navigate results predictably

## JSON Schema

```typescript
interface AnalysisResults {
    timestamp: string;              // ISO 8601 timestamp of analysis
    config: AnalysisConfig;         // Configuration used for analysis
    tables: SerializableTableUsage[];
    relationships: SerializableRelationship[];
    summary: AnalysisSummary;
}

interface AnalysisConfig {
    tablesViewsFile?: string;       // Path to tables_views.json
    sourceFolder?: string;          // Source folder analyzed
}

interface SerializableTableUsage {
    tableName: string;
    references: DatabaseReference[];
    files: string[];                // List of files containing references
}

interface DatabaseReference {
    tableName: string;
    columnName?: string;
    filePath: string;               // Full path to file
    line: number;                   // Line number (1-based)
    column: number;                 // Column number (1-based)
    context: string;                // Line of code containing reference
}

interface SerializableRelationship {
    table1: string;
    table2: string;
    occurrences: number;            // Number of times tables appear together
    files: string[];                // Files where relationship was found
    proximityInstances: ProximityInstance[];
}

interface ProximityInstance {
    file: string;
    line1: number;
    line2: number;
    distance: number;               // Lines between references
}

interface AnalysisSummary {
    totalTables: number;            // Total tables in schema
    tablesWithReferences: number;   // Tables found in code
    totalReferences: number;        // Total reference count
    totalFiles: number;             // Files with references
    relationshipCount: number;      // Number of table relationships
}
```

## Example

```json
{
  "timestamp": "2025-10-17T14:30:00.000Z",
  "config": {
    "tablesViewsFile": "c:\\data\\tables_views.json",
    "sourceFolder": "c:\\project\\src"
  },
  "tables": [
    {
      "tableName": "CUSTOMERS",
      "references": [
        {
          "tableName": "CUSTOMERS",
          "filePath": "c:\\project\\src\\database.js",
          "line": 45,
          "column": 12,
          "context": "  SELECT * FROM CUSTOMERS WHERE id = ?"
        }
      ],
      "files": ["c:\\project\\src\\database.js"]
    }
  ],
  "relationships": [
    {
      "table1": "CUSTOMERS",
      "table2": "ORDERS",
      "occurrences": 3,
      "files": ["c:\\project\\src\\orders.js"],
      "proximityInstances": [
        {
          "file": "c:\\project\\src\\orders.js",
          "line1": 45,
          "line2": 67,
          "distance": 22
        }
      ]
    }
  ],
  "summary": {
    "totalTables": 150,
    "tablesWithReferences": 87,
    "totalReferences": 523,
    "totalFiles": 42,
    "relationshipCount": 15
  }
}
```

## Use Cases

### 1. Version Control / Change Tracking
Track how database usage evolves over time by committing analysis results (if desired).

### 2. CI/CD Integration
Parse `table_refs.json` in CI pipelines to:
- Detect unused tables
- Validate database dependencies
- Generate reports
- Track technical debt

### 3. Documentation
Use the results to:
- Generate database usage documentation
- Create entity relationship diagrams
- Document table dependencies

### 4. Migration Planning
Analyze results to:
- Identify tables safe to remove
- Find coupling between tables
- Plan database refactoring

### 5. Custom Tools
Build custom tools that:
- Parse `table_refs.json`
- Generate custom reports
- Integrate with other systems
- Analyze trends over time

## Loading Results

The extension automatically loads previous results on startup if available. You can also manually trigger analysis to update the results.

### Programmatic Access

```typescript
// In extension code
const analyzer = new DatabaseAnalyzer();
const results = await analyzer.loadResults();

if (results) {
    // Use cached results
    console.log(`Loaded ${results.size} tables from cache`);
} else {
    // No cache, run fresh analysis
    const results = await analyzer.analyzeWorkspace();
}
```

## Performance Considerations

- **File size**: Large projects may generate MB-sized files
- **Git**: Consider adding to `.gitignore` for large results
- **Updates**: Results are regenerated on each analysis run
- **Caching**: Extension can load previous results to avoid re-analysis

## Best Practices

1. **Review regularly**: Check results after major code changes
2. **Clean builds**: Delete file to force fresh analysis
3. **Share selectively**: Commit results if useful for team, otherwise ignore
4. **Automate**: Integrate into CI/CD for continuous monitoring
5. **Archive**: Save historical results for trend analysis
