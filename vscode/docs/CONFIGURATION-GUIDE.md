# Configuration Guide

Complete reference for all Acacia DB settings and their interactions.

## All Settings

### Core Settings

#### `acaciaDb.tablesViewsFile`
**Type**: `string`  
**Default**: `""`  
**Description**: Path to JSON file containing database schema definitions

**Usage:**
```json
{
  "acaciaDb.tablesViewsFile": "c:/work/schema/tables_views.json"
}
```

**Purpose:**
- Defines which tables to search for
- Reduces false positives by filtering to known tables
- Supports both simple and extended formats

**GUI Alternative**: Click **"Tables/Views Definition"** in the Configuration view

---

#### `acaciaDb.sourceFolder`
**Type**: `string`  
**Default**: `""`  
**Description**: Source code folder to analyze for database references

**Usage:**
```json
{
  "acaciaDb.sourceFolder": "c:/work/myproject/src"
}
```

**Purpose:**
- Limits analysis scope to specific folder
- Improves performance by avoiding unnecessary scanning
- Can target specific modules or services

**GUI Alternative**: Click **"Source Code Folder"** in the Configuration view

---

### Analysis Settings

#### `acaciaDb.scanPatterns`
**Type**: `string[]`  
**Default**: 
```json
[
  "**/*.sql",
  "**/*.js", "**/*.ts",
  "**/*.java", "**/*.cs",
  "**/*.py", "**/*.php", "**/*.rb"
]
```
**Description**: File glob patterns to scan for database references

**Usage:**
```json
{
  "acaciaDb.scanPatterns": [
    "**/*.sql",
    "**/*.java",
    "**/*.xml"
  ]
}
```

**Common Patterns:**
- `**/*.ext` - All files with extension recursively
- `src/**/*.js` - JavaScript files under src folder
- `api/*.ts` - TypeScript files directly in api folder

---

#### `acaciaDb.excludePatterns`
**Type**: `string[]`  
**Default**:
```json
[
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**"
]
```
**Description**: Patterns to exclude from scanning

**Usage:**
```json
{
  "acaciaDb.excludePatterns": [
    "**/node_modules/**",
    "**/target/**",
    "**/*.min.js",
    "**/vendor/**"
  ]
}
```

**Performance Tip**: Exclude build artifacts and dependencies for faster analysis

---

#### `acaciaDb.tablePatterns`
**Type**: `string[]`  
**Default**:
```json
[
  "FROM\\s+([a-zA-Z_][a-zA-Z0-9_]*)",
  "JOIN\\s+([a-zA-Z_][a-zA-Z0-9_]*)",
  "INTO\\s+([a-zA-Z_][a-zA-Z0-9_]*)",
  "UPDATE\\s+([a-zA-Z_][a-zA-Z0-9_]*)"
]
```
**Description**: Regular expression patterns to detect table names

**Note**: This setting is **deprecated** - the extension now uses ripgrep with word boundaries for more accurate detection.

---

### Relationship Settings

#### `acaciaDb.enableRelationshipDetection`
**Type**: `boolean`  
**Default**: `true`  
**Description**: Enable detection of table relationships

**Usage:**
```json
{
  "acaciaDb.enableRelationshipDetection": true
}
```

**When Enabled:**
- Detects tables that appear near each other in code
- Shows "Linked Tables" section in tree view
- Required for `filterToRelationshipsOnly` to work

**When Disabled:**
- Faster analysis (skips relationship detection)
- Smaller file size (no relationship data)
- Tree view shows only files and references

**Recommendation**: Keep enabled unless analysis is too slow

---

#### `acaciaDb.proximityThreshold`
**Type**: `number`  
**Default**: `50`  
**Range**: `1-500`  
**Description**: Number of lines within which tables are considered related

**Usage:**
```json
{
  "acaciaDb.proximityThreshold": 50
}
```

