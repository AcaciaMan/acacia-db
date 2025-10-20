# Acacia DB

**Acacia DB** is a Visual Studio Code extension that analyzes database table and column usage across your source code. It helps you find relationships, generate documentation, and optimize database access patterns—perfect for legacy system analysis, migration planning, and performance optimization.

<img alt="Screenshot_acacia_db" src="https://github.com/user-attachments/assets/73377833-5399-436f-ae57-6484ca3f47a1" />

## Features

- **📊 Database Explorer View**: Dedicated sidebar panel showing:
  - Database analysis summary with statistics
  - Hierarchical tree of tables, linked tables (relationships), files, and references
  - All data sorted by usage and importance
  - Quick navigation to any reference with one click
  - Inline actions for common tasks
- **🔬 Column Explorer View**: Advanced relationship analyzer showing:
  - 5-level tree structure: Tables → Reference Types → Linked Tables → Column Links → Contexts
  - **References** section: Tables this table references (outgoing FKs)
  - **Referenced by** section: Tables that reference this table (incoming FKs)
  - Relation direction indicators: → (forward), ← (backward), ↔ (bidirectional)
  - Smart column matching with word boundary detection
  - File-scoped filtering for accurate relationships
  - Hybrid file reading (streaming for large files, sync for small)
- **🔍 Workspace Analysis**: Scan your entire workspace to find database table and column references across multiple file types (SQL, JavaScript, TypeScript, Java, C#, Python, PHP, Ruby, and more)
- **🔗 Table Relationships**: Automatically detect tables that appear near each other in code (configurable proximity threshold)
- **💾 Persistent Results**: Analysis results automatically saved to `.vscode/table_refs.json`:
  - Complete reference data with file paths, line numbers, and context
  - Table relationship information
  - Summary statistics and metadata
  - Sorted for consistency (most-referenced tables first)
  - CI/CD integration ready (JSON format)
- **📈 Database Usage Reports**: Generate comprehensive reports showing:
  - All tables found in your codebase
  - Number of references per table
  - Files containing database references
  - Exact locations with context
  - Table relationships and coupling analysis
- **🔎 Table Reference Search**: Quickly find all references to a specific table with an interactive picker to navigate to each location
- **📝 Documentation Generation**: Automatically generate markdown documentation of your database usage
- **⚙️ Customizable Patterns**: Configure file patterns and regex patterns to match your project's structure

## Usage

### Configuration View

1. **Open the Acacia DB activity bar** by clicking the database icon in the left sidebar
2. **In the Configuration section**:
   - Click **"Tables/Views Definition"** to select your `tables_views.json` file
   - Click **"Source Code Folder"** to select the folder you want to analyze
   - View real-time status indicators showing if files/folders are found
3. **Optional**: Right-click on configured items to clear them

#### Creating a tables_views.json File

Create a JSON file with your database schema:

**Simple Format** (array of table names):
```json
{
  "tables": [
    "users",
    "orders",
    "products",
    "customers"
  ],
  "views": [
    "user_orders_view",
    "product_summary_view"
  ]
}
```

**Extended Format** (array of table objects with metadata):
```json
{
  "tables": [
    {
      "name": "users",
      "object_type": "TABLE",
      "object_owner": "dbo",
      "columns": ["id", "username", "email", "created_at"],
      "metadata": {
        "table_id": 1001,
        "field_count": 4
      }
    },
    {
      "name": "orders",
      "object_type": "TABLE",
      "object_owner": "dbo",
      "columns": ["id", "user_id", "total", "status"],
      "metadata": {
        "table_id": 1002,
        "field_count": 4
      }
    }
  ]
}
```

Both formats help filter analysis to only known tables/views, reducing false positives.

### Activity Bar Views

#### Database Explorer

1. **Click the Acacia DB icon** in the Activity Bar (left sidebar) to open the Database Explorer
2. **View cached results** - Previously analyzed data loads automatically on startup
3. **Click the Refresh icon** in the view toolbar to analyze your workspace
4. **Expand tables** to see:
   - **Linked Tables** - Tables that appear near this table (if relationships detected)
   - **Referenced Files** - Files containing references to this table
5. **Expand files** to see individual references with line numbers
6. **Click any reference** to navigate directly to that line in your code
7. **Right-click tables** for additional actions like copying the table name
8. **Hover over summary** to see when the analysis was performed

**Note**: Results are automatically saved to `.vscode/table_refs.json` and loaded on startup for instant access!

#### Column Explorer

1. **Click "Analyze Column Relationships"** to start deep column-level analysis
2. **Expand tables** to see relationship categories:
   - **➡️ References** - Tables this table references (outgoing FKs)
   - **⬅️ Referenced by** - Tables that reference this table (incoming FKs)
3. **Expand linked tables** to see column-level relationships:
   - Direction symbols: `→` (forward), `←` (backward), `↔` (bidirectional)
   - Based on column order in schema and usage patterns
4. **Expand column links** to see specific file contexts
5. **Click any context** to navigate to the exact line in code
6. **Use the filter** to focus on specific tables
7. **Observe patterns**:
   - High "Referenced by" count = Lookup/dimension table
   - High "References" count = Transaction/fact table
   - Balanced counts = Mid-level table
   - Same table in both sections = Self-referencing hierarchy

**Example Tree Structure**:
```
📊 Customer (15 relationship(s))
  ├─ ➡️ References (8 table(s))
  │   └─ 🔗 Address (75 refs, 3 column links)
  │       └─ 🔹 AddressId → CustomerAddressId (60 occurrences)
  │           └─ 📄 CustomerService.ts (Line 45)
  └─ ⬅️ Referenced by (7 table(s))
      └─ 🔗 Order (150 refs, 5 column links)
          └─ 🔹 CustomerId → OrderCustomerId (120 occurrences)
              └─ 📄 OrderProcessor.ts (Line 89)
```

### Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) or from the Activity Bar view:

#### Database Explorer Commands

1. **Acacia DB: Analyze Database Usage in Workspace**
   - Scans all files in your workspace for database references
   - Shows a summary of tables found
   - Saves results to `.vscode/table_refs.json`

2. **Acacia DB: Find Table References**
   - Search for a specific table name
   - Browse all references in an interactive list
   - Click to navigate to the exact location

3. **Acacia DB: Generate Database Documentation**
   - Creates a markdown document with a complete database usage report
   - Includes statistics and reference locations

4. **Acacia DB: Show Database Usage Report**
   - Displays an HTML report in a webview panel
   - Formatted for easy reading with syntax highlighting

#### Column Explorer Commands

5. **Acacia DB: Analyze Column Relationships**
   - Performs deep column-level analysis across workspace
   - Detects column pairs that appear together in code
   - Determines relationship direction based on column order
   - Shows References vs Referenced by relationships
   - Optimized for large codebases (streaming file I/O)

6. **Acacia DB: Refresh Column Explorer**
   - Refreshes the Column Explorer tree view

7. **Acacia DB: Filter Column Explorer**
   - Filter tables by name in Column Explorer

8. **Acacia DB: Clear Column Explorer Filter**
   - Remove active filter from Column Explorer

## Configuration

Customize Acacia DB through VS Code settings:

```json
{
  "acaciaDb.scanPatterns": [
    "**/*.sql",
    "**/*.js",
    "**/*.ts",
    "**/*.java",
    "**/*.cs",
    "**/*.py",
    "**/*.php",
    "**/*.rb"
  ],
  "acaciaDb.excludePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**"
  ],
  "acaciaDb.tablePatterns": [
    "FROM\\s+([a-zA-Z_][a-zA-Z0-9_]*)",
    "JOIN\\s+([a-zA-Z_][a-zA-Z0-9_]*)",
    "INTO\\s+([a-zA-Z_][a-zA-Z0-9_]*)",
    "UPDATE\\s+([a-zA-Z_][a-zA-Z0-9_]*)"
  ]
}
```

### Settings

- **`acaciaDb.scanPatterns`**: File glob patterns to scan for database references
- **`acaciaDb.excludePatterns`**: Patterns to exclude from scanning (e.g., node_modules, build folders)
- **`acaciaDb.tablePatterns`**: Regular expression patterns to detect table names in your code
- **`acaciaDb.tablesViewsFile`**: Path to tables_views.json file containing database schema definitions
- **`acaciaDb.sourceFolder`**: Source code folder to analyze for database references
- **`acaciaDb.enableRelationshipDetection`**: Enable detection of table relationships (default: true)
- **`acaciaDb.proximityThreshold`**: Number of lines within which tables are considered related (default: 50, range: 1-500)
- **`acaciaDb.filterToRelationshipsOnly`**: Save only references that are part of table relationships (default: **true**) - **dramatically reduces file size** (80-95%)

> **Tip**: Use the Configuration view in the Activity Bar for an easier way to set `tablesViewsFile` and `sourceFolder`!
> 
> **Note**: `filterToRelationshipsOnly` is **enabled by default** to optimize file size. Disable it if you need to save all references. See [docs/RELATIONSHIP-FILTERING.md](docs/RELATIONSHIP-FILTERING.md) for details.

## Analysis Results

After running an analysis, Acacia DB automatically saves the results to `.vscode/table_refs.json` in your workspace. This file contains:

- **Complete reference data**: All table references with file paths, line numbers, and context
- **Table relationships**: Tables that appear near each other in code
- **Summary statistics**: Total tables, references, files analyzed, and relationship counts
- **Analysis metadata**: Timestamp and configuration used

### Benefits

- **Fast reload**: Extension loads previous results on startup
- **CI/CD integration**: Parse the JSON file in build pipelines
- **Custom reporting**: Build your own analysis tools
- **Change tracking**: Track database usage evolution over time
- **Team sharing**: Optionally commit results for team visibility

### Size Optimization

For large codebases with many tables (>200) or references (>100K), you may encounter file size issues. Acacia DB provides several optimizations:

1. **Relationship-Only Filtering** (Recommended): Enable `acaciaDb.filterToRelationshipsOnly` to save only references that are part of table relationships (within proximity threshold of another table). This reduces file size by **80-95%** while keeping the most interesting data. See [docs/RELATIONSHIP-FILTERING.md](docs/RELATIONSHIP-FILTERING.md) for details.

2. **Automatic Limits**: The extension automatically limits references per table (1000 max) and truncates context strings (200 chars) to prevent crashes.

3. **Graceful Degradation**: If results are too large, the extension saves summary-only data and notifies you.

### Example Structure

```json
{
  "timestamp": "2025-10-17T14:30:00.000Z",
  "config": { "tablesViewsFile": "...", "sourceFolder": "..." },
  "tables": [
    {
      "tableName": "CUSTOMERS",
      "references": [...],
      "files": [...]
    }
  ],
  "relationships": [...],
  "summary": {
    "totalTables": 150,
    "tablesWithReferences": 87,
    "totalReferences": 523,
    "totalFiles": 42,
    "relationshipCount": 15
  }
}
```

See [docs/ANALYSIS-RESULTS.md](docs/ANALYSIS-RESULTS.md) for complete schema and usage examples.

> **Note**: The `.vscode/table_refs.json` file is automatically added to `.gitignore`. Commit it if you want to share results with your team.

## Use Cases

### Legacy System Analysis
- **Database Explorer**: Quickly map all table usage patterns across the codebase
- **Column Explorer**: Understand foreign key relationships and data dependencies
- Identify parent-child table hierarchies automatically

### Migration Planning
- **Database Explorer**: Find all locations where specific tables are referenced
- **Column Explorer**: See which tables depend on each other via columns
- Understand impact of schema changes by viewing relationship chains

### Performance Optimization
- **Database Explorer**: Find frequently accessed tables for query optimization
- **Column Explorer**: Identify most-used column relationships for index planning
- Detect N+1 query patterns by analyzing column usage frequency

### Schema Understanding
- **Column Explorer References section**: See what lookup/dimension tables are needed
- **Column Explorer Referenced by section**: Identify which tables depend on this one
- **Relation direction**: Understand primary key → foreign key flows
- Pattern recognition: Distinguish lookup tables from transaction tables

### Code Refactoring
- **Database Explorer**: Ensure you've found all references to affected tables
- **Column Explorer**: Understand column-level dependencies before changes
- Safely rename columns by seeing all usage contexts

### Documentation
- Generate up-to-date documentation of database usage
- **Column Explorer**: Auto-document foreign key relationships
- Export relationship diagrams for team members or audits

## Requirements

- Visual Studio Code v1.105.0 or higher
- **ripgrep (rg)** - Fast search tool for analyzing source code
  - Windows: `choco install ripgrep` or `scoop install ripgrep`
  - macOS: `brew install ripgrep`
  - Linux: `apt install ripgrep` or `dnf install ripgrep`
  - Or download from: https://github.com/BurntSushi/ripgrep/releases

## Known Issues

- Requires ripgrep (rg) to be installed and available in system PATH
- Performance on very large workspaces depends on ripgrep speed
- Table relationships detection works best with consistent coding patterns
- For extremely large codebases (>100K references), enable `filterToRelationshipsOnly` to prevent file size issues
- Column Explorer requires `tables_views.json` with column definitions for accurate analysis
- Relation direction depends on meaningful column ordering in schema (primary keys first)

## Release Notes

### 0.0.1

Initial release of Acacia DB:

#### Database Explorer
- Configuration view for setting tables_views.json and source folder
- Activity Bar view with hierarchical tree display (sorted by reference count)
- Workspace-wide database usage analysis using ripgrep
- Filtered analysis based on known tables/views from schema file
- Table relationship detection (configurable proximity threshold)
- Persistent analysis results in `.vscode/table_refs.json`:
  - Complete reference data with metadata
  - Sorted results (most-referenced tables first)
  - CI/CD integration ready
  - Programmatic access for custom tools
- Table reference search with quick navigation
- Documentation generation (Markdown and HTML)
- Customizable scan patterns and regex patterns

#### Column Explorer
- **5-level tree hierarchy**: Tables → Reference Types → Linked Tables → Column Links → Contexts
- **References/Referenced by sections**: Clear distinction between outgoing and incoming relationships
- **Relation direction detection**: Based on column order numbers and table name length
  - → Forward (lower order → higher order, typical PK→FK)
  - ← Backward (higher order → lower order, reverse reference)
  - ↔ Bidirectional (used in both directions)
- **Smart column matching**: Trie-based algorithm with word boundary detection
- **File-scoped filtering**: Only links tables actually found in each file
- **Performance optimizations**:
  - Column-first algorithm (20× faster for files with many tables)
  - Hybrid file reading (streaming for large files ≥50KB, sync for small)
  - Pre-filtering to relevant files (2+ tables)
  - Skip comment lines and empty lines
- **Smart sorting**: Most connected tables first, most frequent relationships first
- **Pattern recognition**: Easily identify lookup vs transaction tables

#### General
- Performance optimizations for large codebases
- Inline actions for common tasks
- Comprehensive documentation with examples

## Contributing

Found a bug or have a feature request? Please open an issue on our [GitHub repository](https://github.com/AcaciaMan/acacia-db).

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/AcaciaMan/acacia-db/issues)
- **Documentation**: Check the [docs](docs/) folder for detailed guides

---

**Enjoy analyzing your database usage with Acacia DB!** 🌿
