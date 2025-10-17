# Change Log

All notable changes to the "acacia-db" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- **Relationship-Only Filtering**: New `filterToRelationshipsOnly` setting to save only references that are part of table relationships
  - Dramatically reduces file size by 80-95% for large codebases
  - Perfect for projects with >100K references or >200 tables
  - Focuses analysis on table interactions and coupling points
  - **Enabled by default** for optimal performance (can be disabled if needed)
- Console logging showing filtered reference count
- Automatic exclusion of tables with zero references:
  - Not saved to JSON file
  - Hidden from tree view display
  - Summary counts only include tables with references
- Comprehensive documentation:
  - `docs/RELATIONSHIP-FILTERING.md` - Detailed filtering guide with examples
  - `docs/CONFIGURATION-GUIDE.md` - Complete reference for all 7 settings
  - `docs/QUICK-REFERENCE.md` - Fast lookup card for common tasks
  - `docs/IMPLEMENTATION-SUMMARY.md` - Technical implementation details

### Changed
- Analysis results now respect `filterToRelationshipsOnly` setting during save
- Updated README with size optimization section and filtering documentation links

### Fixed
- Prevents "Invalid string length" error on extremely large codebases (>500 tables)

## [0.0.1] - 2025-10-17

### Added
- Configuration view for setting tables_views.json and source folder paths
- Activity Bar view with hierarchical tree display of database usage
- Workspace-wide database usage analysis using ripgrep for fast searching
- Filtered analysis based on known tables/views from schema file
- Table relationship detection with configurable proximity threshold (default 50 lines)
- Persistent analysis results saved to `.vscode/table_refs.json`:
  - Complete reference data with file paths, line numbers, and context
  - Table relationship information with proximity instances
  - Summary statistics and metadata
  - Sorted results for consistency (most-referenced tables first)
  - CI/CD integration ready (JSON format)
- Database Explorer tree view with sorting:
  - Tables sorted by reference count (descending), then name (ascending)
  - Files sorted alphabetically within each table
  - References sorted by line number within each file
- Table reference search with quick navigation
- Documentation generation in both Markdown and HTML formats
- Customizable scan patterns and regex patterns for table detection
- Performance optimizations for large codebases:
  - Skip files with >50 tables (likely generated code)
  - Limit to first 20 tables per file for relationship detection
  - Two-pointer algorithm for efficient proximity checking
  - Maximum 100 instances per relationship
- Configuration options:
  - `acaciaDb.enableRelationshipDetection` - Toggle relationship detection
  - `acaciaDb.proximityThreshold` - Lines within which tables are considered related (1-500)
- Comprehensive documentation:
  - Analysis results format and schema
  - Programmatic usage examples (Node.js, Python, PowerShell)
  - Sorting strategy documentation
  - CI/CD integration examples
- Inline actions for common tasks

### Technical
- Uses ripgrep with JSON output format for reliable parsing
- Regex word boundary patterns for accurate table matching
- Optimized relationship detection algorithm (O(n×m×log(m)))
- Error handling and graceful degradation
- Progress reporting for long-running operations
