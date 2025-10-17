# Storage Strategy Recommendations

## Current Situation

After implementing size limits (1000 refs/table, 200 char context), JSON is viable for most projects.

## Storage Options Comparison

### Option 1: JSON File (Current) ✅ RECOMMENDED

**Best for:**
- Small to medium projects (< 1000 tables)
- Teams wanting version control of results
- CI/CD pipelines that parse JSON
- Simple setup and maintenance

**Limits:**
- Max ~50-100 MB file size
- Full file load on startup
- No incremental updates

**Current optimizations:**
- Reference limiting (1000/table)
- Context truncation (200 chars)
- Graceful degradation
- Size warnings

### Option 2: SQLite Database

**Best for:**
- Very large projects (> 1000 tables, > 1M references)
- Need for complex queries
- Incremental analysis updates
- Analytics and reporting

**Implementation:**
```typescript
import * as sqlite3 from 'sqlite3';

// Schema
CREATE TABLE references (
    id INTEGER PRIMARY KEY,
    table_name TEXT,
    file_path TEXT,
    line_number INTEGER,
    context TEXT,
    analyzed_at TIMESTAMP
);
CREATE INDEX idx_table ON references(table_name);
CREATE INDEX idx_file ON references(file_path);

// Query examples
SELECT file_path, COUNT(*) 
FROM references 
WHERE table_name = 'ORDERS' 
GROUP BY file_path;
```

**Pros:**
- Unlimited scalability
- Fast queries with indexes
- Incremental updates
- Low memory usage

**Cons:**
- Binary format (not human-readable)
- Harder to version control
- Requires SQLite dependency
- More complex implementation

### Option 3: Hybrid (JSON + SQLite)

**Best approach for large projects:**

1. **Save full data to SQLite** (primary storage)
2. **Export summary to JSON** (for compatibility)

```typescript
// Save to SQLite for querying
await saveToSQLite(results);

// Also save summary to JSON for CI/CD
const summary = {
    timestamp: results.timestamp,
    summary: results.summary,
    topTables: results.tables.slice(0, 50), // Top 50 only
    relationships: results.relationships.slice(0, 20)
};
fs.writeFileSync('table_refs.json', JSON.stringify(summary, null, 2));
```

**Benefits:**
- Best of both worlds
- JSON for human review and CI/CD
- SQLite for full data and querying
- Version control friendly (summary JSON)

### Option 4: Multiple JSON Files

**Split results into manageable chunks:**

```
.vscode/
  ├─ table_refs_summary.json       (10 KB - summary stats)
  ├─ table_refs_tables.json        (5 MB - top 100 tables)
  ├─ table_refs_relationships.json (2 MB - relationships)
  └─ table_refs_full/              (directory of individual files)
     ├─ ORDERS.json
     ├─ CUSTOMERS.json
     └─ PRODUCTS.json
```

**Benefits:**
- Still JSON (simple, readable)
- Load only what's needed
- Better version control (smaller diffs)
- No size limits per file

**Drawbacks:**
- Multiple files to manage
- More complex loading logic

## Recommendation for Your Project

### Immediate (Current Solution) ✅

**KEEP JSON** with current limits:
- You just implemented size limits
- Try analyzing your 477 tables with limits
- Monitor the file size
- If < 50 MB, you're fine!

### Short-term (If JSON > 50 MB)

**Option A: Reduce Scope**
- Analyze critical tables only (50-100 tables)
- Create domain-specific table lists
- Run multiple targeted analyses

**Option B: Split Files**
- Implement multiple JSON files approach
- Easier than SQLite, still simple
- Better version control

### Long-term (If Scaling Issues)

**Consider SQLite IF:**
- JSON consistently > 100 MB
- Need complex querying
- Building analytics features
- Team needs shared data access

## Implementation Priority

### Priority 1: Current Optimizations ✅ DONE
- [x] Reference limits
- [x] Context truncation
- [x] Size monitoring
- [x] Graceful degradation

### Priority 2: If Still Too Large
- [ ] Split into multiple JSON files
- [ ] Load tables on-demand in tree view
- [ ] Implement pagination in results

### Priority 3: Advanced (Only if Needed)
- [ ] Add SQLite option
- [ ] Create migration tool (JSON → SQLite)
- [ ] Build query interface
- [ ] Add analytics dashboard

## Decision Tree

```
Is JSON file > 50 MB?
├─ NO → Keep current solution ✅
└─ YES
   ├─ Can reduce scope (fewer tables)?
   │  ├─ YES → Filter tables, keep JSON ✅
   │  └─ NO → Continue
   │
   ├─ Need complex queries?
   │  ├─ YES → Use SQLite 🗄️
   │  └─ NO → Continue
   │
   ├─ Need version control of results?
   │  ├─ YES → Split JSON files 📁
   │  └─ NO → Use SQLite 🗄️
   │
   └─ Team needs concurrent access?
      ├─ YES → Use SQLite 🗄️
      └─ NO → Split JSON files 📁
```

## My Strong Recommendation

**For your current needs: STICK WITH JSON** 📄

**Why:**
1. You just fixed the size issue with limits
2. Your 477 tables with limits = manageable JSON
3. JSON is simple, debuggable, shareable
4. No dependencies, no setup, works now
5. Can always migrate to SQLite later if needed

**Action Items:**
1. ✅ Test current solution with your 477 tables
2. ✅ Check resulting file size
3. ❓ If < 50 MB → Done! Keep JSON
4. ❓ If 50-100 MB → Consider filtering tables
5. ❓ If > 100 MB → Then consider SQLite

**Bottom Line:**
Don't optimize prematurely. JSON with limits should work fine for most projects, including yours. Only move to SQLite if you actually hit scalability issues that can't be solved by reducing scope.

## SQLite Example (For Future Reference)

If you do decide to implement SQLite later, here's a starting point:

```typescript
import Database from 'better-sqlite3';

class ResultsDatabase {
    private db: Database.Database;
    
    constructor(workspacePath: string) {
        const dbPath = path.join(workspacePath, '.vscode', 'table_refs.db');
        this.db = new Database(dbPath);
        this.initSchema();
    }
    
    private initSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS references (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                column_number INTEGER,
                context TEXT,
                analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_table ON references(table_name);
            CREATE INDEX IF NOT EXISTS idx_file ON references(file_path);
            
            CREATE TABLE IF NOT EXISTS relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table1 TEXT NOT NULL,
                table2 TEXT NOT NULL,
                file_path TEXT NOT NULL,
                line1 INTEGER,
                line2 INTEGER,
                distance INTEGER,
                analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }
    
    saveReferences(tableUsageMap: Map<string, TableUsage>) {
        const insert = this.db.prepare(`
            INSERT INTO references (table_name, file_path, line_number, column_number, context)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        const insertMany = this.db.transaction((entries) => {
            for (const entry of entries) {
                insert.run(entry.table, entry.file, entry.line, entry.column, entry.context);
            }
        });
        
        // Batch insert
        const entries = [];
        for (const [tableName, usage] of tableUsageMap) {
            for (const ref of usage.references) {
                entries.push({
                    table: tableName,
                    file: ref.filePath,
                    line: ref.line,
                    column: ref.column,
                    context: ref.context
                });
            }
        }
        
        insertMany(entries);
    }
    
    getReferencesForTable(tableName: string): DatabaseReference[] {
        const stmt = this.db.prepare(`
            SELECT file_path, line_number, column_number, context
            FROM references
            WHERE table_name = ?
            ORDER BY file_path, line_number
        `);
        
        return stmt.all(tableName);
    }
}
```

But again: **Only implement if JSON isn't working!**
