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

## Sorting Strategy: Most Relevant First

**Consistent sorting across all levels:**
1. **Primary Sort**: Count/relevance (descending) - most referenced/earliest/closest first
2. **Secondary Sort**: Alphabetical/earliest (ascending) - consistent ordering for equal items

This strategy ensures the most important data is always visible at the top of each level.

### Complete Sorting Summary

| Level | Primary Sort | Secondary Sort | Purpose |
|-------|--------------|----------------|---------|
| **1. Tables** | Reference count ↓ | Name ↑ | Most used tables first |
| **2. Files** | Reference count ↓ | Path ↑ | Most referenced files first |
| **3. Linked Tables** | Occurrence count ↓ | Name ↑ | Strongest relationships first |
| **4. Relationship Files** | Instance count ↓ | Path ↑ | Most co-occurrences first |
| **5. Proximity Instances** | Distance ↑ | Line ↑ | Closest/tightest first |
| **6. Reference Lines** | Line ↑ | — | File order (earliest first) |

**Legend**: ↓ = Descending (most/highest first), ↑ = Ascending (least/lowest/earliest first)

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
        const refDiff = b[1].references.length - a[1].references.length; // Most refs first
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

**Primary Sort**: Reference count (descending)
- Files with the most references appear at the top
- Shows which files use this table most heavily

**Secondary Sort**: File path (ascending)
- Alphabetically when reference counts are equal
- Consistent ordering

**Note**: If the table has relationships, a "🔗 Linked Tables" section appears first, followed by files.

```typescript
const sortedFileGroups = Array.from(fileGroups.entries())
    .sort((a, b) => {
        const refDiff = b[1].length - a[1].length; // Most references first
        if (refDiff !== 0) {
            return refDiff;
        }
        return a[0].localeCompare(b[0]); // Alphabetically if equal
    });
```

**Display Format**:
```
└─ 🔹 ORDERS (87 refs)
   ├─ 🔗 Linked Tables (2 tables)  ← Shows first if relationships exist
   ├─ 📄 database.js (34 refs)     ← Most references first
   ├─ 📄 reports.js (28 refs)
   └─ 📄 api.js (25 refs)
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

### Level 4: Relationship Files (Within Each Linked Table)

**Primary Sort**: Instance count (descending)
- Files with the most relationship instances appear first
- Shows where tables are most frequently used together

**Secondary Sort**: File path (ascending)
- Alphabetically when instance counts are equal

```typescript
const sortedFiles = Array.from(fileInstances.entries())
    .sort((a, b) => {
        const instDiff = b[1].length - a[1].length; // Most instances first
        if (instDiff !== 0) {
            return instDiff;
        }
        return a[0].localeCompare(b[0]); // Alphabetically if equal
    });
```

**Display Format**:
```
└─ CUSTOMERS (5 relationships in 3 files)
   ├─ 📄 api.js (3 instances)         ← Most instances first
   ├─ 📄 orders.js (2 instances)
   └─ 📄 reports.js (1 instance)
```

### Level 5: Proximity Instances (Within Each Relationship File)

**Primary Sort**: Distance (ascending)
- Closest relationships appear first (smallest line distance)
- Shows strongest/tightest coupling

**Secondary Sort**: Line number (ascending)
- Earliest line if distances are equal
- Shows file order when proximity is the same

```typescript
const sortedInstances = [...element.references].sort((a: any, b: any) => {
    const distDiff = a.distance - b.distance; // Closest proximity first
    if (distDiff !== 0) {
        return distDiff;
    }
    return a.line1 - b.line1; // Earliest line if same distance
});
```

**Display Format**:
```
└─ 📄 api.js (3 instances)
   ├─ ORDERS ↔ CUSTOMERS (10 lines apart)    ← Closest first (line 45-55)
   ├─ ORDERS ↔ CUSTOMERS (15 lines apart)    ← Next closest (line 200-215)
   └─ ORDERS ↔ CUSTOMERS (22 lines apart)    ← Furthest (line 100-122)
```

**Why Distance First?**
- Closer references = stronger relationship = more relevant
- Tables used in same function/block are more tightly coupled
- Easier to understand code context when references are nearby

### Level 6: Relationship Lines (Within Each Proximity Instance)

**Sort**: Implicit by table name
- First line: Primary table (the one you expanded from)
- Second line: Linked table

**Display Format**:
```
└─ ORDERS ↔ CUSTOMERS (22 lines apart)
   ├─ ORDERS: Line 45      ← Primary table first
   └─ CUSTOMERS: Line 67   ← Linked table second
```

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

### After Sorting (Current Implementation)
```
Database Explorer
├─ 15 tables, 523 references
├─ ORDERS (87 refs)             ✅ Most-used table at top
│  ├─ 🔗 Linked Tables (2)      ✅ Relationships shown first
│  │  └─ CUSTOMERS (5 in 3 files)
│  │     ├─ 📄 api.js (3 inst)  ✅ Most instances first
│  │     │  ├─ ↔ (5 lines)      ✅ Closest proximity first
│  │     │  ├─ ↔ (10 lines)
│  │     │  └─ ↔ (15 lines)
│  │     └─ 📄 reports.js (2)
│  ├─ 📄 database.js (34 refs)  ✅ Most refs first (not alphabetical!)
│  ├─ 📄 reports.js (28 refs)
│  └─ 📄 api.js (25 refs)
│     ├─ Line 12                ✅ Top to bottom
│     ├─ Line 45
│     └─ Line 89
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
- Tables by importance (usage count)
- Files by relevance (reference/instance count)
- Proximity by strength (distance)
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

Comparison between `.vscode/table_refs.json` sorting and tree view sorting:

| Aspect | JSON File | Tree View | Notes |
|--------|-----------|-----------|-------|
| **Tables** | By refs ↓, name ↑ | By refs ↓, name ↑ | ✅ Identical |
| **References** | By path ↑, line ↑ | By path ↑, line ↑ (within file) | ✅ Identical |
| **Files** | By path ↑ | By refs/instances ↓, path ↑ | ⚡ Tree enhanced for UX |
| **Proximity** | By distance ↑, line1 ↑ | By distance ↑, line1 ↑ | ✅ Identical |
| **Relationships** | By occurrences ↓, names ↑ | By occurrences ↓, names ↑ | ✅ Identical |

**Why files differ:**
- **JSON**: Alphabetical for consistency and diffing
- **Tree View**: By count for immediate relevance
- **Benefit**: Stable JSON + optimized display

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