**Effect on Detection:**
- **Lower values (10-25)**: Only very close references (same function/block)
- **Medium values (50-100)**: Same file section
- **Higher values (100-200)**: Broader relationships

**Examples:**
```javascript
// Proximity = 5 lines
function getUserOrders() {
  const user = db.query('SELECT * FROM USERS');     // Line 10
  const orders = db.query('SELECT * FROM ORDERS');  // Line 14
}
// Distance = 4 lines → Related if threshold >= 4
```

**Recommendation**: Start with 50, adjust based on your code structure

---

#### `acaciaDb.filterToRelationshipsOnly`
**Type**: `boolean`  
**Default**: `true` ⭐  
**Description**: Save only references that are part of table relationships

**Usage:**
```json
{
  "acaciaDb.filterToRelationshipsOnly": false  // Disable to save all references
}
```

**When Enabled (Default):**
- **Dramatically reduces file size** (80-95% reduction)
- Saves only references within proximity of another table
- Focuses on table interactions and coupling
- Perfect for large codebases (>100K references)
- **Recommended for most projects**

**When Disabled:**
- Saves all references (comprehensive data)
- Complete analysis including isolated references
- Larger file size (may hit limits on large projects)

**Requirements:**
- `enableRelationshipDetection` must be `true`
- Analysis must detect at least one relationship

**Note**: This is now the **default behavior**. Disable only if you need all references.

**See**: [RELATIONSHIP-FILTERING.md](RELATIONSHIP-FILTERING.md) for detailed information

---

## Configuration Presets

### Small Project (< 50 tables, < 10K references)

**Recommended settings (use defaults):**
```json
{
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 50,
  "acaciaDb.filterToRelationshipsOnly": true  // ← Default
}
```

**Alternative** (if you need all references):
```json
{
  "acaciaDb.filterToRelationshipsOnly": false  // Disable filtering
}
```

**Rationale**: Filtering works well for all project sizes

---

### Medium Project (50-200 tables, 10K-50K references)

**Recommended settings (use defaults):**
```json
{
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 50,
  "acaciaDb.filterToRelationshipsOnly": true  // ← Default
}
```

**Rationale**: Filtering is now default, providing optimal balance

---

### Large Project (200-500 tables, 50K-100K references)

**Recommended settings (use defaults):**
```json
{
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 50,
  "acaciaDb.filterToRelationshipsOnly": true  // ← Already default
}
```

**Rationale**: Default filtering prevents file size issues

---

### Very Large Project (> 500 tables, > 100K references)

**Recommended settings:**
```json
{
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 25,  // ← Tighter threshold
  "acaciaDb.filterToRelationshipsOnly": true
}
```

**Additional tips:**
- Use more specific `sourceFolder` to target specific modules
- Analyze by feature/service rather than entire codebase
- Consider multiple smaller analyses instead of one large one

---

## Setting Interactions

### Relationship Detection + Filtering

```json
{
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 50,
  "acaciaDb.filterToRelationshipsOnly": true
}
```

**Effect**: Maximum size reduction while preserving relationship data

**Process:**
1. Detect relationships (tables within 50 lines)
2. Filter to save only references in relationships
3. Result: 80-95% file size reduction

---

### Relationship Detection Without Filtering

```json
{
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 50,
  "acaciaDb.filterToRelationshipsOnly": false
}
```

**Effect**: Full data with relationship insights

**Process:**
1. Detect relationships (tables within 50 lines)
2. Save all references
3. Result: Complete analysis with relationship info

---

### No Relationship Detection

```json
{
  "acaciaDb.enableRelationshipDetection": false
}
```

**Effect**: Fastest analysis, smallest file (but no filtering available)

**Process:**
1. Skip relationship detection
2. Save all references
3. Result: Basic reference tracking only

**Note**: `filterToRelationshipsOnly` has no effect when relationship detection is disabled

---

## GUI vs JSON Configuration

### GUI Configuration (Recommended for beginners)

