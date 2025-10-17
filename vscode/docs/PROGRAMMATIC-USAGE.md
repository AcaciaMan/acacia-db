# Using Analysis Results Programmatically

This guide shows how to use the `table_refs.json` analysis results in your own tools and workflows.

## Reading the Results File

### Node.js / JavaScript

```javascript
const fs = require('fs');
const path = require('path');

// Read the results file
const resultsPath = path.join(__dirname, '.vscode', 'table_refs.json');
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

console.log(`Analysis from: ${results.timestamp}`);
console.log(`Total tables analyzed: ${results.summary.totalTables}`);
console.log(`Tables found in code: ${results.summary.tablesWithReferences}`);
console.log(`Total references: ${results.summary.totalReferences}`);
```

### Python

```python
import json
from pathlib import Path

# Read the results file
results_path = Path('.vscode/table_refs.json')
with results_path.open() as f:
    results = json.load(f)

print(f"Analysis from: {results['timestamp']}")
print(f"Total tables analyzed: {results['summary']['totalTables']}")
print(f"Tables found in code: {results['summary']['tablesWithReferences']}")
print(f"Total references: {results['summary']['totalReferences']}")
```

### PowerShell

```powershell
# Read the results file
$results = Get-Content -Path ".vscode\table_refs.json" | ConvertFrom-Json

Write-Host "Analysis from: $($results.timestamp)"
Write-Host "Total tables analyzed: $($results.summary.totalTables)"
Write-Host "Tables found in code: $($results.summary.tablesWithReferences)"
Write-Host "Total references: $($results.summary.totalReferences)"
```

## Common Use Cases

### 1. Find Unused Tables

```javascript
// Find tables defined in schema but never referenced in code
const referencedTables = new Set(results.tables.map(t => t.tableName));
const allTables = results.summary.totalTables;

console.log(`\nUnused Tables (defined but not referenced):`);
// Note: You'll need to load the original tables_views.json to compare
const tablesViewsFile = JSON.parse(fs.readFileSync(results.config.tablesViewsFile, 'utf8'));
const definedTables = tablesViewsFile.tables.map(t => typeof t === 'string' ? t : t.name);

const unusedTables = definedTables.filter(t => !referencedTables.has(t));
console.log(unusedTables);
```

### 2. Generate Coverage Report

```javascript
// Calculate table usage coverage
const coverage = (results.summary.tablesWithReferences / results.summary.totalTables) * 100;

console.log(`\nDatabase Usage Coverage Report`);
console.log(`==============================`);
console.log(`Tables in schema: ${results.summary.totalTables}`);
console.log(`Tables referenced: ${results.summary.tablesWithReferences}`);
console.log(`Coverage: ${coverage.toFixed(2)}%`);
console.log(`\nMost referenced tables:`);

// Sort by reference count
const sortedTables = results.tables
    .sort((a, b) => b.references.length - a.references.length)
    .slice(0, 10);

sortedTables.forEach((table, idx) => {
    console.log(`  ${idx + 1}. ${table.tableName}: ${table.references.length} references in ${table.files.length} files`);
});
```

### 3. Find Tables in Specific Files

```javascript
// Find all tables referenced in a specific file
const targetFile = 'c:\\project\\src\\orders.js';

console.log(`\nTables referenced in ${targetFile}:`);

results.tables.forEach(table => {
    const refsInFile = table.references.filter(ref => ref.filePath === targetFile);
    if (refsInFile.length > 0) {
        console.log(`  - ${table.tableName}: ${refsInFile.length} references`);
        refsInFile.forEach(ref => {
            console.log(`    Line ${ref.line}: ${ref.context.trim()}`);
        });
    }
});
```

### 4. Analyze Table Relationships

```javascript
// Find most coupled tables
console.log(`\nTable Relationships (most coupled):`);

const sortedRelationships = results.relationships
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 10);

sortedRelationships.forEach((rel, idx) => {
    console.log(`  ${idx + 1}. ${rel.table1} <-> ${rel.table2}: ${rel.occurrences} co-occurrences in ${rel.files.length} files`);
});
```

### 5. Export to CSV

```javascript
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Export all references to CSV
const csvWriter = createCsvWriter({
    path: 'table_references.csv',
    header: [
        { id: 'tableName', title: 'Table' },
        { id: 'filePath', title: 'File' },
        { id: 'line', title: 'Line' },
        { id: 'column', title: 'Column' },
        { id: 'context', title: 'Context' }
    ]
});

const records = [];
results.tables.forEach(table => {
    table.references.forEach(ref => {
        records.push({
            tableName: ref.tableName,
            filePath: ref.filePath,
            line: ref.line,
            column: ref.column,
            context: ref.context.trim()
        });
    });
});

csvWriter.writeRecords(records)
    .then(() => console.log('CSV file created successfully'));
```

### 6. Generate HTML Report

```javascript
// Create a simple HTML report
const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Database Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .summary { background: #f0f0f0; padding: 15px; margin: 20px 0; }
        .table-item { margin: 20px 0; padding: 10px; border-left: 3px solid #007acc; }
        .reference { margin: 5px 0 5px 20px; font-family: monospace; font-size: 12px; }
    </style>
</head>
<body>
    <h1>Database Usage Analysis</h1>
    <div class="summary">
        <h2>Summary</h2>
        <p>Analysis Date: ${new Date(results.timestamp).toLocaleString()}</p>
        <p>Total Tables: ${results.summary.totalTables}</p>
        <p>Tables Referenced: ${results.summary.tablesWithReferences}</p>
        <p>Total References: ${results.summary.totalReferences}</p>
        <p>Files Analyzed: ${results.summary.totalFiles}</p>
    </div>
    <h2>Tables</h2>
    ${results.tables.map(table => `
        <div class="table-item">
            <h3>${table.tableName}</h3>
            <p>${table.references.length} references in ${table.files.length} files</p>
            ${table.references.slice(0, 5).map(ref => `
                <div class="reference">
                    ${ref.filePath}:${ref.line} - ${ref.context.trim()}
                </div>
            `).join('')}
        </div>
    `).join('')}
</body>
</html>
`;

fs.writeFileSync('analysis-report.html', html, 'utf8');
console.log('HTML report generated: analysis-report.html');
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Database Usage Analysis

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  analyze:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Check for unused tables
      run: |
        node scripts/check-unused-tables.js
        
    - name: Upload analysis results
      uses: actions/upload-artifact@v2
      with:
        name: table-analysis
        path: .vscode/table_refs.json
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    
    stages {
        stage('Database Analysis') {
            steps {
                script {
                    def results = readJSON file: '.vscode/table_refs.json'
                    echo "Tables analyzed: ${results.summary.totalTables}"
                    echo "Tables referenced: ${results.summary.tablesWithReferences}"
                    
                    // Fail if coverage is too low
                    def coverage = (results.summary.tablesWithReferences / results.summary.totalTables) * 100
                    if (coverage < 80) {
                        error("Database coverage too low: ${coverage}%")
                    }
                }
            }
        }
    }
}
```

## Tips

1. **Version Control**: Consider committing `table_refs.json` to track changes over time
2. **Automation**: Run analysis as part of your build process
3. **Notifications**: Alert team when new unused tables are detected
4. **Trends**: Track metrics over time to monitor technical debt
5. **Documentation**: Generate and publish reports automatically

## Schema Reference

See [ANALYSIS-RESULTS.md](ANALYSIS-RESULTS.md) for the complete JSON schema and field descriptions.
