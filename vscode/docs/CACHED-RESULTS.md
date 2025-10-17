# Cached Results Loading

## Overview

The Database Explorer automatically loads previously saved analysis results from `.vscode/table_refs.json` on startup, providing instant access to your last analysis without re-scanning the workspace.

## How It Works

### Automatic Loading on Startup

When the extension activates:
1. **Check for cached results**: Looks for `.vscode/table_refs.json` in the workspace
2. **Load if exists**: Parses the JSON file and populates the tree view
3. **Display immediately**: Shows cached results in the Database Explorer
4. **No delay**: Instant display of tables, files, and references

```typescript
constructor(analyzer: DatabaseAnalyzer) {
    this.analyzer = analyzer;
    // Load cached results on startup
    this.loadCachedResults();
}

private async loadCachedResults(): Promise<void> {
    const cachedResults = await this.analyzer.loadResults();
    if (cachedResults) {
        this.tableUsageMap = cachedResults;
        this.lastAnalysisTimestamp = this.analyzer.getLastAnalysisTimestamp();
        this.refresh();
    }
}
```

### Analysis Timestamp

The summary item in the Database Explorer shows when the analysis was performed:
- **Tooltip**: Hover over the summary to see the full timestamp
- **Format**: Local date and time format
- **Updates**: Automatically updated after each analysis

**Example**:
```
📊 15 tables, 523 references
Tooltip: "15 tables, 523 references
         Analyzed: 10/17/2025, 2:30:45 PM"
```

## User Experience

### First Time (No Cache)

```
Database Explorer
└─ No database references found. Click "Analyze" to scan.
```

User clicks "Analyze" → Results appear → Saved to `.vscode/table_refs.json`

### Subsequent Opens (With Cache)

```
Database Explorer
├─ 📊 15 tables, 523 references  (Hover: "Analyzed: 10/17/2025, 2:30:45 PM")
├─ 🔹 ORDERS (87 refs)
├─ 🔹 CUSTOMERS (65 refs)
└─ 🔹 PRODUCTS (43 refs)
```

Results appear instantly without clicking "Analyze"!

### After Re-analysis

User clicks "Analyze" again → Results update → Timestamp refreshes → File saved

## Benefits

### 1. Instant Access
- ⚡ No waiting for re-analysis on startup
- 📊 Results available immediately
- 🔄 Previously analyzed data always accessible

### 2. Preserved State
- 💾 Results persist between VS Code sessions
- 🔒 No data loss on restart
- 📝 Historical analysis preserved

### 3. Offline Work
- 🌐 No need to re-run analysis to view results
- 💡 Review results without active workspace scan
- 🔍 Navigate references from cached data

### 4. Performance
- 🚀 Zero startup delay for tree view
- ⚡ No ripgrep execution on startup
- 💨 Instant tree population

### 5. Workflow Continuity
- ↩️ Pick up where you left off
- 🎯 Context preserved across sessions
- 📍 Last analysis always available

## When Results Are Cached

### Saved
Results are automatically saved to `.vscode/table_refs.json` after:
- ✅ Running "Analyze Database Usage in Workspace" command
- ✅ Clicking "Analyze" button in Database Explorer
- ✅ Successful completion of analysis

### Loaded
Results are automatically loaded:
- ✅ On extension activation (VS Code startup)
- ✅ When opening workspace with existing cache file
- ✅ After Database Explorer view is first created

### Updated
Cache is updated (overwritten) when:
- ✅ Running a new analysis
- ✅ Analysis completes successfully
- ✅ New results are available

## Cache Invalidation

### Manual Refresh
To force a fresh analysis:
1. Click "Analyze" button in Database Explorer toolbar
2. Results will be re-scanned from source code
3. Cache file will be overwritten with new results

### Automatic
Cache is NOT automatically invalidated when:
- ❌ Source code files change
- ❌ tables_views.json is modified
- ❌ Configuration changes

**Recommendation**: Run analysis after significant code changes.

### Delete Cache
To start fresh:
1. Delete `.vscode/table_refs.json` file
2. Reopen VS Code or reload window
3. Database Explorer will show "No database references found"
4. Click "Analyze" to create new cache

## Implementation Details

### Files Modified
- **`src/databaseAnalyzer.ts`**:
  - `lastAnalysisTimestamp` property to store timestamp
  - `getLastAnalysisTimestamp()` method to retrieve it
  - `loadResults()` stores timestamp from JSON
  - `analyzeWorkspace()` sets timestamp before saving

- **`src/databaseTreeView.ts`**:
  - `loadCachedResults()` loads on constructor
  - `lastAnalysisTimestamp` property
  - Summary item tooltip shows timestamp
  - `analyze()` updates timestamp after analysis

### Data Flow

```
Extension Activation
  ↓
DatabaseTreeDataProvider constructor
  ↓
loadCachedResults()
  ↓
analyzer.loadResults()
  ↓
Read .vscode/table_refs.json
  ↓
Parse JSON → Map<string, TableUsage>
  ↓
Store timestamp from JSON
  ↓
Refresh tree view
  ↓
Display cached results ✨
```

### Performance Impact
- **Startup**: ~10-50ms to read and parse JSON
- **Memory**: Minimal (same as fresh analysis)
- **UI**: Instant tree rendering

## Best Practices

### 1. Regular Re-analysis
- Run analysis after significant code changes
- Keep cache fresh with current codebase state
- Set reminders for periodic analysis

### 2. Share Cache (Optional)
- Commit `.vscode/table_refs.json` to git (if useful for team)
- Or add to `.gitignore` (workspace-specific data)
- Consider team's workflow needs

### 3. CI/CD Integration
- Generate fresh analysis in CI pipeline
- Compare with previous results
- Track changes over time

### 4. Large Codebases
- Initial analysis may take time
- Subsequent loads are instant
- Re-analyze only when needed

### 5. Trust but Verify
- Cached results reflect last analysis time
- Check timestamp to verify freshness
- Re-analyze if data seems stale

## Troubleshooting

### Results Not Loading

**Problem**: Tree view shows "No database references found" despite existing cache

**Solutions**:
1. Check if `.vscode/table_refs.json` exists in workspace
2. Verify JSON file is valid (not corrupted)
3. Check console for error messages (F12 → Developer Tools)
4. Delete cache and run fresh analysis

### Old Results Displayed

**Problem**: Tree view shows outdated results

**Solution**:
1. Click "Analyze" button to refresh
2. Verify timestamp in summary tooltip
3. Check if cache file was updated (file modification date)

### Performance Issues

**Problem**: Slow loading on startup

**Solution**:
1. Check cache file size (large files take longer)
2. Consider reducing tables in tables_views.json
3. Disable relationship detection if not needed
4. Normal size: <1MB, loads instantly

## Related Documentation

- [ANALYSIS-RESULTS.md](ANALYSIS-RESULTS.md) - JSON file format
- [TREE-VIEW-SORTING.md](TREE-VIEW-SORTING.md) - Tree view sorting
- [README.md](../README.md) - User documentation