**Location**: Activity Bar → Acacia DB → Configuration section

**Settings:**
- ✅ **Tables/Views Definition**: Browse for `tables_views.json`
- ✅ **Source Code Folder**: Browse for source folder
- ❌ **Other settings**: Not available in GUI

**Advantages:**
- Visual file/folder pickers
- Real-time validation
- Status indicators
- Right-click to clear

---

### JSON Configuration (Recommended for advanced users)

**Location**: Settings → Extensions → Acacia DB

**Access via:**
1. `File → Preferences → Settings` (or `Ctrl+,`)
2. Search for "acacia"
3. Click **"Edit in settings.json"** for raw JSON editing

**Advantages:**
- All settings in one place
- Copy/paste between projects
- Version control friendly
- Programmatic configuration

---

## Configuration File Locations

### User Settings
**Applies to**: All VS Code workspaces

**Location:**
- Windows: `%APPDATA%\Code\User\settings.json`
- macOS: `~/Library/Application Support/Code/User/settings.json`
- Linux: `~/.config/Code/User/settings.json`

**Usage**: Global defaults for all projects

---

### Workspace Settings
**Applies to**: Current workspace only

**Location:**
- `.vscode/settings.json` in workspace root

**Usage**: Project-specific configuration

**Example:**
```json
{
  "acaciaDb.tablesViewsFile": "${workspaceFolder}/schema/tables_views.json",
  "acaciaDb.sourceFolder": "${workspaceFolder}/src",
  "acaciaDb.filterToRelationshipsOnly": true
}
```

**Variables:**
- `${workspaceFolder}` - Workspace root path
- `${workspaceFolderBasename}` - Workspace folder name

---

## Troubleshooting Configuration

### Problem: Settings not taking effect

**Solutions:**
1. Reload VS Code: `Ctrl+Shift+P` → "Developer: Reload Window"
2. Check settings scope (user vs workspace)
3. Verify JSON syntax (no trailing commas)
4. Check output panel: View → Output → Acacia DB

---

### Problem: File paths not working

