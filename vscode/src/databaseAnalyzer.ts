import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Ripgrep JSON output interfaces
interface RipgrepMatch {
    type: 'match' | 'begin' | 'end' | 'context' | 'summary';
    data: {
        path: { text: string };
        lines: { text: string };
        line_number: number;
        absolute_offset: number;
        submatches: Array<{
            match: { text: string };
            start: number;
            end: number;
        }>;
    };
}

export interface DatabaseReference {
    tableName: string;
    columnName?: string;
    filePath: string;
    line: number;
    column: number;
    context: string;
}

export interface TableUsage {
    tableName: string;
    references: DatabaseReference[];
    files: Set<string>;
}

export interface TableRelationship {
    table1: string;
    table2: string;
    occurrences: number;
    files: Set<string>;
    proximityInstances: Array<{
        file: string;
        line1: number;
        line2: number;
        distance: number;
    }>;
}

export interface AnalysisConfig {
    tablesViewsFile?: string;
    sourceFolder?: string;
}

export interface TablesViewsSchema {
    tables?: Array<{
        name: string;
        object_type?: string;
        object_owner?: string;
        columns?: string[];
        metadata?: any;
    } | string>;
    views?: string[];
    [key: string]: any;
}

// Compact file-based format for JSON storage
// Match format: "line;column;tableName" (e.g., "10;15;users")
interface CompactFileBasedResults {
    timestamp: string;
    config: AnalysisConfig;
    files: {
        [filePath: string]: string[]; // Array of compact match strings
    };
    summary: {
        totalTables: number;
        tablesWithReferences: number;
        totalReferences: number;
        totalFiles: number;
    };
}

export class DatabaseAnalyzer {
    private config?: AnalysisConfig;
    private knownTables: Set<string> = new Set();
    private tableNames: string[] = [];
    private relationships: Map<string, TableRelationship> = new Map();
    private lastAnalysisTimestamp?: string;
    private relationshipReferencesCache?: Set<string>; // Cache for relationship filter
    
    constructor() {
    }

    private getProximityThreshold(): number {
        const config = vscode.workspace.getConfiguration('acaciaDb');
        return config.get<number>('proximityThreshold', 50);
    }

    getLastAnalysisTimestamp(): string | undefined {
        return this.lastAnalysisTimestamp;
    }

    setConfig(config: AnalysisConfig): void {
        this.config = config;
        this.loadTablesFromFile();
    }

    private loadTablesFromFile(): void {
        this.knownTables.clear();
        this.tableNames = [];
        
        if (!this.config?.tablesViewsFile) {
            return;
        }

        try {
            if (fs.existsSync(this.config.tablesViewsFile)) {
                const content = fs.readFileSync(this.config.tablesViewsFile, 'utf8');
                const schema: TablesViewsSchema = JSON.parse(content);
                
                // Load tables - support both old format (string array) and new format (object array)
                if (schema.tables && Array.isArray(schema.tables)) {
                    schema.tables.forEach(table => {
                        if (typeof table === 'string') {
                            // Old format: simple string array
                            this.knownTables.add(table.toLowerCase());
                            this.tableNames.push(table);
                        } else if (typeof table === 'object' && table.name) {
                            // New format: object with 'name' property
                            this.knownTables.add(table.name.toLowerCase());
                            this.tableNames.push(table.name);
                        }
                    });
                }
                
                // Load views
                if (schema.views && Array.isArray(schema.views)) {
                    schema.views.forEach(view => {
                        this.knownTables.add(view.toLowerCase());
                        this.tableNames.push(view);
                    });
                }

                console.log(`Loaded ${this.knownTables.size} tables/views from ${this.config.tablesViewsFile}`);
            }
        } catch (error) {
            console.error('Error loading tables/views file:', error);
            vscode.window.showWarningMessage(`Failed to load tables file: ${error}`);
        }
    }

