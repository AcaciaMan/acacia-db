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

// Serializable format for saving to JSON
interface SerializableTableUsage {
    tableName: string;
    references: DatabaseReference[];
    files: string[];
}

interface SerializableRelationship {
    table1: string;
    table2: string;
    occurrences: number;
    files: string[];
    proximityInstances: Array<{
        file: string;
        line1: number;
        line2: number;
        distance: number;
    }>;
}

interface AnalysisResults {
    timestamp: string;
    config: AnalysisConfig;
    tables: SerializableTableUsage[];
    relationships: SerializableRelationship[];
    summary: {
        totalTables: number;
        tablesWithReferences: number;
        totalReferences: number;
        totalFiles: number;
        relationshipCount: number;
    };
}

export class DatabaseAnalyzer {
    private config?: AnalysisConfig;
    private knownTables: Set<string> = new Set();
    private tableNames: string[] = [];
    private relationships: Map<string, TableRelationship> = new Map();
    private lastAnalysisTimestamp?: string;
    
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
            const config = vscode.workspace.getConfiguration('acaciaDb');
            const enableRelationships = config.get<boolean>('enableRelationshipDetection', true);
            
            if (enableRelationships) {
                progress.report({ message: 'Detecting table relationships...' });
                try {
                    this.detectTableRelationships(tableUsageMap);
                } catch (error) {
                    console.error('Error detecting relationships:', error);
                    vscode.window.showWarningMessage('Relationship detection failed. Analysis completed without relationships.');
                }
            }
        });

        const relationshipMsg = this.relationships.size > 0 
            ? ` Detected ${this.relationships.size} table relationships.`
            : '';
        
        vscode.window.showInformationMessage(
            `Found ${tableUsageMap.size} tables with references.${relationshipMsg}`
        );

        // Save results to .vscode/table_refs.json
        this.lastAnalysisTimestamp = new Date().toISOString();
        await this.saveResults(tableUsageMap);

        return tableUsageMap;
    }

    private async saveResults(tableUsageMap: Map<string, TableUsage>): Promise<void> {
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

            // Limits to prevent JSON from becoming too large
            const MAX_REFERENCES_PER_TABLE = 1000;  // Limit references per table
            const MAX_CONTEXT_LENGTH = 200;         // Truncate long context strings

            // Convert tableUsageMap to serializable format
            const tables: SerializableTableUsage[] = Array.from(tableUsageMap.values()).map(usage => {
                // Sort references by file path (ascending), then by line number (ascending)
                let sortedReferences = [...usage.references].sort((a, b) => {
                    const pathCompare = a.filePath.localeCompare(b.filePath);
                    if (pathCompare !== 0) {
                        return pathCompare;
                    }
                    return a.line - b.line;
                });

                // Limit number of references to prevent excessive file size
                if (sortedReferences.length > MAX_REFERENCES_PER_TABLE) {
                    console.warn(`Table ${usage.tableName} has ${sortedReferences.length} references, truncating to ${MAX_REFERENCES_PER_TABLE}`);
                    sortedReferences = sortedReferences.slice(0, MAX_REFERENCES_PER_TABLE);
                }

                // Truncate long context strings
                const referencesWithTruncatedContext = sortedReferences.map(ref => ({
                    ...ref,
                    context: ref.context.length > MAX_CONTEXT_LENGTH 
                        ? ref.context.substring(0, MAX_CONTEXT_LENGTH) + '...'
                        : ref.context
                }));

                return {
                    tableName: usage.tableName,
                    references: referencesWithTruncatedContext,
                    files: Array.from(usage.files).sort()
                };
            });

            // Sort tables: first by reference count (descending), then by name (ascending)
            tables.sort((a, b) => {
                const refDiff = b.references.length - a.references.length;
                if (refDiff !== 0) {
                    return refDiff;
                }
                return a.tableName.localeCompare(b.tableName);
            });

            // Convert relationships to serializable format
            const relationships: SerializableRelationship[] = Array.from(this.relationships.values()).map(rel => {
                // Sort proximity instances by file (ascending), then by line1 (ascending)
                const sortedInstances = [...rel.proximityInstances].sort((a, b) => {
                    const fileCompare = a.file.localeCompare(b.file);
                    if (fileCompare !== 0) {
                        return fileCompare;
                    }
                    return a.line1 - b.line1;
                });

                return {
                    table1: rel.table1,
                    table2: rel.table2,
                    occurrences: rel.occurrences,
                    files: Array.from(rel.files).sort(),
                    proximityInstances: sortedInstances
                };
            });

            // Sort relationships: first by occurrences (descending), then by table names (ascending)
            relationships.sort((a, b) => {
                const occDiff = b.occurrences - a.occurrences;
                if (occDiff !== 0) {
                    return occDiff;
                }
                const name1 = `${a.table1}|${a.table2}`;
                const name2 = `${b.table1}|${b.table2}`;
                return name1.localeCompare(name2);
            });

            // Calculate summary statistics
            const allFiles = new Set<string>();
            let totalReferences = 0;
            
            for (const usage of tableUsageMap.values()) {
                totalReferences += usage.references.length;
                usage.files.forEach(file => allFiles.add(file));
            }

            const results: AnalysisResults = {
                timestamp: new Date().toISOString(),
                config: this.config || {},
                tables,
                relationships,
                summary: {
                    totalTables: this.tableNames.length,
                    tablesWithReferences: tableUsageMap.size,
                    totalReferences,
                    totalFiles: allFiles.size,
                    relationshipCount: this.relationships.size
                }
            };

            // Write to file with error handling for large data
            const outputPath = path.join(vscodePath, 'table_refs.json');
            
            try {
                const jsonString = JSON.stringify(results, null, 2);
                const fileSizeMB = Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024);
                
                fs.writeFileSync(outputPath, jsonString, 'utf8');
                
                console.log(`Analysis results saved to ${outputPath} (${fileSizeMB.toFixed(2)} MB)`);
                
                if (fileSizeMB > 10) {
                    vscode.window.showWarningMessage(
                        `Analysis results file is large (${fileSizeMB.toFixed(1)} MB). Consider reducing the number of tables analyzed.`
                    );
                }
            } catch (stringifyError: any) {
                // If JSON.stringify fails due to size, save a minimal version
                console.error('JSON stringify failed, saving minimal results:', stringifyError);
                
                const minimalResults = {
                    timestamp: results.timestamp,
                    config: results.config,
                    summary: results.summary,
                    note: 'Full results were too large to save. Showing summary only.'
                };
                
                fs.writeFileSync(outputPath, JSON.stringify(minimalResults, null, 2), 'utf8');
                
                vscode.window.showWarningMessage(
                    `Analysis results are too large to save (${results.summary.totalReferences} references). Saved summary only. Consider analyzing fewer tables.`
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
            const results: AnalysisResults = JSON.parse(content);

            // Convert back to Map format
            const tableUsageMap = new Map<string, TableUsage>();
            
            for (const table of results.tables) {
                tableUsageMap.set(table.tableName, {
                    tableName: table.tableName,
                    references: table.references,
                    files: new Set(table.files)
                });
            }

            // Restore relationships
            this.relationships.clear();
            for (const rel of results.relationships) {
                const key = [rel.table1, rel.table2].sort().join('|');
                this.relationships.set(key, {
                    table1: rel.table1,
                    table2: rel.table2,
                    occurrences: rel.occurrences,
                    files: new Set(rel.files),
                    proximityInstances: rel.proximityInstances
                });
            }

            console.log(`Loaded analysis results from ${outputPath} (analyzed at ${results.timestamp})`);
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
