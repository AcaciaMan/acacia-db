import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Simple match structure: file -> line, column, table
interface Match {
    file: string;
    line: number;
    column: number;
    table: string;
}

// Compact JSON format for storage
interface CompactResults {
    timestamp: string;
    config: {
        tablesViewsFile?: string;
        sourceFolder?: string;
    };
    files: {
        [filePath: string]: string[]; // ["line;column;tableName", ...]
    };
    summary: {
        totalTables: number;
        totalReferences: number;
        totalFiles: number;
    };
}

// Display structures for tree view
export interface DatabaseReference {
    tableName: string;
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

// Memory-efficient indexed structures
export interface ProximityInstance {
    fileId: number;      // Index instead of string (4 bytes vs 100+ bytes)
    line1: number;
    column1: number;
    line2: number;
    column2: number;
    distance: number;
}

export interface TableRelationship {
    table1Id: number;    // Index instead of string (4 bytes vs 20+ bytes)
    table2Id: number;    // Index instead of string (4 bytes vs 20+ bytes)
    occurrences: number;
    fileCount: number;
    proximityInstances?: ProximityInstance[];
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

export class DatabaseAnalyzer {
    private config?: AnalysisConfig;
    private tableNames: string[] = [];
    private lastAnalysisTimestamp?: string;
    private relationships: Map<string, TableRelationship> = new Map();
    
    // Memory-efficient indexing structures
    private tableIndex: Map<string, number> = new Map();  // table name -> index
    private tableList: string[] = [];                     // index -> table name
    private fileIndex: Map<string, number> = new Map();   // file path -> index
    private fileList: string[] = [];                      // index -> file path
    
    constructor() {}

    private getProximityThreshold(): number {
        const config = vscode.workspace.getConfiguration('acaciaDb');
        return config.get<number>('proximityThreshold', 50);
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Read a specific line from a file without loading entire file into memory.
     * Memory-efficient for large files.
     */
    private readLineFromFile(filePath: string, lineNumber: number): string {
        try {
            // Use a simple approach: read file in chunks until we find the line
            const fd = fs.openSync(filePath, 'r');
            const bufferSize = 64 * 1024; // 64KB chunks
            const buffer = Buffer.alloc(bufferSize);
            
            let currentLine = 1;
            let currentLineContent = '';
            let bytesRead = 0;
            let position = 0;
            
            while (true) {
                bytesRead = fs.readSync(fd, buffer, 0, bufferSize, position);
                if (bytesRead === 0) {
                    break; // End of file
                }
                
                const chunk = buffer.toString('utf8', 0, bytesRead);
                
                for (let i = 0; i < chunk.length; i++) {
                    const char = chunk[i];
                    
                    if (char === '\n') {
                        if (currentLine === lineNumber) {
                            fs.closeSync(fd);
                            const trimmed = currentLineContent.trim();
                            return trimmed.length > 200 ? trimmed.substring(0, 200) + '...' : trimmed;
                        }
                        currentLine++;
                        currentLineContent = '';
                    } else if (char !== '\r') {
                        if (currentLine === lineNumber) {
                            currentLineContent += char;
                        }
                    }
                }
                
                position += bytesRead;
                
                // If we've passed the target line, stop
                if (currentLine > lineNumber) {
                    break;
                }
            }
            
            fs.closeSync(fd);
            
            // Handle last line without newline
            if (currentLine === lineNumber && currentLineContent) {
                const trimmed = currentLineContent.trim();
                return trimmed.length > 200 ? trimmed.substring(0, 200) + '...' : trimmed;
            }
            
            return '';
        } catch (err) {
            // Ignore file read errors, return empty string
            return '';
        }
    }

    async analyzeWorkspace(): Promise<Map<string, TableUsage>> {
        try {
            const tableUsageMap = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing Database Usage',
                cancellable: false
            }, async (progress) => {
                // Step 1: Load configuration
                progress.report({ message: 'Loading configuration...', increment: 5 });
                const config = await this.loadConfiguration();
                if (!config) {
                    throw new Error('Configuration not loaded');
                }

                const { tablesViewsFile, sourceFolder } = config;
                if (!tablesViewsFile || !sourceFolder) {
                    throw new Error('Tables file or source folder not configured');
                }

                this.config = config;

                // Step 2: Load table names
                progress.report({ message: 'Loading table definitions...', increment: 5 });
                this.tableNames = await this.loadTableNames(tablesViewsFile);
                
                if (this.tableNames.length === 0) {
                    throw new Error('No tables found in definition file');
                }

                console.log(`Loaded ${this.tableNames.length} tables from ${tablesViewsFile}`);

                // Step 3: Search for all tables and collect matches
                progress.report({ message: 'Searching for table references...', increment: 10 });
                const allMatches = await this.searchAllTables(sourceFolder, progress);
                
                console.log(`Found ${allMatches.length} total matches`);
                
                // Warn if no matches found
                if (allMatches.length === 0) {
                    console.warn('⚠️ No table references found!');
                    console.warn(`   Tables file: ${tablesViewsFile}`);
                    console.warn(`   Source folder: ${sourceFolder}`);
                    console.warn(`   Make sure the source folder contains code that references these tables.`);
                }

                // Step 4: Sort matches by file, then by line
                progress.report({ message: 'Sorting results...', increment: 10 });
                allMatches.sort((a, b) => {
                    if (a.file !== b.file) {
                        return a.file.localeCompare(b.file);
                    }
                    return a.line - b.line;
                });

                // Step 5: Filter out matches without relationships (proximity filter)
                progress.report({ message: 'Applying proximity filter...', increment: 20 });
                const filteredMatches = this.filterByProximity(allMatches);
                
                console.log(`After proximity filter: ${filteredMatches.length} matches (removed ${allMatches.length - filteredMatches.length})`);

                // Step 6: Save to table_refs.json
                progress.report({ message: 'Saving results...', increment: 20 });
                await this.saveResults(filteredMatches);

                // Step 7: Calculate relationships from filtered matches
                progress.report({ message: 'Calculating relationships...', increment: 10 });
                this.calculateRelationships(filteredMatches);

                // Step 8: Convert to TableUsageMap for tree view
                progress.report({ message: 'Preparing tree view...', increment: 10 });
                const usageMap = this.convertToTableUsageMap(filteredMatches);

                progress.report({ message: 'Analysis complete!', increment: 10 });
                
                return usageMap;
            });

            return tableUsageMap;
        } catch (error) {
            console.error('Analysis error:', error);
            vscode.window.showErrorMessage(`Analysis failed: ${error}`);
            return new Map();
        }
    }