    private escapeRegex(str: string): string {
        // Escape special regex characters to use table name literally in regex
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async analyzeWorkspace(): Promise<Map<string, TableUsage>> {
        if (!this.config?.tablesViewsFile) {
            vscode.window.showWarningMessage('Please configure tables_views.json file first');
            return new Map();
        }

        if (this.tableNames.length === 0) {
            vscode.window.showWarningMessage('No tables found in tables_views.json file');
            return new Map();
        }

        const sourceFolder = this.config.sourceFolder || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!sourceFolder) {
            vscode.window.showErrorMessage('No source folder configured or workspace opened');
            return new Map();
        }

        const tableUsageMap = new Map<string, TableUsage>();
        this.relationships.clear();
        this.relationshipReferencesCache = undefined; // Clear cache for new analysis

        // Get configuration settings
        const config = vscode.workspace.getConfiguration('acaciaDb');
        const enableRelationships = config.get<boolean>('enableRelationshipDetection', true);
        const filterToRelationshipsOnly = config.get<boolean>('filterToRelationshipsOnly', true);
        const proximityThreshold = config.get<number>('proximityThreshold', 50);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing database usage with ripgrep",
            cancellable: false
        }, async (progress) => {
            const totalTables = this.tableNames.length;
            
            for (let i = 0; i < this.tableNames.length; i++) {
                const tableName = this.tableNames[i];
                progress.report({ 
                    increment: (100 / totalTables),
                    message: `Searching for: ${tableName} (${i + 1}/${totalTables})`
                });
                
                const references = await this.searchTableWithRipgrep(tableName, sourceFolder);
                
                if (references.length > 0) {
                    const files = new Set<string>();
                    references.forEach(ref => files.add(ref.filePath));
                    
                    tableUsageMap.set(tableName, {
                        tableName,
                        references,
                        files
                    });
                }
            }

            // Detect relationships between tables (optional, can be resource intensive)
            if (enableRelationships) {
                progress.report({ message: 'Detecting table relationships...' });
                try {
                    this.detectTableRelationships(tableUsageMap);
                    progress.report({ message: 'Table relationships detected, finalizing analysis...' });
                } catch (error) {
                    console.error('Error detecting relationships:', error);
                    vscode.window.showWarningMessage('Relationship detection failed. Analysis completed without relationships.');
                }
            }

            // Apply filtering to the map if enabled (builds the cache for saveResults to use)
            let filteredMap: Map<string, TableUsage> = tableUsageMap;
            
            if (filterToRelationshipsOnly && this.relationships.size > 0) {
                filteredMap = this.applyRelationshipFilter(tableUsageMap, proximityThreshold);
                // Cache is now built and ready for saveResults to use
            }

            // Save results to .vscode/table_refs.json (will use the cached relationship references)
            progress.report({ message: 'Preparing results for JSON export...' });
            this.lastAnalysisTimestamp = new Date().toISOString();
            await this.saveResults(tableUsageMap, progress);
            progress.report({ message: 'Analysis complete!' });
        });

        const relationshipMsg = this.relationships.size > 0 
            ? ` Detected ${this.relationships.size} table relationships.`
            : '';
        
        const filterMsg = filterToRelationshipsOnly && this.relationships.size > 0
            ? ' Tree view filtered to show only relationship references.'
            : '';
        
        vscode.window.showInformationMessage(
            `Found ${tableUsageMap.size} tables with references.${relationshipMsg}${filterMsg}`
        );
        
        // Return filtered map for tree view (was built inside withProgress block)
        // Apply filtering again if needed (should use cache, so it's fast)
        if (filterToRelationshipsOnly && this.relationships.size > 0) {
            return this.applyRelationshipFilter(tableUsageMap, proximityThreshold);
        }

        return tableUsageMap;
    }

    private applyRelationshipFilter(tableUsageMap: Map<string, TableUsage>, proximityThreshold: number): Map<string, TableUsage> {
        // Use cached relationship references if available, otherwise build it
        let relationshipReferences: Set<string>;
        
        if (this.relationshipReferencesCache) {
            relationshipReferences = this.relationshipReferencesCache;
            console.log(`Using cached relationship references (${relationshipReferences.size} references)`);
        } else {
            const startTime = Date.now();
            
            // Build a set of reference IDs that are part of relationships
            relationshipReferences = new Set<string>();
            
            // OPTIMIZATION: Group all references by file first - O(n × m) instead of O(n² × m²)
            // Map: filePath -> Array<{tableName, line, ref}>
            const fileRefMap = new Map<string, Array<{tableName: string, line: number, ref: DatabaseReference}>>();
            
            for (const [tableName, usage] of tableUsageMap) {
                for (const ref of usage.references) {
                    if (!fileRefMap.has(ref.filePath)) {
                        fileRefMap.set(ref.filePath, []);
                    }
                    fileRefMap.get(ref.filePath)!.push({
                        tableName,
                        line: ref.line,
                        ref
                    });
                }
            }
            
            // OPTIMIZATION: For each file, sort references by line number and check proximity
            // This is O(f × r log r + f × r) where f = files, r = refs per file
            // Much better than O(n² × m²) for large datasets
            for (const [filePath, refs] of fileRefMap) {
                // Skip files with only one table referenced (no relationships possible)
                const uniqueTables = new Set(refs.map(r => r.tableName));
                if (uniqueTables.size < 2) {
                    continue;
                }
                
                // Sort by line number for efficient proximity checking
                refs.sort((a, b) => a.line - b.line);
                
                // Check each reference against nearby references (within proximity threshold)
                for (let i = 0; i < refs.length; i++) {
                    const ref = refs[i];
                    
                    // Only check references within proximity threshold (forward direction)
                    for (let j = i + 1; j < refs.length; j++) {
                        const otherRef = refs[j];
                        const distance = otherRef.line - ref.line;
                        
                        // Since sorted, if distance > threshold, no need to check further
                        if (distance > proximityThreshold) {
                            break;
                        }
                        
                        // Found a relationship if different tables within proximity
                        if (ref.tableName !== otherRef.tableName && distance > 0) {
                            relationshipReferences.add(`${ref.tableName}|${ref.ref.filePath}|${ref.line}`);
                            relationshipReferences.add(`${otherRef.tableName}|${otherRef.ref.filePath}|${otherRef.line}`);
                        }
                    }
                }
            }
            
            const elapsed = Date.now() - startTime;
            // Cache for subsequent use (in saveResults)
            this.relationshipReferencesCache = relationshipReferences;
            console.log(`Built and cached relationship references (${relationshipReferences.size} references) in ${elapsed}ms`);
        }
        
        // Create new filtered map
        const filteredMap = new Map<string, TableUsage>();
        
        for (const [tableName, usage] of tableUsageMap) {
            const filteredReferences = usage.references.filter(ref => 
                relationshipReferences.has(`${tableName}|${ref.filePath}|${ref.line}`)
            );
            
            // Only include tables that have at least one filtered reference
            if (filteredReferences.length > 0) {
                const filteredFiles = new Set<string>();
                filteredReferences.forEach(ref => filteredFiles.add(ref.filePath));
                
                filteredMap.set(tableName, {
                    tableName,
                    references: filteredReferences,
                    files: filteredFiles
                });
            }
        }
        
        return filteredMap;
    }

    private async saveResults(tableUsageMap: Map<string, TableUsage>, progress?: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return;
            }

            // Create .vscode directory if it doesn't exist
            const vscodePath = path.join(workspaceFolder.uri.fsPath, '.vscode');
            if (!fs.existsSync(vscodePath)) {
                fs.mkdirSync(vscodePath, { recursive: true });
            }

            // Get configuration for filtering
            progress?.report({ message: 'Applying filtering and sorting rules...' });
            const config = vscode.workspace.getConfiguration('acaciaDb');
            const filterToRelationshipsOnly = config.get<boolean>('filterToRelationshipsOnly', true);

            // Use cached relationship references (already built during analysis)
            let relationshipReferences = new Set<string>();
            if (filterToRelationshipsOnly && this.relationships.size > 0) {
                if (this.relationshipReferencesCache) {
                    relationshipReferences = this.relationshipReferencesCache;
                    console.log(`Using cached relationship references for JSON export (${relationshipReferences.size} references)`);
                } else {
                    console.log('Cache miss - building relationship references for JSON export');
                    const proximityThreshold = this.getProximityThreshold();
                    const filteredMap = this.applyRelationshipFilter(tableUsageMap, proximityThreshold);
                    relationshipReferences = this.relationshipReferencesCache || new Set<string>();
                }
            }

            // Convert to compact file-based format
            progress?.report({ message: 'Converting to compact format...' });
            const fileMap: { [filePath: string]: string[] } = {};
            
            for (const [tableName, usage] of tableUsageMap) {
                for (const ref of usage.references) {
                    // Apply filtering if enabled
                    if (filterToRelationshipsOnly && relationshipReferences.size > 0) {
                        if (!relationshipReferences.has(`${tableName}|${ref.filePath}|${ref.line}`)) {
                            continue; // Skip references not in relationships
                        }
                    }

                    // Initialize file array if needed
                    if (!fileMap[ref.filePath]) {
                        fileMap[ref.filePath] = [];
                    }

                    // Add compact reference: "line;column;tableName"
                    fileMap[ref.filePath].push(`${ref.line};${ref.column};${tableName}`);
                }
            }

            // Sort references within each file by line number
            progress?.report({ message: 'Sorting references...' });
            for (const filePath in fileMap) {
                fileMap[filePath].sort((a, b) => {
                    // Extract line numbers from compact format
                    const lineA = parseInt(a.split(';')[0], 10);
                    const lineB = parseInt(b.split(';')[0], 10);
                    return lineA - lineB;
                });
            }

            // Calculate summary statistics
            const allTables = new Set<string>();
            let totalReferences = 0;
            
            for (const [tableName, usage] of tableUsageMap) {
                if (usage.references.length > 0) {
                    allTables.add(tableName);
                }
                totalReferences += usage.references.length;
            }

            const results: CompactFileBasedResults = {
                timestamp: new Date().toISOString(),
                config: this.config || {},
                files: fileMap,
                summary: {
                    totalTables: this.tableNames.length,
                    tablesWithReferences: allTables.size,
                    totalReferences: Object.values(fileMap).reduce((sum, refs) => sum + refs.length, 0),
                    totalFiles: Object.keys(fileMap).length
                }
            };

            // Write to file
            progress?.report({ message: 'Writing JSON file to disk...' });
            const outputPath = path.join(vscodePath, 'table_refs.json');
            
            try {
                const jsonString = JSON.stringify(results, null, 2);
                const fileSizeMB = Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024);
                
                fs.writeFileSync(outputPath, jsonString, 'utf8');
                
                progress?.report({ message: `Saved ${fileSizeMB.toFixed(1)} MB JSON file successfully` });
                console.log(`Analysis results saved to ${outputPath} (${fileSizeMB.toFixed(2)} MB)`);
                console.log(`  - ${results.summary.totalReferences} references across ${results.summary.totalFiles} files`);
                console.log(`  - ${results.summary.tablesWithReferences} tables with references`);
                console.log(`  - Compact format: "line;column;tableName"`);
                
                if (fileSizeMB > 10) {
                    vscode.window.showWarningMessage(
                        `Analysis results file is large (${fileSizeMB.toFixed(1)} MB). Consider reducing the number of tables analyzed.`
                    );
                }
            } catch (stringifyError: any) {
                console.error('JSON stringify failed:', stringifyError);
                
                // Last resort: save just summary
                fs.writeFileSync(outputPath, JSON.stringify({
                    timestamp: results.timestamp,
                    config: results.config,
                    summary: results.summary,
                    note: 'Full results were too large to save.'
                }, null, 2), 'utf8');
                
                vscode.window.showWarningMessage(
                    'Results are extremely large. Saved summary only. Consider analyzing fewer tables or enabling relationship filtering.'
                );
            }
        } catch (error) {
            console.error('Error saving analysis results:', error);
            vscode.window.showErrorMessage(`Failed to save analysis results: ${error}`);
        }
    }

    async loadResults(): Promise<Map<string, TableUsage> | null> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return null;
            }

            const outputPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'table_refs.json');
            
            if (!fs.existsSync(outputPath)) {
                return null;
            }

            const content = fs.readFileSync(outputPath, 'utf8');
            const results: CompactFileBasedResults = JSON.parse(content);

            // Convert compact file-based format back to table-based Map
            const tableUsageMap = new Map<string, TableUsage>();
            
            // Group references by table
            for (const [filePath, compactRefs] of Object.entries(results.files)) {
                for (const compactRef of compactRefs) {
                    // Parse compact format: "line;column;tableName"
                    const parts = compactRef.split(';');
                    if (parts.length !== 3) {
                        console.warn(`Invalid compact reference format: ${compactRef}`);
                        continue;
                    }

                    const line = parseInt(parts[0], 10);
                    const column = parseInt(parts[1], 10);
                    const tableName = parts[2];

                    // Get or create table entry
                    if (!tableUsageMap.has(tableName)) {
                        tableUsageMap.set(tableName, {
                            tableName: tableName,
                            references: [],
                            files: new Set()
                        });
                    }

                    const tableUsage = tableUsageMap.get(tableName)!;
                    
                    // Add reference (context is empty in compact format)
                    tableUsage.references.push({
                        tableName: tableName,
                        filePath: filePath,
                        line: line,
                        column: column,
                        context: '' // Not stored in compact format
                    });
                    
                    // Add file to set
                    tableUsage.files.add(filePath);
                }
            }

            // Recalculate relationships from loaded data
            this.relationships.clear();
            console.log('Recalculating relationships from loaded data...');
            
            // Build file-to-tables map for efficient relationship detection
            const fileTablesMap = new Map<string, Map<string, number[]>>();
            
            for (const [filePath, compactRefs] of Object.entries(results.files)) {
                const tableLines = new Map<string, number[]>();
                
                for (const compactRef of compactRefs) {
                    const parts = compactRef.split(';');
                    if (parts.length !== 3) {continue;}
                    
                    const line = parseInt(parts[0], 10);
                    const tableName = parts[2];
                    
                    if (!tableLines.has(tableName)) {
                        tableLines.set(tableName, []);
                    }
                    tableLines.get(tableName)!.push(line);
                }
                
                fileTablesMap.set(filePath, tableLines);
            }
            
            // Detect relationships using proximity threshold
            const proximityThreshold = this.getProximityThreshold();
            const MAX_INSTANCES_PER_RELATIONSHIP = 100;
            
            for (const [filePath, tableLines] of fileTablesMap) {
                const tables = Array.from(tableLines.keys());
                
                for (let i = 0; i < tables.length; i++) {
                    for (let j = i + 1; j < tables.length; j++) {
                        const table1 = tables[i];
                        const table2 = tables[j];
                        const lines1 = tableLines.get(table1)!;
                        const lines2 = tableLines.get(table2)!;
                        
                        // Sort lines for efficient proximity check
                        const sortedLines1 = lines1.sort((a, b) => a - b);
                        const sortedLines2 = lines2.sort((a, b) => a - b);
                        
                        let proximityCount = 0;
                        
                        for (const line1 of sortedLines1) {
                            const minLine = line1 - proximityThreshold;
                            const maxLine = line1 + proximityThreshold;
                            
                            for (const line2 of sortedLines2) {
                                if (line2 < minLine) {continue;}
                                if (line2 > maxLine) {break;}
                                
                                const distance = Math.abs(line1 - line2);
                                
                                if (distance <= proximityThreshold && distance > 0) {
                                    proximityCount++;
                                    
                                    const key = [table1, table2].sort().join('|');
                                    
                                    if (!this.relationships.has(key)) {
                                        this.relationships.set(key, {
                                            table1,
                                            table2,
                                            occurrences: 0,
                                            files: new Set(),
                                            proximityInstances: []
                                        });
                                    }
                                    
                                    const rel = this.relationships.get(key)!;
                                    rel.occurrences++;
                                    rel.files.add(filePath);
                                    
                                    if (rel.proximityInstances.length < MAX_INSTANCES_PER_RELATIONSHIP) {
                                        rel.proximityInstances.push({
                                            file: filePath,
                                            line1,
                                            line2,
                                            distance
                                        });
                                    }
                                }
                            }
                            
                            if (proximityCount >= MAX_INSTANCES_PER_RELATIONSHIP) {
                                break;
                            }
                        }
                    }
                }
            }

            console.log(`Loaded compact analysis results from ${outputPath} (analyzed at ${results.timestamp})`);
            console.log(`  - ${results.summary.totalReferences} references across ${results.summary.totalFiles} files`);
            console.log(`  - ${results.summary.tablesWithReferences} tables with references`);
            console.log(`  - ${this.relationships.size} relationships recalculated`);
            console.log(`  - Compact format: "line;column;tableName"`);
            this.lastAnalysisTimestamp = results.timestamp;
            return tableUsageMap;
        } catch (error) {
            console.error('Error loading analysis results:', error);
            return null;
        }
    }

    private async searchTableWithRipgrep(tableName: string, sourceFolder: string): Promise<DatabaseReference[]> {
        const references: DatabaseReference[] = [];
        
        try {
            // Check if ripgrep is available
            const rgCommand = process.platform === 'win32' ? 'rg' : 'rg';
            
            // Build regex pattern with word boundaries that works in source code
            // Matches table name with word boundaries, but also matches within quotes, after dots, etc.
            // Pattern: (?i)\b${tableName}\b matches with word boundaries, case-insensitive
            const pattern = `\\b${this.escapeRegex(tableName)}\\b`;
            
            // Build ripgrep command with JSON output and regex search
            // -e = use regex pattern, -i = case insensitive, --json = JSON output
            const command = `${rgCommand} -e "${pattern}" -i --json "${sourceFolder}"`;
            
            const { stdout } = await execAsync(command, { 
                maxBuffer: 100 * 1024 * 1024, // 100MB buffer
                windowsHide: true 
            });
            
            // Parse ripgrep JSON output (one JSON object per line)
            const lines = stdout.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                try {
                    const result: RipgrepMatch = JSON.parse(line);
                    
                    // Only process "match" type results (not "begin", "end", "context", etc.)
                    if (result.type === 'match' && result.data) {
                        const data = result.data;
                        const filePath = data.path.text;
                        const lineNumber = data.line_number;
                        const lineText = data.lines.text.trim();
                        
                        // Find the column position of the match
                        // data.submatches contains the match positions
                        let column = 0;
                        if (data.submatches && data.submatches.length > 0) {
                            column = data.submatches[0].start;
                        }
                        
                        references.push({
                            tableName,
                            filePath: path.resolve(filePath),
                            line: lineNumber,
                            column: column,
                            context: lineText
                        });
                    }
                } catch (parseError) {
                    // Skip invalid JSON lines
                    console.warn(`Failed to parse ripgrep JSON line: ${parseError}`);
                }
            }
        } catch (error: any) {
            // Error code 1 means no matches found (not an error)
            if (error.code !== 1) {
                console.error(`Ripgrep error for table ${tableName}:`, error.message);
            }
        }
        
        return references;
    }

    private detectTableRelationships(tableUsageMap: Map<string, TableUsage>): void {
        const fileTableMap = new Map<string, Map<string, number[]>>();
        
        // Group references by file and table
        for (const [tableName, usage] of tableUsageMap) {
            for (const ref of usage.references) {
                if (!fileTableMap.has(ref.filePath)) {
                    fileTableMap.set(ref.filePath, new Map());
                }
                const tableLines = fileTableMap.get(ref.filePath)!;
                if (!tableLines.has(tableName)) {
                    tableLines.set(tableName, []);
                }
                tableLines.get(tableName)!.push(ref.line);
            }
        }

        const MAX_INSTANCES_PER_RELATIONSHIP = 100; // Limit stored instances
        let processedFiles = 0;
        const totalFiles = fileTableMap.size;

        // Find tables that appear within proximity threshold (optimized)
        for (const [filePath, tableLines] of fileTableMap) {
            processedFiles++;
            
            // Skip files with too many tables (likely false positives or generated code)
            if (tableLines.size > 50) {
                console.log(`Skipping ${filePath} - too many tables (${tableLines.size})`);
                continue;
            }

            const tables = Array.from(tableLines.keys());
            
            // Limit processing for very large files
            if (tables.length > 20) {
                console.log(`Limiting analysis for ${filePath} - many tables (${tables.length})`);
            }

            for (let i = 0; i < tables.length && i < 20; i++) {
                for (let j = i + 1; j < tables.length && j < 20; j++) {
                    const table1 = tables[i];
                    const table2 = tables[j];
                    const lines1 = tableLines.get(table1)!;
                    const lines2 = tableLines.get(table2)!;
                    
                    // Optimize: sort lines first for efficient proximity check
                    const sortedLines1 = lines1.sort((a, b) => a - b);
                    const sortedLines2 = lines2.sort((a, b) => a - b);
                    
                    // Use two-pointer technique to find proximities efficiently
                    let foundProximity = false;
                    let proximityCount = 0;
                    const proximityThreshold = this.getProximityThreshold();
                    
                    for (const line1 of sortedLines1) {
                        // Binary search for lines within proximity
                        const minLine = line1 - proximityThreshold;
                        const maxLine = line1 + proximityThreshold;
                        
                        for (const line2 of sortedLines2) {
                            if (line2 < minLine) {continue;}
                            if (line2 > maxLine) {break;}
                            
                            const distance = Math.abs(line1 - line2);
                            
                            if (distance <= proximityThreshold && distance > 0) {
                                foundProximity = true;
                                proximityCount++;
                                
                                const key = [table1, table2].sort().join('|');
                                
                                if (!this.relationships.has(key)) {
                                    this.relationships.set(key, {
                                        table1,
                                        table2,
                                        occurrences: 0,
                                        files: new Set(),
                                        proximityInstances: []
                                    });
                                }
                                
                                const rel = this.relationships.get(key)!;
                                rel.occurrences++;
                                rel.files.add(filePath);
                                
                                // Limit stored instances to prevent memory issues
                                if (rel.proximityInstances.length < MAX_INSTANCES_PER_RELATIONSHIP) {
                                    rel.proximityInstances.push({
                                        file: filePath,
                                        line1,
                                        line2,
                                        distance
                                    });
                                }
                            }
                        }
                        
                        // Early exit if we found enough proximities for this pair
                        if (proximityCount >= MAX_INSTANCES_PER_RELATIONSHIP) {
                            break;
                        }
                    }
                }
            }
            
            // Yield to prevent blocking (every 100 files)
            if (processedFiles % 100 === 0) {
                console.log(`Relationship detection progress: ${processedFiles}/${totalFiles} files`);
            }
        }
    }

    getRelationships(): Map<string, TableRelationship> {
        return this.relationships;
    }

    async findTableReferences(tableName: string): Promise<DatabaseReference[]> {
        const tableUsageMap = await this.analyzeWorkspace();
        const usage = tableUsageMap.get(tableName);
        return usage ? usage.references : [];
    }

    generateReport(tableUsageMap: Map<string, TableUsage>): string {
        let report = '# Database Usage Report\n\n';
        report += `Generated: ${new Date().toLocaleString()}\n\n`;
        report += `## Summary\n\n`;
        report += `- Total tables found: ${tableUsageMap.size}\n`;
        
        let totalReferences = 0;
        const filesSet = new Set<string>();
        
        tableUsageMap.forEach(usage => {
            totalReferences += usage.references.length;
            usage.files.forEach(file => filesSet.add(file));
        });
        
        report += `- Total references: ${totalReferences}\n`;
        report += `- Files with database references: ${filesSet.size}\n`;
        report += `- Table relationships detected: ${this.relationships.size}\n\n`;
        
        // Table Relationships Section
        if (this.relationships.size > 0) {
            report += `## Table Relationships\n\n`;
            const proximityThreshold = this.getProximityThreshold();
            report += `Tables appearing within ${proximityThreshold} lines of each other:\n\n`;
            
            const sortedRels = Array.from(this.relationships.values())
                .sort((a, b) => b.occurrences - a.occurrences);
            
            for (const rel of sortedRels) {
                report += `### ${rel.table1} ↔ ${rel.table2}\n\n`;
                report += `- Co-occurrences: ${rel.occurrences}\n`;
                report += `- Files: ${rel.files.size}\n\n`;
                
                report += `#### Examples\n\n`;
                for (const instance of rel.proximityInstances.slice(0, 5)) {
                    const relativePath = vscode.workspace.asRelativePath(instance.file);
                    report += `- \`${relativePath}\` - Lines ${instance.line1} & ${instance.line2} (${instance.distance} lines apart)\n`;
                }
                
                if (rel.proximityInstances.length > 5) {
                    report += `\n_...and ${rel.proximityInstances.length - 5} more instances_\n`;
                }
                
                report += '\n';
            }
        }
        
        report += `## Tables\n\n`;
        
        // Sort tables by number of references
        const sortedTables = Array.from(tableUsageMap.entries())
            .sort((a, b) => b[1].references.length - a[1].references.length);
        
        for (const [tableName, usage] of sortedTables) {
            report += `### ${tableName}\n\n`;
            report += `- References: ${usage.references.length}\n`;
            report += `- Files: ${usage.files.size}\n\n`;
            
            report += `#### Locations\n\n`;
            for (const ref of usage.references.slice(0, 10)) { // Limit to first 10
                const relativePath = vscode.workspace.asRelativePath(ref.filePath);
                report += `- \`${relativePath}:${ref.line}:${ref.column}\` - \`${ref.context}\`\n`;
            }
            
            if (usage.references.length > 10) {
                report += `\n_...and ${usage.references.length - 10} more references_\n`;
            }
            
            report += '\n';
        }
        
        return report;
    }
}
