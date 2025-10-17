# Relationship Tree View Hierarchy

## Overview

The Database Explorer provides a deep, multi-level tree view for exploring table relationships. You can drill down from a table to see which tables it's related to, in which files those relationships occur, and the exact lines where both tables appear.

## Complete Tree Structure

```
📊 Summary (15 tables, 523 references)
│
└─ 🔹 ORDERS (87 refs)                                    ← Level 1: Table
   │
   ├─ 🔗 Linked Tables (2 tables)                         ← Level 2: Relationships Section
   │  │
   │  ├─ CUSTOMERS (5 relationships in 3 files)           ← Level 3: Linked Table
   │  │  │
   │  │  ├─ 📄 api.js (2 instances)                       ← Level 4: Relationship File
   │  │  │  │
   │  │  │  ├─ ORDERS ↔ CUSTOMERS (22 lines apart)       ← Level 5: Proximity Instance
   │  │  │  │  ├─ ORDERS: Line 45                        ← Level 6: Actual Line (clickable)
   │  │  │  │  └─ CUSTOMERS: Line 67                     ← Level 6: Actual Line (clickable)
   │  │  │  │
   │  │  │  └─ ORDERS ↔ CUSTOMERS (15 lines apart)
   │  │  │     ├─ ORDERS: Line 120
   │  │  │     └─ CUSTOMERS: Line 135
   │  │  │
   │  │  ├─ 📄 reports.js (2 instances)
   │  │  │  └─ ORDERS ↔ CUSTOMERS (25 lines apart)
   │  │  │     ├─ ORDERS: Line 100
   │  │  │     └─ CUSTOMERS: Line 125
   │  │  │
   │  │  └─ 📄 orders.js (1 instance)
   │  │     └─ ORDERS ↔ CUSTOMERS (10 lines apart)
   │  │        ├─ ORDERS: Line 50
   │  │        └─ CUSTOMERS: Line 60
   │  │
   │  └─ PRODUCTS (2 relationships in 1 file)
   │     └─ 📄 catalog.js (2 instances)
   │        ├─ ORDERS ↔ PRODUCTS (30 lines apart)
   │        └─ ORDERS ↔ PRODUCTS (18 lines apart)
   │
   ├─ 📄 api.js (25 refs)                                 ← Level 2: Referenced Files
   │  ├─ Line 12: SELECT * FROM ORDERS                    ← Level 3: Individual Matches
   │  ├─ Line 45: UPDATE ORDERS SET...
   │  └─ Line 89: INSERT INTO ORDERS
   │
   └─ 📄 database.js (34 refs)
      └─ Line 5: FROM ORDERS WHERE
```

## Level Descriptions

### Level 1: Table
- **Icon**: 🔹 (symbol-field)
- **Label**: Table name
- **Description**: Total reference count
- **Sorted**: By reference count (desc), then name (asc)
- **Expandable**: Yes
- **Actions**: Copy table name, search, etc.

### Level 2: Section (Linked Tables or Files)
- **Linked Tables Section**:
  - **Icon**: 🔗 (link)
  - **Label**: "Linked Tables"
  - **Description**: Number of linked tables
  - **Tooltip**: Explanation of relationships
  - **Conditional**: Only shows if relationships exist

- **Files Section**:
  - Files listed after linked tables (if any)

### Level 3: Linked Table
- **Icon**: 🔗 (link)
- **Label**: Linked table name
- **Description**: "X relationships in Y files"
- **Tooltip**: Context about where tables appear together
- **Sorted**: By occurrence count (desc), then name (asc)
- **Expandable**: Yes
- **Click**: Expands to show files

### Level 4: Relationship File
- **Icon**: 📄 (file)
- **Label**: File name
- **Description**: "X instances" (singular/plural)
- **Tooltip**: Full file path
- **Sorted**: By instance count (desc), then alphabetically by file path
- **Expandable**: Yes
- **Click**: Expands to show proximity instances

### Level 5: Proximity Instance
- **Icon**: ↔ (arrow-both)
- **Label**: "TABLE1 ↔ TABLE2"
- **Description**: "X lines apart"
- **Tooltip**: "TABLE1 at line X, TABLE2 at line Y"
- **Sorted**: By distance (asc - closest first), then by first line number (asc)
- **Expandable**: Yes
- **Click**: Expands to show both specific lines
- **Note**: Closest relationships appear first (tightest coupling)

### Level 6: Relationship Line
- **Icon**: 🔹 (symbol-field)
- **Label**: "TABLE: Line X"
- **Description**: None (could add code context)
- **Tooltip**: File path and line number
- **Expandable**: No (leaf node)
- **Click**: Navigates to that line in the editor
- **Interactive**: Direct code navigation

## Navigation Flow

### Discovering Relationships

1. **Start at a table** (e.g., ORDERS)
2. **Expand the table**
3. **See "🔗 Linked Tables"** section (if relationships exist)
4. **Expand "Linked Tables"**
5. **See all related tables** (e.g., CUSTOMERS, PRODUCTS)

### Drilling Down to Code

6. **Click a linked table** (e.g., CUSTOMERS)
7. **See all files** where ORDERS and CUSTOMERS appear together
8. **Click a file** (e.g., api.js)
9. **See all proximity instances** in that file
10. **Click an instance** (e.g., "ORDERS ↔ CUSTOMERS (22 lines apart)")
11. **See both lines**:
    - ORDERS: Line 45
    - CUSTOMERS: Line 67
12. **Click either line** to jump to that exact location in your code

### Quick Navigation Example

