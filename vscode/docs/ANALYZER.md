# Database Analyzer - Technical Documentation

## How It Works Now (Ripgrep-based)

### Overview
The analyzer uses **ripgrep** (a blazing-fast search tool) to find table references and detect relationships between tables based on code proximity.

### Analysis Flow

```
1. Load Configuration
   ↓
2. Read tables_views.json → Extract table names
   ↓
3. For each table name:
   ↓
4. Execute ripgrep search (case-insensitive, whole word)
   ↓
5. Collect all matches with file path, line number, column, context
   ↓
6. Detect Table Relationships (proximity analysis)
   ↓
7. Return results + relationships
```

### Key Components

#### 1. Configuration Loading
- Reads `tables_views.json` file
- Supports two formats:
  - **Simple**: `["table1", "table2"]`
  - **Extended**: `[{name: "table1", columns: [...]}]`
- Extracts table and view names into `Set<string>`

#### 2. Ripgrep Search
```bash
rg -e "\bTableName\b" -i --json "/source/folder"
```

**Flags:**
- `-e` : Use regex pattern
- `-i` : Ignore case (finds "users", "Users", "USERS")
- `\b...\b` : Word boundaries (matches whole words but works in strings, after dots, etc.)
- `--json` : Output results in JSON Lines format (one JSON object per line)

**Why Regex Instead of `-w` (whole word)?**
- `-w` uses strict word boundaries (alphanumeric only)
- `-w` fails to match: `"users"`, `table.users`, `FROM users WHERE`
- `\b` regex matches in: strings, SQL queries, object properties, etc.

**Output Format (JSON Lines):**
```json
{"type":"match","data":{"path":{"text":"src/users.js"},"lines":{"text":"const result = await db.query(\"SELECT * FROM users\");\n"},"line_number":42,"absolute_offset":1234,"submatches":[{"match":{"text":"users"},"start":15,"end":20}]}}
```

**Parsed Fields:**
- `type`: "match" (we only process match types)
- `data.path.text`: File path
- `data.line_number`: Line number (1-indexed)
- `data.lines.text`: Full line text (context)
- `data.submatches[0].start`: Column position of match

#### 3. Reference Collection
Each match creates a `DatabaseReference`:
```typescript
{
  tableName: "users",
  filePath: "/absolute/path/to/file.js",
  line: 42,
  column: 15,
  context: "const result = await db.query(\"SELECT * FROM users\");"
}
```

#### 4. Relationship Detection

**Proximity Threshold**: 50 lines

**Algorithm:**
1. Group all references by file
2. For each file, map table → line numbers
3. Compare all table pairs
4. If any two tables appear within 50 lines → create relationship
5. Track:
   - Number of co-occurrences
   - Files where they appear together
   - Specific line pairs and distances

**Example:**
```javascript
// File: orders.service.js
10: const user = await db.users.findById(userId);        // users at line 10
15: const order = await db.orders.create({...});         // orders at line 15
```
**Result**: `users ↔ orders` relationship (distance: 5 lines)

### Data Structures

#### TableUsage
```typescript
{
  tableName: "users",
  references: [DatabaseReference[], ...],
  files: Set<string>  // unique files containing this table
}
```

#### TableRelationship
```typescript
{
  table1: "users",
  table2: "orders",
  occurrences: 15,                    // times they appear together
  files: Set<string>,                 // files where they co-occur
  proximityInstances: [
    {
      file: "orders.service.js",
      line1: 10,
      line2: 15,
      distance: 5
    },
    ...
  ]
}
```

## Advantages of Ripgrep Approach

### ✅ Benefits

1. **Speed**: Ripgrep is extremely fast (written in Rust, optimized for searching)
2. **Accuracy**: Whole-word matching reduces false positives
3. **Case-Insensitive**: Finds tables regardless of casing in code
4. **No Regex Complexity**: Simply searches for exact table names
5. **Scalable**: Can handle large codebases efficiently
6. **File Type Agnostic**: Works with any text file (JS, TS, SQL, Java, Python, etc.)

### 📊 Performance

- **Old approach**: Regex scanning ~1000 files × 477 tables = slow
- **New approach**: Ripgrep parallel search for 477 tables = fast
- **Typical speed**: 10,000+ files scanned in seconds

## Report Output

### Summary Section
```markdown
## Summary
- Total tables found: 45
- Total references: 1,523
- Files with database references: 234
- Table relationships detected: 12
```

### Relationships Section
```markdown
## Table Relationships

### users ↔ orders
- Co-occurrences: 15
- Files: 8

#### Examples
- `src/orders.service.js` - Lines 10 & 15 (5 lines apart)
- `src/users.controller.js` - Lines 42 & 89 (47 lines apart)
```

### Tables Section
```markdown
### users
- References: 342
- Files: 67

#### Locations
- `src/auth.js:42:15` - `const user = await User.findById(id);`
- `src/orders.js:88:20` - `JOIN users ON orders.user_id = users.id`
```

## Configuration

### Proximity Threshold
Currently hardcoded to **50 lines**. To adjust:

```typescript
private readonly PROXIMITY_THRESHOLD = 50; // in DatabaseAnalyzer class
```

### Ripgrep Command
Customize search behavior by modifying the command in `searchTableWithRipgrep()`:

```typescript
const pattern = `\\b${this.escapeRegex(tableName)}\\b`;
const command = `rg -e "${pattern}" -i --json "${sourceFolder}"`;
```

**Pattern Explanation:**
- `\\b` : Word boundary (start)
- `${tableName}` : The actual table name (escaped for regex)
- `\\b` : Word boundary (end)

**Additional flags you might want:**
- `--type js` : Only search JavaScript files
- `--type-add 'sql:*.sql'` : Add custom file types
- `-g '!*.test.js'` : Exclude test files
- `--max-count 1000` : Limit matches per file
- `--max-filesize 1M` : Skip files larger than 1MB

**JSON Output Benefits:**
- Structured data - no regex parsing needed
- Accurate column positions
- Handle special characters in paths/content
- Multiple matches per line properly separated

## Future Enhancements

Potential improvements:
- [ ] Configurable proximity threshold
- [ ] Relationship strength scoring
- [ ] Visual graph of table relationships
- [ ] Export relationships as JSON/CSV
- [ ] Filter relationships by minimum occurrences
- [ ] Show relationship context (JOIN, WHERE, etc.)