    private async loadConfiguration(): Promise<AnalysisConfig | null> {
        const config = vscode.workspace.getConfiguration('acaciaDb');
        const tablesViewsFile = config.get<string>('tablesViewsFile');
        const sourceFolder = config.get<string>('sourceFolder');

        if (!tablesViewsFile || !sourceFolder) {
            vscode.window.showWarningMessage('Please configure tables file and source folder first');
            return null;
        }

        if (!fs.existsSync(tablesViewsFile)) {
            vscode.window.showErrorMessage(`Tables file not found: ${tablesViewsFile}`);
            return null;
        }

        if (!fs.existsSync(sourceFolder)) {
            vscode.window.showErrorMessage(`Source folder not found: ${sourceFolder}`);
            return null;
        }

        return { tablesViewsFile, sourceFolder };
    }

    private async loadTableNames(tablesViewsFile: string): Promise<string[]> {
        try {
            const content = fs.readFileSync(tablesViewsFile, 'utf8');
            const schema: TablesViewsSchema = JSON.parse(content);
            const tableNames: string[] = [];

            if (schema.tables) {
                for (const table of schema.tables) {
                    if (typeof table === 'string') {
                        tableNames.push(table);
                    } else if (table.name) {
                        tableNames.push(table.name);
                    }
                }
            }

            if (schema.views) {
                tableNames.push(...schema.views);
            }

            return tableNames;
        } catch (error) {
            console.error('Error loading table names:', error);
            throw error;
        }
    }

