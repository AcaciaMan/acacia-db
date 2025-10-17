# Database Explorer Tree View Sorting

## Overview

The Database Explorer tree view displays all data in a sorted, consistent order with a hierarchical structure showing tables, linked tables (relationships), referenced files, and individual matches.

## Tree Hierarchy

### Structure

```
📊 Summary (15 tables, 523 references)
│
├─ 🔹 ORDERS (87 refs)                          ← Level 1: Table
│  │
│  ├─ 🔗 Linked Tables (2 tables)               ← Level 2a: Relationships section
│  │  ├─ CUSTOMERS (5 relationships in 3 files) ← Level 3a: Linked table
│  │  └─ PRODUCTS (2 relationships in 1 file)
│  │
│  ├─ 📄 api.js (25 refs)                       ← Level 2b: File
│  │  ├─ Line 12: SELECT * FROM ORDERS          ← Level 3b: Match
│  │  ├─ Line 45: UPDATE ORDERS SET...
│  │  └─ Line 89: INSERT INTO ORDERS
│  │
│  └─ 📄 database.js (34 refs)
│     └─ Line 5: FROM ORDERS WHERE
│
└─ 🔹 CUSTOMERS (65 refs)
   ├─ 🔗 Linked Tables (1 table)
   │  └─ ORDERS (5 relationships in 3 files)
   └─ 📄 users.js (40 refs)
```

## Sorting Hierarchy

### Level 1: Tables (Root Level)

**Primary Sort**: Reference count (descending)
- Tables with the most references appear at the top
- Quickly identify the most heavily used tables

**Secondary Sort**: Table name (ascending)
- When tables have the same reference count, sort alphabetically
- Ensures consistent ordering

```typescript
const sortedTables = Array.from(this.tableUsageMap.entries())
    .sort((a, b) => {
        const refDiff = b[1].references.length - a[1].references.length;
        if (refDiff !== 0) {
            return refDiff;
        }
        return a[0].localeCompare(b[0]); // Sort by table name if refs are equal
    });
```

**Display Format**:
```
└─ 📊 15 tables, 523 references
   ├─ 🔹 ORDERS (87 refs)
   ├─ 🔹 CUSTOMERS (65 refs)
   ├─ 🔹 PRODUCTS (43 refs)
   └─ 🔹 INVENTORY (12 refs)
```

### Level 2: Files (Within Each Table)

**Sort**: File path (ascending)
- Files sorted alphabetically
- Easy to find specific files
- Groups all references from same file together

**Note**: If the table has relationships, a "🔗 Linked Tables" section appears first, followed by files.

```typescript
const sortedFileGroups = Array.from(fileGroups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
```

**Display Format**:
```
└─ 🔹 ORDERS (87 refs)
   ├─ 🔗 Linked Tables (2 tables)  ← Shows first if relationships exist
   ├─ 📄 api.js (25 refs)
   ├─ 📄 database.js (34 refs)
   └─ 📄 reports.js (28 refs)
```

### Level 2a: Linked Tables Section (If Relationships Exist)

When table relationships are detected, a "Linked Tables" section appears showing tables that appear near this table in the code.

**Display Format**:
```
└─ 🔹 ORDERS (87 refs)
   └─ 🔗 Linked Tables (2 tables)
      ├─ CUSTOMERS (5 relationships in 3 files)
      └─ PRODUCTS (2 relationships in 1 file)
```

### Level 3a: Individual Linked Tables

**Primary Sort**: Relationship occurrence count (descending)
- Tables with most co-occurrences appear first
- Shows strength of relationship

**Secondary Sort**: Table name (ascending)
- Alphabetical when relationship counts are equal

```typescript
const sortedLinkedTables = Array.from(linkedTables.entries())
    .sort((a, b) => {
        const occDiff = b[1].occurrences - a[1].occurrences;
        if (occDiff !== 0) return occDiff;
        return a[0].localeCompare(b[0]);
    });
```

**Display Format**:
```
└─ 🔗 Linked Tables (2 tables)
   ├─ CUSTOMERS (5 relationships in 3 files)
   └─ PRODUCTS (2 relationships in 1 file)
```

**Icon**: 🔗 Link icon
**Tooltip**: Details about where tables appear together
**Description**: Number of relationships and files

