# Acacia DB

**Acacia DB** is a Visual Studio Code extension that analyzes database table and column usage across your source code. It helps you find relationships, generate documentation, and optimize database access patterns—perfect for legacy system analysis, migration planning, and performance optimization.

## Features

- **� Activity Bar View**: Dedicated sidebar panel showing:
  - Database analysis summary
  - Hierarchical tree of tables, files, and references
  - Quick navigation to any reference with one click
  - Inline actions for common tasks
- **�🔍 Workspace Analysis**: Scan your entire workspace to find database table and column references across multiple file types (SQL, JavaScript, TypeScript, Java, C#, Python, PHP, Ruby, and more)
- **� Database Usage Reports**: Generate comprehensive reports showing:
  - All tables found in your codebase
  - Number of references per table
  - Files containing database references
  - Exact locations with context
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

### Activity Bar

1. **Click the Acacia DB icon** in the Activity Bar (left sidebar) to open the Database Explorer
2. **Click the Refresh icon** in the view toolbar to analyze your workspace
3. **Expand tables** to see files and individual references
4. **Click any reference** to navigate directly to that line in your code
5. **Right-click tables** for additional actions like copying the table name

### Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) or from the Activity Bar view:

1. **Acacia DB: Analyze Database Usage in Workspace**
   - Scans all files in your workspace for database references
   - Shows a summary of tables found

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

> **Tip**: Use the Configuration view in the Activity Bar for an easier way to set `tablesViewsFile` and `sourceFolder`!

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
Understand how an unfamiliar codebase interacts with its database by quickly mapping all table usage.

### Migration Planning
Identify all locations where specific tables are referenced before database schema changes or migrations.

### Performance Optimization
Find frequently accessed tables and optimize queries by seeing all usage patterns in one place.

### Code Refactoring
Safely refactor database access code by ensuring you've found all references to affected tables.

### Documentation
Generate up-to-date documentation of database usage for new team members or external audits.

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

## Release Notes

### 0.0.1

Initial release of Acacia DB:
- Configuration view for setting tables_views.json and source folder
- Activity Bar view with hierarchical tree display
- Workspace-wide database usage analysis
- Filtered analysis based on known tables/views
- Table reference search with quick navigation
- Documentation generation
- Customizable scan patterns
- HTML and Markdown reports
- Inline actions for common tasks

## Contributing

Found a bug or have a feature request? Please open an issue on our GitHub repository.

## License

This extension is provided as-is for analysis and optimization of database usage in source code.

---

**Enjoy analyzing your database usage with Acacia DB!** 🌿

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