    private async searchAllTables(
        sourceFolder: string, 
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<Match[]> {
        const allMatches: Match[] = [];
        const totalTables = this.tableNames.length;
        const progressPerTable = 60 / totalTables; // 60% of progress for searching

        for (let i = 0; i < totalTables; i++) {
            const tableName = this.tableNames[i];
            progress.report({ 
                message: `Searching for "${tableName}" (${i + 1}/${totalTables})...`
            });

            const matches = await this.searchTableWithRipgrep(tableName, sourceFolder);
            
            // MEMORY PROTECTION: Use iteration instead of spread to avoid stack overflow with huge arrays
            if (matches.length > 0) {
                for (const match of matches) {
                    allMatches.push(match);
                }
            }

            if ((i + 1) % 10 === 0) {
                progress.report({ increment: progressPerTable * 10 });
            }
        }

        return allMatches;
    }

    private async searchTableWithRipgrep(tableName: string, sourceFolder: string): Promise<Match[]> {
        const matches: Match[] = [];
        
        try {
            const rgCommand = process.platform === 'win32' ? 'rg' : 'rg';
            const pattern = `\\b${this.escapeRegex(tableName)}\\b`;
            
            // Use --vimgrep format: outputs one line per match (even for multiple matches on same source line)
            // Format: filepath:line:column:content
            // --vimgrep implies --line-number --column --no-heading
            // --max-count limits matches per file to prevent buffer overflow
            const command = `${rgCommand} -e "${pattern}" -i --vimgrep --max-count=500 "${sourceFolder}"`;
            
            // Debug: Log first table search to help troubleshoot configuration
            if (tableName === this.tableNames[0]) {
                console.log(`[DEBUG] Searching in: ${sourceFolder}`);
                console.log(`[DEBUG] First table: "${tableName}"`);
                console.log(`[DEBUG] Command: ${command}`);
            }
            
            let stdout = '';
            let hadError = false;
            try {
                const result = await execAsync(command, { 
                    maxBuffer: 100 * 1024 * 1024, // 100MB buffer (much smaller since no JSON overhead)
                    windowsHide: true 
                });
                stdout = result.stdout;
            } catch (error: any) {
                hadError = true;
                // execAsync throws even when stdout has data, so capture it
                if (error.stdout) {
                    stdout = error.stdout;
                }
                
                // Debug first table
                if (tableName === this.tableNames[0]) {
                    console.log(`[DEBUG] Error caught - code: ${error.code}, stdout length: ${stdout.length}, stderr: ${error.stderr?.substring(0, 100)}`);
                }
                
                // Check for specific error types
                if (error.message && error.message.includes('maxBuffer')) {
                    console.error(`Table "${tableName}" has too many matches (exceeded buffer limit), skipping...`);
                    return []; // Return empty to skip this table
                }
                
                // Error code 1 usually means no matches, but we might have partial output
                if (error.code !== 1 && !stdout) {
                    console.error(`Ripgrep error for table ${tableName}:`, error.message);
                    return [];
                }
            }
            
            // Debug first table
            if (tableName === this.tableNames[0]) {
                console.log(`[DEBUG] Had error: ${hadError}, stdout length: ${stdout.length}, lines: ${stdout.split('\n').filter(l => l.trim()).length}`);
            }
            
            if (!stdout) {
                return matches; // No output, return empty
            }
            
            const lines = stdout.split('\n').filter(line => line.trim());
            
            // Parse vimgrep format: filepath:line:column:content
            // Each match gets its own line, even if multiple matches are on the same source line
            // Note: On Windows, paths like "c:\path\file.txt" have a colon after drive letter!
            for (const line of lines) {
                // Handle Windows absolute paths (e.g., "c:\...") vs Unix paths
                let searchStart = 0;
                
                // On Windows, check if line starts with drive letter pattern (e.g., "c:\")
                if (process.platform === 'win32' && line.length > 2 && line[1] === ':' && (line[2] === '\\' || line[2] === '/')) {
                    // Skip the drive letter colon (e.g., "c:")
                    searchStart = 2;
                }
                
                // Find colons after the file path
                const firstColon = line.indexOf(':', searchStart);
                if (firstColon === -1) {
                    continue;
                }
                
                const secondColon = line.indexOf(':', firstColon + 1);
                if (secondColon === -1) {
                    continue;
                }
                
                const thirdColon = line.indexOf(':', secondColon + 1);
                if (thirdColon === -1) {
                    continue;
                }
                
                const filePath = path.resolve(line.substring(0, firstColon));
                const lineNumber = parseInt(line.substring(firstColon + 1, secondColon), 10);
                const columnNumber = parseInt(line.substring(secondColon + 1, thirdColon), 10);
                
                // Validate parsed values
                if (isNaN(lineNumber) || isNaN(columnNumber)) {
                    continue;
                }
                
                matches.push({
                    file: filePath,
                    line: lineNumber,
                    column: columnNumber,
                    table: tableName
                });
            }
        } catch (error: any) {
            // Unexpected error
            console.error(`Unexpected error searching for table ${tableName}:`, error.message);
        }
        
        return matches;
    }

    private filterByProximity(matches: Match[]): Match[] {
        const proximityThreshold = this.getProximityThreshold();
        const filtered: Match[] = [];
        
        // Group matches by file
        const fileGroups = new Map<string, Match[]>();
        for (const match of matches) {
            if (!fileGroups.has(match.file)) {
                fileGroups.set(match.file, []);
            }
            fileGroups.get(match.file)!.push(match);
        }

        // Process each file
        for (const [file, fileMatches] of fileGroups) {
            // Get unique tables in this file
            const uniqueTables = new Set(fileMatches.map(m => m.table));
            
            // If only one table in file, skip all matches (no relationships possible)
            if (uniqueTables.size < 2) {
                continue;
            }

            // Check each match for proximity to a different table
            for (const match of fileMatches) {
                let hasRelationship = false;
                
                // Look for matches with different table within proximity
                for (const otherMatch of fileMatches) {
                    if (match.table !== otherMatch.table) {
                        const distance = Math.abs(match.line - otherMatch.line);
                        if (distance <= proximityThreshold) {
                            hasRelationship = true;
                            break;
                        }
                    }
                }
                
                if (hasRelationship) {
                    filtered.push(match);
                }
            }
        }

        return filtered;
    }

    private async saveResults(matches: Match[]): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return;
            }