### Level 3b: References (Within Each File)

**Sort**: Line number (ascending)
- References appear in order from top to bottom of file
- Natural reading order
- Easy to navigate code sequentially

```typescript
const sortedRefs = [...element.references].sort((a, b) => a.line - b.line);
```

**Display Format**:
```
└─ 📄 api.js (25 refs)
   ├─ Line 12: const query = 'SELECT * FROM ORDERS'
   ├─ Line 45: UPDATE ORDERS SET status = 'shipped'
   ├─ Line 67: FROM ORDERS WHERE date > ?
   └─ Line 89: INSERT INTO ORDERS (id, customer)
```

## Visual Examples

### Before Sorting
```
Database Explorer
├─ 15 tables, 523 references
├─ INVENTORY (12 refs)          ❌ Low-usage table at top
│  ├─ reports.js (5 refs)
│  │  ├─ Line 89
│  │  ├─ Line 12                ❌ Out of order
│  │  └─ Line 45
│  └─ api.js (7 refs)           ❌ Random file order
├─ PRODUCTS (43 refs)
└─ ORDERS (87 refs)             ❌ Most important at bottom
```

### After Sorting
```
Database Explorer
├─ 15 tables, 523 references
├─ ORDERS (87 refs)             ✅ Most-used table at top
│  ├─ api.js (25 refs)          ✅ Alphabetical files
│  │  ├─ Line 12                ✅ Top to bottom
│  │  ├─ Line 45
│  │  └─ Line 89
│  ├─ database.js (34 refs)
│  └─ reports.js (28 refs)
├─ CUSTOMERS (65 refs)          ✅ Second most-used
├─ PRODUCTS (43 refs)
└─ INVENTORY (12 refs)          ✅ Least-used at bottom
```

## Benefits

### 1. Quick Priority Identification
- Most important tables appear first
- Focus attention where it matters
- Identify hotspots immediately

### 2. Consistent Navigation
- Same sort order every time
- Predictable location of items
- Reduced cognitive load

### 3. Logical Organization
- Tables by importance (usage)
- Files alphabetically (findability)
- References by line (reading order)

### 4. Better UX
- Natural top-to-bottom workflow
- Easy to scan and find items
- Intuitive hierarchy

### 5. Analysis Efficiency
- Quickly spot heavily-used tables
- Find patterns in usage
- Compare usage across tables

## Implementation Details

**File**: `src/databaseTreeView.ts`

**Modified Methods**:
1. `getChildren()` - Root level (tables)
   - Added secondary sort by table name
2. `getChildren()` - Table level (files)
   - Added sorting of file groups
3. `getChildren()` - File level (references)
   - Added sorting by line number

**Performance**:
- Sorting adds minimal overhead
- O(n log n) for each level
- Completed in milliseconds for typical workspaces
- No noticeable impact on tree rendering

## Consistency with JSON Output

The tree view sorting matches the `.vscode/table_refs.json` sorting:

| Aspect | JSON File | Tree View |
|--------|-----------|-----------|
| Tables | By refs (desc), name (asc) | By refs (desc), name (asc) |
| Files | Alphabetical | Alphabetical |
| References | File then line | Line within file |

This consistency provides a unified experience across:
- Visual tree view navigation
- Saved JSON file review
- Programmatic access
- Report generation

## User Experience Flow

1. **Open Database Explorer**
   - See summary at top
   - Most important tables immediately visible

2. **Expand a table**
   - Files appear in alphabetical order
   - Quick visual scan to find target file

3. **Expand a file**
   - References in top-to-bottom order
   - Navigate code naturally

4. **Click a reference**
   - Jump to exact line in editor
   - Context already loaded

## Testing

To verify sorting:

1. Run analysis on a workspace with multiple tables
2. Check tree view:
   - Tables with most refs appear first
   - Same ref count = alphabetical
   - Files are alphabetical
   - References are line-ordered
3. Compare with `.vscode/table_refs.json`
4. Verify consistent ordering

## Related Documentation

- [ANALYSIS-RESULTS.md](ANALYSIS-RESULTS.md) - JSON file sorting
- [SORTING-STRATEGY.md](SORTING-STRATEGY.md) - Overall sorting approach
- [README.md](../README.md) - User-facing feature description