```
User clicks: ORDERS → Linked Tables → CUSTOMERS → api.js → Instance → CUSTOMERS: Line 67
Result: Editor opens api.js at line 67, showing CUSTOMERS reference
```

## Sorting Strategy

### Level 3: Linked Tables
```typescript
sortedLinkedTables.sort((a, b) => {
    // Primary: By occurrence count (descending)
    const occDiff = b[1].occurrences - a[1].occurrences;
    if (occDiff !== 0) return occDiff;
    
    // Secondary: By table name (ascending)
    return a[0].localeCompare(b[0]);
});
```

**Why?** Most strongly related tables appear first.

### Level 4: Relationship Files
```typescript
sortedFiles.sort((a, b) => a[0].localeCompare(b[0]));
```

**Why?** Alphabetical order for easy finding.

### Level 5: Proximity Instances
```typescript
sortedInstances.sort((a, b) => a.line1 - b.line1);
```

**Why?** Top-to-bottom order matches file reading.

### Level 6: Relationship Lines
- Always shows table1 first, table2 second
- Matches the proximity instance structure

## Visual Indicators

### Icons
- 🔗 `link` - Linked tables and relationships
- ↔ `arrow-both` - Proximity instances (bidirectional relationship)
- 📄 `file` - Files containing relationships
- 🔹 `symbol-field` - Actual code lines

### Descriptions
- **Linked table**: "5 relationships in 3 files"
- **Relationship file**: "2 instances"
- **Proximity instance**: "22 lines apart"
- **Clear context** at every level

### Tooltips
- Provide additional context on hover
- Show full paths, line numbers
- Explain what each item represents

## Interactive Features

### Clickable Lines
All Level 6 items (relationship lines) are directly clickable:
- Opens the file in editor
- Navigates to exact line
- Highlights the line
- Shows code context

### Context Menu
Right-click support (potential):
- Copy table name
- Copy file path
- Find all references
- Show in explorer

## Use Cases

### 1. Understanding Table Coupling
```
Q: Which tables are most coupled with ORDERS?
A: Expand ORDERS → Linked Tables → See CUSTOMERS (5 relationships) at top
```

### 2. Finding Join Patterns
```
Q: Where do we join ORDERS and CUSTOMERS?
A: ORDERS → Linked Tables → CUSTOMERS → See all 3 files (api.js, reports.js, orders.js)
```

### 3. Reviewing Proximity
```
Q: How close are ORDERS and CUSTOMERS in api.js?
A: ORDERS → Linked Tables → CUSTOMERS → api.js → See "22 lines apart"
```

### 4. Navigating to Code
```
Q: Show me the exact lines where ORDERS and CUSTOMERS appear in api.js
A: Drill down to Level 6, click either line → Editor opens at exact location
```

### 5. Refactoring Planning
```
Q: If I change ORDERS, what related code should I review?
A: Look at Linked Tables section → All related tables listed with file counts
```

## Performance Considerations

### Lazy Loading
- Each level only loads when expanded
- No upfront cost for deep nesting
- Smooth expansion even with many relationships

### Data Structure
- Relationships stored in Map for O(1) lookup
- Instances grouped by file for efficient rendering
- Sorted arrays cached at each level

### Memory
- Tree items created on-demand
- No memory overhead for collapsed sections
- Minimal footprint per node

## Best Practices

### For Users
1. **Start broad**: Look at Linked Tables summary
2. **Drill down**: Expand interesting relationships
3. **Navigate quickly**: Click lines to jump to code
4. **Use tooltips**: Hover for additional context

### For Analysis
1. **Most coupled tables** appear at top of Linked Tables
2. **File distribution** shows spread of relationship
3. **Distance metric** indicates code proximity
4. **Instance count** shows relationship frequency

## Configuration

### Relationship Detection
Control via settings:
```json
{
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 50
}
```

### What Affects Display
- **enableRelationshipDetection**: Shows/hides entire Linked Tables section
- **proximityThreshold**: Determines what counts as "near" (in lines)

## Example Walkthrough

### Scenario: Analyzing Order-Customer Relationship

**Step 1**: Open Database Explorer
```
🔹 ORDERS (87 refs)
   └─ 🔗 Linked Tables (2 tables)
```

**Step 2**: Expand Linked Tables
```
🔗 Linked Tables (2 tables)
   ├─ CUSTOMERS (5 relationships in 3 files)  ← Most coupled
   └─ PRODUCTS (2 relationships in 1 file)
```

**Step 3**: Expand CUSTOMERS
```
CUSTOMERS (5 relationships in 3 files)
   ├─ 📄 api.js (2 instances)
   ├─ 📄 reports.js (2 instances)
   └─ 📄 orders.js (1 instance)
```

**Step 4**: Expand api.js
```
📄 api.js (2 instances)
   ├─ ORDERS ↔ CUSTOMERS (22 lines apart)
   └─ ORDERS ↔ CUSTOMERS (15 lines apart)
```

**Step 5**: Expand first instance
```
ORDERS ↔ CUSTOMERS (22 lines apart)
   ├─ ORDERS: Line 45      ← Click to navigate
   └─ CUSTOMERS: Line 67   ← Click to navigate
```

**Step 6**: Click "CUSTOMERS: Line 67"
- Editor opens api.js
- Cursor moves to line 67
- Line is highlighted
- Code context visible

**Result**: In 6 clicks, went from table to exact code location! 🎯

## Related Documentation

- [TREE-VIEW-SORTING.md](TREE-VIEW-SORTING.md) - Overall tree sorting
- [ANALYSIS-RESULTS.md](ANALYSIS-RESULTS.md) - JSON format for relationships
- [README.md](../README.md) - User-facing documentation