            const vscodePath = path.join(workspaceFolder.uri.fsPath, '.vscode');
            if (!fs.existsSync(vscodePath)) {
                fs.mkdirSync(vscodePath, { recursive: true });
            }

            // Convert matches to compact format
            const files: { [filePath: string]: string[] } = {};
            
            for (const match of matches) {
                if (!files[match.file]) {
                    files[match.file] = [];
                }
                files[match.file].push(`${match.line};${match.column};${match.table}`);
            }

            // Calculate summary
            const uniqueTables = new Set(matches.map(m => m.table));
            
            const results: CompactResults = {
                timestamp: new Date().toISOString(),
                config: this.config || {},
                files,
                summary: {
                    totalTables: uniqueTables.size,
                    totalReferences: matches.length,
                    totalFiles: Object.keys(files).length
                }
            };

            const outputPath = path.join(vscodePath, 'table_refs.json');
            fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
            
            const fileSizeMB = Buffer.byteLength(JSON.stringify(results), 'utf8') / (1024 * 1024);
            console.log(`Saved ${fileSizeMB.toFixed(2)} MB to ${outputPath}`);
            console.log(`  - ${results.summary.totalReferences} references`);
            console.log(`  - ${results.summary.totalTables} tables`);
            console.log(`  - ${results.summary.totalFiles} files`);
            
