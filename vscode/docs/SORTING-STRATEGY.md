# Results Sorting Implementation

## Overview

Analysis results saved to `.vscode/table_refs.json` are now fully sorted for consistency, readability, and deterministic output.

## Sorting Rules

### 1. Tables Array

**Primary Sort**: Reference count (descending)
- Tables with the most references appear first
- Helps identify the most heavily used tables immediately

**Secondary Sort**: Table name (ascending)
- When tables have the same reference count, sort alphabetically
- Ensures deterministic ordering

```typescript
tables.sort((a, b) => {
    const refDiff = b.references.length - a.references.length;
    if (refDiff !== 0) {
        return refDiff;
    }
    return a.tableName.localeCompare(b.tableName);
});
```

### 2. References Within Each Table

**Primary Sort**: File path (ascending)
- Groups all references from the same file together
- Makes it easy to see which files reference a table

**Secondary Sort**: Line number (ascending)
- Within each file, references appear in order from top to bottom
- Natural reading order for navigation

```typescript
const sortedReferences = [...usage.references].sort((a, b) => {
    const pathCompare = a.filePath.localeCompare(b.filePath);
    if (pathCompare !== 0) {
        return pathCompare;
    }
    return a.line - b.line;
});
```

### 3. Files Array Within Each Table

**Sort**: Alphabetical (ascending)
- Consistent ordering of file lists
- Easy to scan and find specific files

```typescript
files: Array.from(usage.files).sort()
```

### 4. Relationships Array

**Primary Sort**: Occurrence count (descending)
- Most strongly related tables appear first
- Highlights the most important relationships

**Secondary Sort**: Combined table names (ascending)
- Alphabetical by "table1|table2" string
- Ensures consistent ordering when occurrences are equal

```typescript
relationships.sort((a, b) => {
    const occDiff = b.occurrences - a.occurrences;
    if (occDiff !== 0) {
        return occDiff;
    }
    const name1 = `${a.table1}|${a.table2}`;
    const name2 = `${b.table1}|${b.table2}`;
    return name1.localeCompare(name2);
});
```

### 5. Proximity Instances Within Each Relationship

**Primary Sort**: File path (ascending)
- Groups instances by file
- Easy to see where relationships occur

**Secondary Sort**: First line number (ascending)
- Within each file, instances appear in order
- Natural reading order

```typescript
const sortedInstances = [...rel.proximityInstances].sort((a, b) => {
    const fileCompare = a.file.localeCompare(b.file);
    if (fileCompare !== 0) {
        return fileCompare;
    }
    return a.line1 - b.line1;
});
```

### 6. Files Array Within Each Relationship

**Sort**: Alphabetical (ascending)
- Consistent ordering of file lists

```typescript
files: Array.from(rel.files).sort()
```

## Benefits

### 1. Predictable Output
- Results always appear in the same order for the same data
- Makes manual inspection easier
- Reduces cognitive load when reviewing results

### 2. Version Control Friendly
- Deterministic sorting produces consistent diffs
- Changes to code references show up cleanly in git diffs
- Easy to see what changed between analysis runs

### 3. Quick Analysis
- Most important data appears first:
  - Most referenced tables
  - Strongest table relationships
- Quickly identify hotspots and patterns

### 4. Easy Navigation
- References appear in file order, then line order
- Natural top-to-bottom, file-by-file navigation
- Aligns with how developers read code

### 5. Consistent Comparison
- Easy to compare results between:
  - Different branches
  - Different time periods
  - Different configurations
- Sorted data makes automated comparisons reliable

## Example Output

```json
{
  "tables": [
    {
      "tableName": "ORDERS",
      "references": [
        { "filePath": "src/api.js", "line": 10, ... },
        { "filePath": "src/api.js", "line": 45, ... },
        { "filePath": "src/reports.js", "line": 23, ... }
      ],
      "files": ["src/api.js", "src/reports.js"]
    },
    {
      "tableName": "CUSTOMERS",
      "references": [
        { "filePath": "src/database.js", "line": 12, ... },
        { "filePath": "src/users.js", "line": 34, ... }
      ],
      "files": ["src/database.js", "src/users.js"]
    },
    {
      "tableName": "PRODUCTS",
      "references": [
        { "filePath": "src/catalog.js", "line": 8, ... }
      ],
      "files": ["src/catalog.js"]
    }
  ],
  "relationships": [
    {
      "table1": "CUSTOMERS",
      "table2": "ORDERS",
      "occurrences": 5,
      "files": ["src/orders.js", "src/reports.js"],
      "proximityInstances": [
        { "file": "src/orders.js", "line1": 45, "line2": 67, "distance": 22 },
        { "file": "src/reports.js", "line1": 100, "line2": 125, "distance": 25 }
      ]
    }
  ]
}
```

Notice:
- ORDERS appears first (most references)
- Within ORDERS, references sorted by file then line
- Files arrays are alphabetically sorted
- Relationships sorted by occurrence count
- Proximity instances sorted by file and line

## Implementation Location

File: `src/databaseAnalyzer.ts`
Method: `private async saveResults(tableUsageMap: Map<string, TableUsage>)`

All sorting happens during the serialization process before writing to JSON.

## Performance

Sorting adds minimal overhead:
- Tables: O(n log n) where n = number of tables with references
- References: O(m log m) per table where m = references per table
- Relationships: O(r log r) where r = number of relationships

For typical workspaces (100s of tables, 1000s of references), sorting completes in milliseconds.
