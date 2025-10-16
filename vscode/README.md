# Acacia DB

**Acacia DB** is a Visual Studio Code extension that analyzes database table and column usage across your source code. It helps you find relationships, generate documentation, and optimize database access patterns—perfect for legacy system analysis, migration planning, and performance optimization.

## Features

- **🔍 Workspace Analysis**: Scan your entire workspace to find database table and column references across multiple file types (SQL, JavaScript, TypeScript, Java, C#, Python, PHP, Ruby, and more)
- **📊 Database Usage Reports**: Generate comprehensive reports showing:
  - All tables found in your codebase
  - Number of references per table
  - Files containing database references
  - Exact locations with context
- **🔎 Table Reference Search**: Quickly find all references to a specific table with an interactive picker to navigate to each location
- **📝 Documentation Generation**: Automatically generate markdown documentation of your database usage
- **⚙️ Customizable Patterns**: Configure file patterns and regex patterns to match your project's structure

## Usage

### Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

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

## Known Issues

- Currently supports basic SQL patterns; complex queries with aliases may not be fully detected
- Performance on very large workspaces (10,000+ files) may require optimization

## Release Notes

### 0.0.1

Initial release of Acacia DB:
- Workspace-wide database usage analysis
- Table reference search
- Documentation generation
- Customizable scan patterns
- HTML and Markdown reports

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