            this.lastAnalysisTimestamp = results.timestamp;
        } catch (error) {
            console.error('Error saving results:', error);
            throw error;
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

            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Loading Database References',
                cancellable: false
            }, async (progress) => {
                // Step 1: Load and parse JSON
                progress.report({ message: 'Reading cached data...', increment: 20 });
                const content = fs.readFileSync(outputPath, 'utf8');
                const results: CompactResults = JSON.parse(content);

                // Step 2: Convert compact format to matches
                progress.report({ message: 'Parsing references...', increment: 20 });
                const matches: Match[] = [];
                
                for (const [filePath, compactRefs] of Object.entries(results.files)) {
                    for (const compactRef of compactRefs) {
                        const parts = compactRef.split(';');
                        if (parts.length === 3) {
                            matches.push({
                                file: filePath,
                                line: parseInt(parts[0], 10),
                                column: parseInt(parts[1], 10),
                                table: parts[2]
                            });
                        }
                    }
                }

                console.log(`Loaded ${matches.length} matches from ${outputPath}`);
                console.log(`  - Analyzed at: ${results.timestamp}`);
                
                this.lastAnalysisTimestamp = results.timestamp;
                
                // Step 3: Calculate relationships from loaded matches
                progress.report({ message: 'Calculating table relationships...', increment: 30 });
                this.calculateRelationships(matches);
                
                // Step 4: Build tree view data
                progress.report({ message: 'Building tree view data...', increment: 20 });
                const usageMap = this.convertToTableUsageMap(matches);
                
                progress.report({ message: 'Ready!', increment: 10 });
                return usageMap;
            });
        } catch (error) {
            console.error('Error loading results:', error);
            return null;
        }
    }

    private convertToTableUsageMap(matches: Match[]): Map<string, TableUsage> {
        const usageMap = new Map<string, TableUsage>();

        for (const match of matches) {
            if (!usageMap.has(match.table)) {
                usageMap.set(match.table, {
                    tableName: match.table,
                    references: [],
                    files: new Set()
                });
            }

            const usage = usageMap.get(match.table)!;
            
            // LAZY LOADING: Don't load context here, let tree view load it on-demand
            // This dramatically speeds up initial load and refresh
            usage.references.push({
                tableName: match.table,
                filePath: match.file,
                line: match.line,
                column: match.column,
                context: '' // Empty context - will be loaded lazily when node is expanded
            });
            
            usage.files.add(match.file);
        }

        return usageMap;
    }

    /**
     * Build sorted indexes for tables and files.
     * This dramatically reduces memory usage by using integer IDs instead of strings.
     */
    private buildIndexes(matches: Match[]): void {
        // Clear existing indexes
        this.tableIndex.clear();
        this.tableList = [];
        this.fileIndex.clear();
        this.fileList = [];
        
        // Extract unique table names and file paths
        const uniqueTables = new Set<string>();
        const uniqueFiles = new Set<string>();
        
        for (const match of matches) {
            uniqueTables.add(match.table);
            uniqueFiles.add(match.file);
        }
        
        // Sort and build table index
        this.tableList = Array.from(uniqueTables).sort();
        for (let i = 0; i < this.tableList.length; i++) {
            this.tableIndex.set(this.tableList[i], i);
        }
        
        // Sort and build file index
        this.fileList = Array.from(uniqueFiles).sort();
        for (let i = 0; i < this.fileList.length; i++) {
            this.fileIndex.set(this.fileList[i], i);
        }
    }

    private calculateRelationships(matches: Match[]): void {
        // Clear existing relationships
        this.relationships.clear();
        
        const proximityThreshold = this.getProximityThreshold();
        
        console.log(`Starting relationship calculation for ${matches.length} matches...`);
        
        // STEP 1: Build indexes for tables and files (sorted)
        console.log(`  - Building indexes...`);
        this.buildIndexes(matches);
        console.log(`  - Indexed ${this.tableList.length} tables and ${this.fileList.length} files`);
        
        // Group matches by file
        const fileGroups = new Map<string, Match[]>();
        for (const match of matches) {
            if (!fileGroups.has(match.file)) {
                fileGroups.set(match.file, []);
            }
            fileGroups.get(match.file)!.push(match);
        }

        console.log(`  - Processing ${fileGroups.size} files...`);

        // Find relationships within each file
        let processedFiles = 0;
        
        for (const [file, fileMatches] of fileGroups) {
            processedFiles++;
            
            // Log progress every 10% of files
            if (processedFiles % Math.max(1, Math.floor(fileGroups.size / 10)) === 0) {
                const percent = Math.floor((processedFiles / fileGroups.size) * 100);
                console.log(`  - Progress: ${percent}% (${processedFiles}/${fileGroups.size} files, ${this.relationships.size} relationships found)`);
            }
            
            // Get unique tables in this file
            const uniqueTables = new Set(fileMatches.map(m => m.table));
            
            // Skip files with only one table
            if (uniqueTables.size < 2) {
                continue;
            }

            // MEMORY OPTIMIZATION: Skip files with excessive matches to prevent O(n²) explosion
            if (fileMatches.length > 500) {
                console.log(`  - Skipping ${file} (${fileMatches.length} matches - too many for relationship calculation)`);
                continue;
            }

            // Sort by line for efficient processing
            fileMatches.sort((a, b) => a.line - b.line);

            // Find table pairs within proximity
            for (let i = 0; i < fileMatches.length; i++) {
                const match1 = fileMatches[i];
                
                // Early exit: if we're beyond proximity of any remaining matches
                const lastMatchLine = fileMatches[fileMatches.length - 1].line;
                if (lastMatchLine - match1.line > proximityThreshold) {
                    break;
                }
                
                for (let j = i + 1; j < fileMatches.length; j++) {
                    const match2 = fileMatches[j];
                    
                    // Skip if same table
                    if (match1.table === match2.table) {
                        continue;
                    }

                    const distance = match2.line - match1.line; // Always positive since sorted
                    
                    // If beyond threshold, stop checking this match1
                    if (distance > proximityThreshold) {
                        break;
                    }

                    // Get table IDs from index
                    const table1Id = this.tableIndex.get(match1.table)!;
                    const table2Id = this.tableIndex.get(match2.table)!;
                    const fileId = this.fileIndex.get(file)!;
                    
                    // Create sorted key for relationship (use smaller ID first)
                    const [minId, maxId] = table1Id < table2Id ? [table1Id, table2Id] : [table2Id, table1Id];
                    const key = `${minId}|${maxId}`;
                    
                    if (!this.relationships.has(key)) {
                        this.relationships.set(key, {
                            table1Id: minId,
                            table2Id: maxId,
                            occurrences: 0,
                            fileCount: 0, // Will calculate from unique files in proximityInstances
                            proximityInstances: []
                        });
                    }

                    const rel = this.relationships.get(key)!;
                    rel.occurrences++;
                    
                    // Store all instances - integer indexing makes this memory-efficient (68% savings)
                    rel.proximityInstances!.push({
                        fileId: fileId,
                        line1: match1.line,
                        column1: match1.column,
                        line2: match2.line,
                        column2: match2.column,
                        distance: distance
                    });
                }
            }
        }

        // Calculate file counts from proximity instances (memory efficient)
        console.log(`  - Calculating file counts for ${this.relationships.size} relationships...`);
        for (const rel of this.relationships.values()) {
            if (rel.proximityInstances && rel.proximityInstances.length > 0) {
                const uniqueFileIds = new Set(rel.proximityInstances.map(inst => inst.fileId));
                rel.fileCount = uniqueFileIds.size;
            }
        }

        // Calculate total occurrences
        const totalOccurrences = Array.from(this.relationships.values())
            .reduce((sum, rel) => sum + rel.occurrences, 0);
        
        console.log(`✓ Calculated ${this.relationships.size} relationships (${totalOccurrences} total occurrences)`);
        
        // Log memory savings
        const avgTableNameLength = this.tableList.reduce((sum, t) => sum + t.length, 0) / this.tableList.length;
        const avgFilePathLength = this.fileList.reduce((sum, f) => sum + f.length, 0) / this.fileList.length;
        console.log(`  - Memory savings: Using 4-byte IDs instead of ${avgTableNameLength.toFixed(0)}-char table names and ${avgFilePathLength.toFixed(0)}-char file paths`);
    }

    getLastAnalysisTimestamp(): string | undefined {
        return this.lastAnalysisTimestamp;
    }

    // Accessor methods for indexed data
    getTableName(tableId: number): string {
        return this.tableList[tableId] || '';
    }

    getFileName(fileId: number): string {
        return this.fileList[fileId] || '';
    }

    getTableList(): string[] {
        return this.tableList;
    }

    getFileList(): string[] {
        return this.fileList;
    }

    // Backward compatibility methods (can be removed if not needed)
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
        
        const timestamp = this.lastAnalysisTimestamp 
            ? new Date(this.lastAnalysisTimestamp).toLocaleString()
            : 'Unknown';
        
        report += `**Generated**: ${timestamp}\n\n`;
        
        const totalRefs = Array.from(tableUsageMap.values())
            .reduce((sum, usage) => sum + usage.references.length, 0);
        
        report += `## Summary\n\n`;
        report += `- **Total Tables**: ${tableUsageMap.size}\n`;
        report += `- **Total References**: ${totalRefs}\n\n`;
        
        report += `## Tables by Usage\n\n`;
        
        const sortedTables = Array.from(tableUsageMap.entries())
            .sort((a, b) => b[1].references.length - a[1].references.length);
        
        for (const [tableName, usage] of sortedTables) {
            report += `### ${tableName}\n\n`;
            report += `- **References**: ${usage.references.length}\n`;
            report += `- **Files**: ${usage.files.size}\n\n`;
        }
        
        return report;
    }
}