**Solutions:**
1. Use absolute paths: `c:/work/project/schema.json`
2. Use workspace variables: `${workspaceFolder}/schema.json`
3. Check path separators: Use `/` instead of `\` (even on Windows)
4. Verify file exists: Check status in Configuration view

---

### Problem: Filtering not working

**Checklist:**
- ✓ `enableRelationshipDetection` is `true`
- ✓ `filterToRelationshipsOnly` is `true`
- ✓ Analysis found at least one relationship
- ✓ Proximity threshold is reasonable (not too low)

**Check console:**
```
Filtered to X references that are part of relationships
```

If X = 0, no relationships were detected.

---

### Problem: Analysis too slow

**Solutions:**
1. Use more specific `sourceFolder`
2. Add more `excludePatterns`
3. Disable relationship detection temporarily
4. Analyze smaller sections of codebase

---

### Problem: File size too large

**Solutions:**
1. Enable `filterToRelationshipsOnly`
2. Reduce `proximityThreshold` (fewer relationships = smaller file)
3. Use more specific `sourceFolder`
4. Analyze by module/feature instead of entire codebase

---

## Best Practices

### 1. Start Simple
```json
{
  "acaciaDb.tablesViewsFile": "path/to/tables.json",
  "acaciaDb.sourceFolder": "path/to/src"
}
```
Run analysis, check results, then adjust other settings.

### 2. Use Workspace Settings
Store configuration in `.vscode/settings.json` so team members have same setup.

### 3. Commit Configuration
Commit `.vscode/settings.json` to version control for team consistency.

### 4. Test Filtering
Try analysis with filtering disabled first, then enable if file is too large.

### 5. Document Choices
Add comments (in separate README) explaining why specific settings were chosen.

### 6. Monitor File Size
Check console for saved file size. If > 50 MB, enable filtering.

### 7. Adjust Threshold
If relationships seem wrong, adjust `proximityThreshold`:
- Too many relationships → Lower threshold
- Missing relationships → Raise threshold

---

## Example Configurations

### Java Project with JPA
```json
{
  "acaciaDb.tablesViewsFile": "${workspaceFolder}/database/schema.json",
  "acaciaDb.sourceFolder": "${workspaceFolder}/src/main/java",
  "acaciaDb.scanPatterns": ["**/*.java", "**/*.xml"],
  "acaciaDb.excludePatterns": [
    "**/target/**",
    "**/test/**"
  ],
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 100,
  "acaciaDb.filterToRelationshipsOnly": false
}
```

### Node.js API Server
```json
{
  "acaciaDb.tablesViewsFile": "${workspaceFolder}/db/tables.json",
  "acaciaDb.sourceFolder": "${workspaceFolder}/src",
  "acaciaDb.scanPatterns": ["**/*.js", "**/*.ts", "**/*.sql"],
  "acaciaDb.excludePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.test.js"
  ],
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 50,
  "acaciaDb.filterToRelationshipsOnly": true
}
```

### Legacy PHP Application (Large)
```json
{
  "acaciaDb.tablesViewsFile": "c:/projects/legacy/schema/tables.json",
  "acaciaDb.sourceFolder": "c:/projects/legacy/www",
  "acaciaDb.scanPatterns": ["**/*.php", "**/*.sql"],
  "acaciaDb.excludePatterns": [
    "**/vendor/**",
    "**/cache/**"
  ],
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 25,
  "acaciaDb.filterToRelationshipsOnly": true  // Large codebase
}
```

### Python Django Project
```json
{
  "acaciaDb.tablesViewsFile": "${workspaceFolder}/db/schema.json",
  "acaciaDb.sourceFolder": "${workspaceFolder}",
  "acaciaDb.scanPatterns": ["**/*.py", "**/*.sql"],
  "acaciaDb.excludePatterns": [
    "**/venv/**",
    "**/__pycache__/**",
    "**/migrations/**"
  ],
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 75,
  "acaciaDb.filterToRelationshipsOnly": false
}
```

---

## Migration Guide

### From Basic to Filtered Analysis

**Before:**
```json
{
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 50,
  "acaciaDb.filterToRelationshipsOnly": false
}
```

**After:**
```json
{
  "acaciaDb.enableRelationshipDetection": true,
  "acaciaDb.proximityThreshold": 50,
  "acaciaDb.filterToRelationshipsOnly": true  // ← Changed
}
```

**Impact:**
- File size reduced by 80-95%
- Only relationship references saved
- Faster loading and navigation

---

## Summary

| Setting | Default | Purpose | When to Change |
|---------|---------|---------|----------------|
| `tablesViewsFile` | `""` | Database schema | Always set |
| `sourceFolder` | `""` | Analyze target | Always set |
| `enableRelationshipDetection` | `true` | Detect relationships | Rarely (performance) |
| `proximityThreshold` | `50` | Relationship distance | If relationships seem wrong |
| `filterToRelationshipsOnly` | **`true`** ⭐ | Save only relationships | Disable if you need all refs |
| `scanPatterns` | SQL, JS, TS, etc. | File types to scan | Project-specific languages |
| `excludePatterns` | node_modules, dist, etc. | Skip folders | Project-specific structure |

**Quick Start:**
1. Set `tablesViewsFile` and `sourceFolder`
2. Run analysis (filtering enabled by default)
3. Done! 🎉

**Optional**: Disable filtering if you need all references:
```json
{
  "acaciaDb.filterToRelationshipsOnly": false
}
```

**For more information:**
- [RELATIONSHIP-FILTERING.md](RELATIONSHIP-FILTERING.md) - Filtering details
- [ANALYSIS-RESULTS.md](ANALYSIS-RESULTS.md) - Results file format
- [README.md](../README.md) - Extension overview
