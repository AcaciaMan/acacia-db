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
- **JSON format redesigned**: File-based structure instead of table-based
  - Organized by file → references (line, column, tableName)
  - 40% smaller file size due to eliminated duplication
  - More robust serialization (less likely to fail JSON.stringify)
  - Faster loading with direct object access
  - Better for diffing and version control
  - Simplified relationships (just table pairs and counts)
  - See `FILE-BASED-FORMAT.md` for details
- Analysis results now respect `filterToRelationshipsOnly` setting during save
- Tree view now shows only filtered references (matches saved JSON file)
- Tree view displays real-time filtered results immediately after analysis
- **Enhanced sorting across all tree levels** for better relevance:
  - Level 2 (Files): Now sorted by reference count (desc), then alphabetically (tree view only)
  - Level 4 (Relationship Files): Now sorted by instance count (desc), then alphabetically (tree view only)
  - Level 5 (Proximity Instances): Now sorted by distance (asc - closest first), then by line (both JSON and tree)
  - All levels consistently show most relevant results first
  - JSON file maintains alphabetical file order for stability and diffing
- Updated README with size optimization section and filtering documentation links
- **Performance: 2x faster** relationship filtering via caching (eliminates duplicate O(n³) computation)

### Performance
- **Major optimization #1**: Relationship filter algorithm rewritten for 10-20x speedup
  - Changed from O(n² × m²) to O(n×m + f×r log r + f×r×w) complexity
  - File-based grouping: Only compare references within same file
  - Sorted proximity checking: Early termination when beyond threshold
  - Skip single-table files: No relationships possible
  - Reduces filtering time from 10-20s to 0.5-2s on large codebases (477 tables)
  - Added timing metrics to console output for monitoring
  - See `FILTER-ALGORITHM-OPTIMIZATION.md` for detailed analysis
- **Major optimization #2**: Relationship filter results now cached after first computation
  - Eliminates redundant filtering during JSON export (was being called twice)
  - Fixed operation ordering: build cache before save (no more cache misses)
  - Overall analysis now 20-40x faster when relationship filtering is enabled
  - Cache automatically cleared at start of each new analysis
  - See `RELATIONSHIP-FILTER-CACHING.md` and `CACHE-MISS-FIX.md` for details

### Fixed
- **JSON.stringify failures** on extremely large codebases (>10K references)
  - Redesigned to file-based format (40% smaller, more robust)
  - Multiple fallback strategies (remove context, summary only)
  - Eliminated deep nesting and data duplication
- No progress update after relationship detection (added "finalizing analysis" message)
- Tree view not refreshing after analysis completes
- Missing indication that filtering was applied to results
- Long silent pause during JSON export (added detailed progress messages)

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
