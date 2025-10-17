# Quick Reference

Fast lookup for common tasks and settings.

## Quick Start (3 Steps)

1. **Set schema file**: Activity Bar → Configuration → "Tables/Views Definition"
2. **Set source folder**: Activity Bar → Configuration → "Source Code Folder"  
3. **Analyze**: Click refresh icon in Database Explorer

✅ Done! Results load automatically next time.

---

## Common Settings

### Basic Configuration
```json
{
  "acaciaDb.tablesViewsFile": "${workspaceFolder}/schema/tables.json",
  "acaciaDb.sourceFolder": "${workspaceFolder}/src"
}
```

### Disable Filtering (If Needed)
```json
{
  "acaciaDb.filterToRelationshipsOnly": false  // Default is true
}
```

### Adjust Relationship Threshold
```json
{
  "acaciaDb.proximityThreshold": 50  // Lines (1-500)
}
```

---

## File Size Guide

**Note**: Filtering is **enabled by default** for optimal file sizes!

| References | With Filtering (Default) | Without Filtering |
|------------|--------------------------|-------------------|
| < 10K | < 1 MB ✓ | < 5 MB |
| 10K-50K | 1-4 MB ✓ | 5-20 MB |
| 50K-100K | 4-10 MB ✓ | 20-50 MB ⚠️ |
| > 100K | 10-20 MB ✓ | > 50 MB ❌ |

**Disable filtering** (only if you need all references):
```json
{
  "acaciaDb.filterToRelationshipsOnly": false
}
```

**With default filtering**: 80-95% smaller files!

---

## Tree View Levels

### Default View (Filtering Enabled)
```
🔹 TABLE (12 refs)  ← Only relationship refs (default)
   ├─ 🔗 Linked Tables (2)
   │  └─ OTHER_TABLE (12 occurrences)
   │     └─ 📄 api.js (12 instances)
   ├─ � api.js (8 refs)  ← Only relationship refs
   └─ 📄 database.js (4 refs)  ← Only relationship refs
```

### Without Filtering (If Disabled)
```
🔹 TABLE (100 refs)  ← All refs including isolated ones
   ├─ 🔗 Linked Tables (3)
   │  ├─ OTHER_TABLE (15 occurrences)
   │  │  ├─ 📄 api.js (5 instances)
   │  │  │  ├─ � TABLE ↔ OTHER_TABLE (lines 10-15)
   ├─ 📄 database.js (34 refs)  ← Includes isolated refs
   │  └─ Line 45: SELECT * FROM TABLE
```

---

## Commands (Ctrl+Shift+P)

| Command | Shortcut | Purpose |
|---------|----------|---------|
| **Analyze Database Usage** | — | Scan workspace for table refs |
| **Find Table References** | — | Search specific table |
| **Generate Documentation** | — | Create markdown report |
| **Show Usage Report** | — | Display HTML report |

---

## Keyboard Navigation

| Action | Shortcut |
|--------|----------|
| Open Command Palette | `Ctrl+Shift+P` |
| Open Settings | `Ctrl+,` |
| Refresh Tree View | Click refresh icon |
| Navigate to Reference | Click line item |
| Collapse All | — |
| Expand All | — |

---

## Troubleshooting

### ❌ No tables found
- Check `tablesViewsFile` path
- Verify JSON format
- Use Configuration view to set path

### ❌ No references found
- Check `sourceFolder` path
- Verify source code contains table names
- Check console for ripgrep errors

### ❌ File too large (> 50 MB)
- Enable `filterToRelationshipsOnly`
- Reduce `proximityThreshold`
- Analyze smaller sections

### ❌ Relationships not detected
- Enable `enableRelationshipDetection`
- Check `proximityThreshold` (increase if needed)
- Verify tables appear near each other in code

### ❌ Filtering not working
- Ensure `enableRelationshipDetection` is `true`
- Check console for "Filtered to X references"
- Verify at least one relationship detected

---

## Configuration Presets

### Default (Recommended for All Projects)
```json
{
  "acaciaDb.filterToRelationshipsOnly": true  // Already default!
}
```

### Save All References (Comprehensive Analysis)
```json
{
  "acaciaDb.filterToRelationshipsOnly": false
}
```

### Extra Large Project (> 500 tables)
```json
{
  "acaciaDb.filterToRelationshipsOnly": true,  // Already default
  "acaciaDb.proximityThreshold": 25  // Tighter threshold
}
```

### Maximum Speed (No Relationships)
```json
{
  "acaciaDb.enableRelationshipDetection": false
}
```

---

## Console Messages

### Success Messages
```
✓ Found X tables in schema file
✓ Analyzing Y files in source folder
✓ Detected Z relationships
✓ Filtered to N references that are part of relationships
✓ Analysis results saved (5.2 MB)
```

### Warning Messages
```
⚠ Table definitions file not found
⚠ Source folder not found
⚠ Ripgrep not found in PATH
⚠ Results file exceeds 10MB
```

### Error Messages
```
✗ Failed to parse tables_views.json
✗ Error running ripgrep
✗ Error saving analysis results
```

---

## File Locations

### Configuration
```
.vscode/settings.json         ← Workspace settings
```

### Results
```
.vscode/table_refs.json       ← Analysis results (auto-generated)
```

### Schema
```
schema/tables_views.json      ← Database schema (user-created)
```

---

## JSON Schema Formats

### Simple Schema (Array)
```json
{
  "tables": ["USERS", "ORDERS", "PRODUCTS"],
  "views": ["USER_SUMMARY"]
}
```

### Extended Schema (Objects)
```json
{
  "tables": [
    {
      "name": "USERS",
      "columns": ["id", "username", "email"],
      "object_type": "TABLE"
    }
  ]
}
```

---

## Performance Tips

1. **Use specific source folder** - Don't analyze entire drive
2. **Exclude build folders** - Add to `excludePatterns`
3. **Filter large projects** - Enable `filterToRelationshipsOnly`
4. **Reduce proximity** - Lower `proximityThreshold` for fewer relationships
5. **Analyze by module** - Split large analyses into smaller ones

---

## When to Use What

### Use Default Settings
- ✓ Small projects (< 50 tables)
- ✓ First time analyzing
- ✓ Need complete reference data

### Enable Filtering
- ✓ Large projects (> 200 tables)
- ✓ File size > 50 MB
- ✓ Focus on table relationships
- ✓ Migration/refactoring planning

### Disable Relationships
- ✓ Fastest analysis needed
- ✓ No interest in relationships
- ✓ Single-table searches

### Increase Proximity
- ✓ Missing relationships
- ✓ Tables in different functions
- ✓ Broader relationship definition

### Decrease Proximity
- ✓ Too many relationships
- ✓ Only want same-block relationships
- ✓ File size too large

---

## Links

- **Full Documentation**: [README.md](../README.md)
- **Configuration Guide**: [CONFIGURATION-GUIDE.md](CONFIGURATION-GUIDE.md)
- **Filtering Details**: [RELATIONSHIP-FILTERING.md](RELATIONSHIP-FILTERING.md)
- **Results Format**: [ANALYSIS-RESULTS.md](ANALYSIS-RESULTS.md)

---

## Support

- **Issues**: Report bugs on GitHub
- **Output Panel**: View → Output → Acacia DB
- **Console**: Help → Toggle Developer Tools → Console

---

**Quick Tip**: Start with defaults, enable filtering if file is too large! 🚀
