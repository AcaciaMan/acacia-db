import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { ColumnNameMatcher, ColumnNameMatch } from './columnNameMatcher';

// Tree item types
export type ColumnExplorerTreeItem = TableTreeItem | ReferenceTypeTreeItem | LinkedTableTreeItem | ColumnLinkTreeItem | ColumnMatchTreeItem;

// Table with linked tables
export class TableTreeItem extends vscode.TreeItem {
    constructor(
        public readonly tableName: string,
        public readonly linkedTables: Map<string, LinkedTableInfo>,
        public readonly referencedByTables: Map<string, LinkedTableInfo>,
        public readonly columns: string[]
    ) {
        const referencesCount = linkedTables.size;
        const referencedByCount = referencedByTables.size;
        const totalLinks = referencesCount + referencedByCount;
        
        super(tableName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'table';
        this.iconPath = new vscode.ThemeIcon('database');
        this.description = `${totalLinks} relationship(s)`;
        this.tooltip = `Table: ${tableName}\nColumns: ${columns.length}\nReferences: ${referencesCount}\nReferenced by: ${referencedByCount}`;
    }
}

// Reference type tree item (References or Referenced by)
export class ReferenceTypeTreeItem extends vscode.TreeItem {
    constructor(
        public readonly tableName: string,
        public readonly referenceType: 'references' | 'referencedBy',
        public readonly linkedTables: Map<string, LinkedTableInfo>
    ) {
        const label = referenceType === 'references' ? 'References' : 'Referenced by';
        const icon = referenceType === 'references' ? 'arrow-right' : 'arrow-left';
        
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'referenceType';
        this.iconPath = new vscode.ThemeIcon(icon);
        this.description = `${linkedTables.size} table(s)`;
        this.tooltip = `${label}: ${linkedTables.size} table(s)`;
    }
}

// Linked table information
export interface LinkedTableInfo {
    tableName: string;
    occurrences: number;
    linkedColumns: ColumnLink[];
    files: string[];
}

// Column link between tables
export interface ColumnLink {
    sourceColumn: string;
    targetColumn: string;
    occurrences: number;
    files: string[];
    contexts: ColumnLinkContext[];
    direction: 'forward' | 'backward' | 'bidirectional'; // Relation direction
}

// Context where columns are linked
export interface ColumnLinkContext {
    file: string;
    line: number;
    context: string;
}

// Linked table in tree
export class LinkedTableTreeItem extends vscode.TreeItem {
    constructor(
        public readonly sourceTable: string,
        public readonly linkedTable: string,
        public readonly info: LinkedTableInfo
    ) {
        super(linkedTable, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'linkedTable';
        this.iconPath = new vscode.ThemeIcon('link');
        this.description = `${info.linkedColumns.length} column link(s), ${info.occurrences} ref(s)`;
        this.tooltip = `Linked to: ${linkedTable}\nOccurrences: ${info.occurrences}\nFiles: ${info.files.length}`;
    }
}

// Column link in tree
export class ColumnLinkTreeItem extends vscode.TreeItem {
    constructor(
        public readonly link: ColumnLink,
        public readonly sourceTable: string,
        public readonly targetTable: string
    ) {
        // Create label with direction indicator
        const directionSymbol = link.direction === 'forward' ? '→' 
                              : link.direction === 'backward' ? '←' 
                              : '↔';
        
        super(
            `${link.sourceColumn} ${directionSymbol} ${link.targetColumn}`,
            vscode.TreeItemCollapsibleState.Collapsed
        );
        this.contextValue = 'columnLink';
        this.iconPath = new vscode.ThemeIcon('symbol-field');
        this.description = `${link.occurrences} occurrence(s)`;
        
        // Enhanced tooltip with direction explanation
        const directionText = link.direction === 'forward' ? 'Forward (lower order → higher order)'
                            : link.direction === 'backward' ? 'Backward (higher order → lower order)'
                            : 'Bidirectional (used both ways)';
        
        this.tooltip = `${sourceTable}.${link.sourceColumn} ${directionSymbol} ${targetTable}.${link.targetColumn}\nDirection: ${directionText}\nOccurrences: ${link.occurrences}\nFiles: ${link.files.length}`;
    }
}

// Column match/context in tree
export class ColumnMatchTreeItem extends vscode.TreeItem {
    constructor(
        public readonly context: ColumnLinkContext,
        public readonly sourceColumn: string,
        public readonly targetColumn: string
    ) {
        super(path.basename(context.file), vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'columnMatch';
        this.iconPath = new vscode.ThemeIcon('file-code');
        this.description = `Line ${context.line}`;
        this.tooltip = `${context.file}\nLine: ${context.line}\n${context.context}`;
        this.command = {
            command: 'acacia-db.openColumnReference',
            title: 'Open Reference',
            arguments: [context.file, context.line]
        };
    }
}

/**
 * Tree data provider for Column Explorer
 */
export class ColumnExplorerProvider implements vscode.TreeDataProvider<ColumnExplorerTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ColumnExplorerTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<ColumnExplorerTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ColumnExplorerTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private tableData: Map<string, TableData> = new Map();
    private columnMatchers: Map<string, ColumnNameMatcher> = new Map();
    private filterText: string = '';

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Analyze column relationships from tables_views.json and table_refs.json
     */
    async analyzeColumnRelationships(): Promise<void> {
        // Check if workspace folder exists
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a workspace folder first.');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing Column Relationships',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Loading configuration...', increment: 10 });
                
                // Load configuration
                const config = vscode.workspace.getConfiguration('acaciaDb');
                const tablesFile = config.get<string>('tablesViewsFile');
                const tableRefsFile = this.getTableRefsPath();

                if (!tablesFile) {
                    vscode.window.showWarningMessage('Please configure tables/views JSON file first');
                    return;
                }

                if (!fs.existsSync(tablesFile)) {
                    vscode.window.showErrorMessage(`Tables file not found: ${tablesFile}`);
                    return;
                }

                progress.report({ message: 'Loading table schemas...', increment: 20 });
                const tableSchemas = await this.loadTableSchemas(tablesFile);
                console.log(`[Column Explorer] Loaded ${tableSchemas.size} table schemas`);
                
                progress.report({ message: 'Building column matchers...', increment: 20 });
                this.buildColumnMatchers(tableSchemas);
                console.log(`[Column Explorer] Built ${this.columnMatchers.size} column matchers`);

                progress.report({ message: 'Analyzing table relationships...', increment: 20 });
                
                if (fs.existsSync(tableRefsFile)) {
                    await this.analyzeFromTableRefs(tableRefsFile, tableSchemas, progress);
                } else {
                    vscode.window.showWarningMessage(
                        'No table_refs.json found. Please run "Analyze Workspace" in the Database Explorer first.',
                        'Analyze Now'
                    ).then(selection => {
                        if (selection === 'Analyze Now') {
                            vscode.commands.executeCommand('acacia-db.analyzeWorkspace');
                        }
                    });
                    return;
                }

                progress.report({ message: 'Complete!', increment: 30 });
                
                console.log(`[Column Explorer] Analysis complete: ${this.tableData.size} tables analyzed`);
                console.log(`[Column Explorer] Tables:`, Array.from(this.tableData.keys()));
                
                this.refresh();
                vscode.window.showInformationMessage(
                    `Analyzed ${this.tableData.size} tables with column relationships`
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to analyze: ${error}`);
                console.error('Column analysis error:', error);
            }
        });
    }

    /**
     * Get path to table_refs.json
     */
    private getTableRefsPath(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            return path.join(workspaceFolder.uri.fsPath, '.vscode', 'table_refs.json');
        }
        
        return 'table_refs.json';
    }

    /**
     * Load table schemas with columns from tables_views.json
     */
    private async loadTableSchemas(filePath: string): Promise<Map<string, TableSchema>> {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        console.log(`[Column Explorer] Parsing schemas from ${filePath}`);
        console.log(`[Column Explorer] Data has tables array: ${data.tables && Array.isArray(data.tables)}`);
        
        const schemas = new Map<string, TableSchema>();
        
        if (data.tables && Array.isArray(data.tables)) {
            console.log(`[Column Explorer] Processing ${data.tables.length} tables from schema file`);
            for (const table of data.tables) {
                if (typeof table === 'object' && table.name) {
                    const columns = table.columns || [];
                    const columnArray = Array.isArray(columns) ? columns : [];
                    
                    // Build column order map (lowercase column name -> order number)
                    const columnOrder = new Map<string, number>();
                    columnArray.forEach((col, index) => {
                        columnOrder.set(col.toLowerCase(), index);
                    });
                    
                    schemas.set(table.name, {
                        name: table.name,
                        columns: columnArray,
                        columnOrder: columnOrder
                    });
                    console.log(`[Column Explorer] Added schema for ${table.name} with ${columnArray.length} columns`);
                }
            }
        }
        
        return schemas;
    }

    /**
     * Build column name matchers for each table
     */
    private buildColumnMatchers(schemas: Map<string, TableSchema>): void {
        this.columnMatchers.clear();
        
        for (const [tableName, schema] of schemas) {
            if (schema.columns.length > 0) {
                const matcher = new ColumnNameMatcher();
                matcher.addColumnNames(schema.columns);
                this.columnMatchers.set(tableName, matcher);
            }
        }
    }

    /**
     * Analyze column relationships from table_refs.json
     */
    private async analyzeFromTableRefs(
        tableRefsFile: string, 
        schemas: Map<string, TableSchema>,
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<void> {
        const content = fs.readFileSync(tableRefsFile, 'utf8');
        const data = JSON.parse(content);
        
        console.log(`[Column Explorer] Analyzing from ${tableRefsFile}`);
        console.log(`[Column Explorer] table_refs keys:`, Object.keys(data));
        
        this.tableData.clear();
        
        // Extract all unique tables from the files references
        const tablesInFiles = new Set<string>();
        
        if (data.files && typeof data.files === 'object') {
            console.log(`[Column Explorer] Processing ${Object.keys(data.files).length} files`);
            
            // Parse all table references from the compact format
            for (const [filePath, compactRefs] of Object.entries(data.files)) {
                if (!Array.isArray(compactRefs)) {continue;}
                
                for (const compactRef of compactRefs) {
                    if (typeof compactRef === 'string') {
                        const parts = compactRef.split(';');
                        if (parts.length === 3) {
                            const tableName = parts[2];
                            tablesInFiles.add(tableName);
                        }
                    }
                }
            }
            
            console.log(`[Column Explorer] Found ${tablesInFiles.size} unique tables in references`);
        }
        
        // Initialize all tables that have schemas and matchers
        let initializedCount = 0;
        for (const tableName of tablesInFiles) {
            const hasSchema = schemas.has(tableName);
            const hasMatcher = this.columnMatchers.has(tableName);
            
            console.log(`[Column Explorer] Table ${tableName}: hasSchema=${hasSchema}, hasMatcher=${hasMatcher}`);
            
            if (hasSchema && hasMatcher) {
                this.tableData.set(tableName, {
                    tableName: tableName,
                    columns: schemas.get(tableName)?.columns || [],
                    linkedTables: new Map(),
                    referencedByTables: new Map()
                });
                initializedCount++;
                console.log(`[Column Explorer] ✓ Initialized table ${tableName}`);
            }
        }
        
        console.log(`[Column Explorer] Initialized ${initializedCount} tables with schemas and matchers`);
        
        // Analyze column relationships in files
        if (data.files && typeof data.files === 'object') {
            progress.report({ message: 'Analyzing column links in files...', increment: 10 });
            await this.analyzeColumnLinksInFiles(data.files, schemas, progress);
        }
    }

    /**
     * Analyze column links across all files
     */
    private async analyzeColumnLinksInFiles(
        filesData: { [filePath: string]: string[] },
        schemas: Map<string, TableSchema>,
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<void> {
        console.log(`[Column Explorer] Analyzing column links in files...`);
        
        const fileEntries = Object.entries(filesData);
        const totalFiles = fileEntries.length;
        let processedFiles = 0;
        let filesWithLinks = 0;
        let skippedFiles = 0;
        
        console.log(`[Column Explorer] Total files to process: ${totalFiles}`);
        
        // Performance optimization: limit to files with multiple table references
        const relevantFiles = fileEntries.filter(([_, refs]) => {
            if (!Array.isArray(refs) || refs.length < 2) {
                return false;
            }
            
            // Extract unique tables
            const tablesInFile = new Set<string>();
            for (const compactRef of refs) {
                if (typeof compactRef === 'string') {
                    const parts = compactRef.split(';');
                    if (parts.length === 3) {
                        tablesInFile.add(parts[2]);
                    }
                }
            }
            
            return tablesInFile.size >= 2;
        });
        
        console.log(`[Column Explorer] Reduced to ${relevantFiles.length} files with multiple table references`);
        
        for (const [filePath, compactRefs] of relevantFiles) {
            processedFiles++;
            
            // Update progress every 100 files or on last file
            if (processedFiles % 100 === 0 || processedFiles === relevantFiles.length) {
                const percent = Math.round((processedFiles / relevantFiles.length) * 100);
                console.log(`[Column Explorer] Progress: ${processedFiles}/${relevantFiles.length} (${percent}%)`);
                progress.report({ 
                    message: `Analyzing column links... ${processedFiles}/${relevantFiles.length} files (${percent}%)`,
                    increment: 0
                });
            }
            
            // Extract tables referenced in this file
            const tablesInFile = new Set<string>();
            for (const compactRef of compactRefs) {
                if (typeof compactRef === 'string') {
                    const parts = compactRef.split(';');
                    if (parts.length === 3) {
                        tablesInFile.add(parts[2]);
                    }
                }
            }
            
            const tableArray = Array.from(tablesInFile).filter(t => this.tableData.has(t));
            if (tableArray.length < 2) {
                skippedFiles++;
                continue;
            }
            
            if (processedFiles <= 5) {
                console.log(`[Column Explorer] Processing file ${processedFiles}: ${filePath}`);
                console.log(`[Column Explorer]   Tables in file: ${tableArray.join(', ')}`);
            }
            
            // PERFORMANCE FIX: Read file once and analyze all table pairs
            let hasLinksInFile = false;
            try {
                hasLinksInFile = await this.analyzeAllColumnLinksInFile(
                    filePath,
                    tableArray,
                    compactRefs.length
                );
            } catch (error) {
                console.error(`[Column Explorer] Error processing file ${filePath}:`, error);
                // Continue with next file
            }
            
            if (hasLinksInFile) {
                filesWithLinks++;
            }
        }
        
        console.log(`[Column Explorer] Analysis summary:`);
        console.log(`  - Total files: ${totalFiles}`);
        console.log(`  - Relevant files: ${relevantFiles.length}`);
        console.log(`  - Processed files: ${processedFiles}`);
        console.log(`  - Skipped files: ${skippedFiles}`);
        console.log(`  - Files with column links: ${filesWithLinks}`);
    }

    /**
     * Analyze all column links in a file (optimized - find columns first, then determine tables)
     */
    private async analyzeAllColumnLinksInFile(
        filePath: string,
        tables: string[],
        occurrences: number
    ): Promise<boolean> {
        if (!fs.existsSync(filePath)) {
            return false;
        }
        
        // Build set of tables actually in this file
        const tablesInFile = new Set<string>(tables);
        
        // Build column-to-tables mapping ONLY for tables in this file
        const columnToTables = new Map<string, string[]>();
        const allMatcher = new ColumnNameMatcher(); // Combined matcher for all columns
        
        for (const table of tables) {
            const tableSchema = this.tableData.get(table);
            if (tableSchema) {
                for (const column of tableSchema.columns) {
                    const columnLower = column.toLowerCase();
                    if (!columnToTables.has(columnLower)) {
                        columnToTables.set(columnLower, []);
                        allMatcher.addColumnName(column);
                    }
                    columnToTables.get(columnLower)!.push(table);
                }
            }
        }
        
        if (columnToTables.size === 0) {
            return false;
        }
        
        let foundLinks = false;
        
        try {
            // Check file size to decide read strategy
            const stats = fs.statSync(filePath);
            const fileSizeKB = stats.size / 1024;
            
            if (fileSizeKB < 50) {
                // Small file: use fast synchronous read
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n');
                foundLinks = this.processLines(lines, allMatcher, columnToTables, tablesInFile, filePath, occurrences);
            } else {
                // Large file: use streaming for better memory and performance
                foundLinks = await this.processFileStream(filePath, allMatcher, columnToTables, tablesInFile, occurrences);
            }
        } catch (error) {
            console.error(`[Column Explorer] Error reading file ${filePath}:`, error);
        }
        
        return foundLinks;
    }

    /**
     * Process lines from array (for small files)
     */
    private processLines(
        lines: string[],
        allMatcher: ColumnNameMatcher,
        columnToTables: Map<string, string[]>,
        tablesInFile: Set<string>,
        filePath: string,
        occurrences: number
    ): boolean {
        let foundLinks = false;
        
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            
            // Skip empty lines, very short lines, and common comment patterns
            const trimmedLine = line.trim();
            if (trimmedLine.length < 3 || 
                trimmedLine.startsWith('//') || 
                trimmedLine.startsWith('/*') || 
                trimmedLine.startsWith('*') ||
                trimmedLine.startsWith('#')) {
                continue;
            }
            
            const linksFound = this.processLine(
                trimmedLine,
                lineNum + 1,
                allMatcher,
                columnToTables,
                tablesInFile,
                filePath,
                occurrences
            );
            
            if (linksFound) {
                foundLinks = true;
            }
        }
        
        return foundLinks;
    }

    /**
     * Process file as stream (for large files)
     */
    private async processFileStream(
        filePath: string,
        allMatcher: ColumnNameMatcher,
        columnToTables: Map<string, string[]>,
        tablesInFile: Set<string>,
        occurrences: number
    ): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            let foundLinks = false;
            let lineNum = 0;
            
            const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            
            rl.on('line', (line: string) => {
                lineNum++;
                
                // Skip empty lines, very short lines, and common comment patterns
                const trimmedLine = line.trim();
                if (trimmedLine.length < 3 || 
                    trimmedLine.startsWith('//') || 
                    trimmedLine.startsWith('/*') || 
                    trimmedLine.startsWith('*') ||
                    trimmedLine.startsWith('#')) {
                    return;
                }
                
                const linksFound = this.processLine(
                    trimmedLine,
                    lineNum,
                    allMatcher,
                    columnToTables,
                    tablesInFile,
                    filePath,
                    occurrences
                );
                
                if (linksFound) {
                    foundLinks = true;
                }
            });
            
            rl.on('close', () => {
                resolve(foundLinks);
            });
            
            rl.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Process a single line looking for column matches
     */
    private processLine(
        trimmedLine: string,
        lineNum: number,
        allMatcher: ColumnNameMatcher,
        columnToTables: Map<string, string[]>,
        tablesInFile: Set<string>,
        filePath: string,
        occurrences: number
    ): boolean {
        let foundLinks = false;
        
        // Find ALL column names in line with single matcher
        const columnMatches = allMatcher.findColumnNamesInString(trimmedLine);
        
        if (columnMatches.length === 0) {
            return false;
        }
        
        // Build list of unique columns found and their tables (filtered to tables in file)
        const columnsFound = new Map<string, {columnName: string, tables: string[]}>();
        for (const match of columnMatches) {
            const columnLower = match.columnName.toLowerCase();
            const allTablesForColumn = columnToTables.get(columnLower);
            if (allTablesForColumn) {
                // FILTER: Only include tables that are actually in this file
                const tablesInFileForColumn = allTablesForColumn.filter(t => tablesInFile.has(t));
                
                if (tablesInFileForColumn.length > 0) {
                    if (!columnsFound.has(columnLower)) {
                        columnsFound.set(columnLower, {
                            columnName: match.columnName,
                            tables: tablesInFileForColumn
                        });
                    }
                }
            }
        }
        
        if (columnsFound.size < 1) {
            return false;
        }
        
        // Convert to array for easier iteration
        const columnEntries = Array.from(columnsFound.values());
        
        // Case 1: Multiple different columns found
        if (columnsFound.size >= 2) {
            // Create links between all column pairs
            for (let i = 0; i < columnEntries.length; i++) {
                for (let j = i + 1; j < columnEntries.length; j++) {
                    const col1 = columnEntries[i];
                    const col2 = columnEntries[j];
                    
                    // Create links for each table combination (only for tables in this file)
                    for (const table1 of col1.tables) {
                        for (const table2 of col2.tables) {
                            if (table1 !== table2) {
                                // Link between different tables
                                this.recordColumnLink(
                                    table1,
                                    table2,
                                    col1.columnName,
                                    col2.columnName,
                                    filePath,
                                    lineNum,
                                    trimmedLine,
                                    occurrences
                                );
                                foundLinks = true;
                            } else {
                                // Same column pair from same table (self-link)
                                this.recordColumnLink(
                                    table1,
                                    table1,
                                    col1.columnName,
                                    col2.columnName,
                                    filePath,
                                    lineNum,
                                    trimmedLine,
                                    occurrences
                                );
                                foundLinks = true;
                            }
                        }
                    }
                }
            }
        } else {
            // Case 2: Single column found (appears in multiple tables in this file)
            const col = columnEntries[0];
            if (col.tables.length >= 2) {
                // Same column name exists in multiple tables in this file - create links
                for (let i = 0; i < col.tables.length; i++) {
                    for (let j = i + 1; j < col.tables.length; j++) {
                        this.recordColumnLink(
                            col.tables[i],
                            col.tables[j],
                            col.columnName,
                            col.columnName,
                            filePath,
                            lineNum,
                            trimmedLine,
                            occurrences
                        );
                        foundLinks = true;
                    }
                }
            }
        }
        
        return foundLinks;
    }

    /**
     * Analyze column links in a specific file
     */
    private async analyzeColumnLinksInFile(
        filePath: string,
        table1: string,
        table2: string,
        schemas: Map<string, TableSchema>,
        occurrences: number
    ): Promise<boolean> {
        if (!fs.existsSync(filePath)) {
            console.log(`[Column Explorer] File not found: ${filePath}`);
            return false;
        }
        
        const matcher1 = this.columnMatchers.get(table1);
        const matcher2 = this.columnMatchers.get(table2);
        
        if (!matcher1 || !matcher2) {
            return false;
        }
        
        let foundLinks = false;
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            // Limit processing to reasonable file sizes (skip huge files)
            if (lines.length > 50000) {
                console.log(`[Column Explorer] Skipping large file (${lines.length} lines): ${filePath}`);
                return false;
            }
            
            // Find column references in each line
            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                const matches1 = matcher1.findColumnNamesInString(line);
                const matches2 = matcher2.findColumnNamesInString(line);
                
                // If both tables' columns appear on the same line, it's a potential link
                if (matches1.length > 0 && matches2.length > 0) {
                    for (const match1 of matches1) {
                        for (const match2 of matches2) {
                            this.recordColumnLink(
                                table1,
                                table2,
                                match1.columnName,
                                match2.columnName,
                                filePath,
                                lineNum + 1,
                                line.trim(),
                                occurrences
                            );
                            foundLinks = true;
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error analyzing file ${filePath}:`, error);
        }
        
        return foundLinks;
    }

    /**
     * Record a column link between two tables
     */
    private recordColumnLink(
        sourceTable: string,
        targetTable: string,
        sourceColumn: string,
        targetColumn: string,
        file: string,
        line: number,
        context: string,
        tableOccurrences: number
    ): void {
        // Determine direction based on column order and table name
        const direction = this.determineRelationDirection(
            sourceTable,
            targetTable,
            sourceColumn,
            targetColumn
        );
        
        // Ensure source table exists
        if (!this.tableData.has(sourceTable)) {
            this.tableData.set(sourceTable, {
                tableName: sourceTable,
                columns: [],
                linkedTables: new Map(),
                referencedByTables: new Map()
            });
        }
        
        // Ensure target table exists
        if (!this.tableData.has(targetTable)) {
            this.tableData.set(targetTable, {
                tableName: targetTable,
                columns: [],
                linkedTables: new Map(),
                referencedByTables: new Map()
            });
        }
        
        const tableData = this.tableData.get(sourceTable)!;
        const targetTableData = this.tableData.get(targetTable)!;
        
        // Record in sourceTable.linkedTables (sourceTable references targetTable)
        if (!tableData.linkedTables.has(targetTable)) {
            tableData.linkedTables.set(targetTable, {
                tableName: targetTable,
                occurrences: tableOccurrences,
                linkedColumns: [],
                files: []
            });
        }
        
        const linkedTableInfo = tableData.linkedTables.get(targetTable)!;
        
        // Add file if not already present
        if (!linkedTableInfo.files.includes(file)) {
            linkedTableInfo.files.push(file);
        }
        
        // Find or create column link in linkedTables
        let columnLink = linkedTableInfo.linkedColumns.find(
            link => link.sourceColumn === sourceColumn && link.targetColumn === targetColumn
        );
        
        if (!columnLink) {
            columnLink = {
                sourceColumn,
                targetColumn,
                occurrences: 0,
                files: [],
                contexts: [],
                direction: direction
            };
            linkedTableInfo.linkedColumns.push(columnLink);
        } else {
            // Update direction if we see both directions (bidirectional)
            if (columnLink.direction !== direction && direction !== 'bidirectional') {
                columnLink.direction = 'bidirectional';
            }
        }
        
        // Add context
        columnLink.occurrences++;
        if (!columnLink.files.includes(file)) {
            columnLink.files.push(file);
        }
        columnLink.contexts.push({ file, line, context });
        
        // Also record in targetTable.referencedByTables (targetTable is referenced by sourceTable)
        if (!targetTableData.referencedByTables.has(sourceTable)) {
            targetTableData.referencedByTables.set(sourceTable, {
                tableName: sourceTable,
                occurrences: tableOccurrences,
                linkedColumns: [],
                files: []
            });
        }
        
        const referencedByInfo = targetTableData.referencedByTables.get(sourceTable)!;
        
        // Add file if not already present
        if (!referencedByInfo.files.includes(file)) {
            referencedByInfo.files.push(file);
        }
        
        // Find or create column link in referencedByTables
        let referencedByLink = referencedByInfo.linkedColumns.find(
            link => link.sourceColumn === sourceColumn && link.targetColumn === targetColumn
        );
        
        if (!referencedByLink) {
            referencedByLink = {
                sourceColumn,
                targetColumn,
                occurrences: 0,
                files: [],
                contexts: [],
                direction: direction
            };
            referencedByInfo.linkedColumns.push(referencedByLink);
        } else {
            // Update direction if we see both directions (bidirectional)
            if (referencedByLink.direction !== direction && direction !== 'bidirectional') {
                referencedByLink.direction = 'bidirectional';
            }
        }
        
        // Add context to referencedBy
        referencedByLink.occurrences++;
        if (!referencedByLink.files.includes(file)) {
            referencedByLink.files.push(file);
        }
        referencedByLink.contexts.push({ file, line, context });
    }

    /**
     * Determine relation direction based on column order and table name
     * Rules:
     * 1. If column order differs, direction goes from lower order to higher order
     * 2. If column orders are equal, direction goes from shorter table name to longer table name
     * 3. Forward means sourceTable -> targetTable, backward means opposite
     */
    private determineRelationDirection(
        sourceTable: string,
        targetTable: string,
        sourceColumn: string,
        targetColumn: string
    ): 'forward' | 'backward' | 'bidirectional' {
        const sourceTableData = this.tableData.get(sourceTable);
        const targetTableData = this.tableData.get(targetTable);
        
        // If we don't have schema info, treat as forward
        if (!sourceTableData || !targetTableData) {
            return 'forward';
        }
        
        // Get column order numbers
        const sourceOrder = this.getColumnOrder(sourceTable, sourceColumn);
        const targetOrder = this.getColumnOrder(targetTable, targetColumn);
        
        // If we can't determine order, use forward
        if (sourceOrder === -1 || targetOrder === -1) {
            return 'forward';
        }
        
        // Compare column orders
        if (sourceOrder < targetOrder) {
            return 'forward'; // Source has lower order -> forward direction
        } else if (sourceOrder > targetOrder) {
            return 'backward'; // Source has higher order -> backward direction
        } else {
            // Column orders are equal, compare table name lengths
            if (sourceTable.length < targetTable.length) {
                return 'forward'; // Shorter table name -> forward
            } else if (sourceTable.length > targetTable.length) {
                return 'backward'; // Longer table name -> backward
            } else {
                // Same length, use alphabetical
                return sourceTable.localeCompare(targetTable) < 0 ? 'forward' : 'backward';
            }
        }
    }

    /**
     * Get column order number for a column in a table
     * Returns -1 if not found
     */
    private getColumnOrder(tableName: string, columnName: string): number {
        const tableData = this.tableData.get(tableName);
        if (!tableData) {
            return -1;
        }
        
        // Find in columns array (case-insensitive)
        const index = tableData.columns.findIndex(
            col => col.toLowerCase() === columnName.toLowerCase()
        );
        
        return index;
    }

    /**
     * Set filter text
     */
    setFilter(filterText: string): void {
        this.filterText = filterText.toLowerCase();
        this.refresh();
    }

    /**
     * Get current filter
     */
    getFilter(): string {
        return this.filterText;
    }

    /**
     * Get tree item
     */
    getTreeItem(element: ColumnExplorerTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children for tree
     */
    async getChildren(element?: ColumnExplorerTreeItem): Promise<ColumnExplorerTreeItem[]> {
        if (!element) {
            // Root level - show tables
            return this.getRootTables();
        }
        
        if (element instanceof TableTreeItem) {
            // Show reference types (References and Referenced by)
            return this.getReferenceTypes(element);
        }
        
        if (element instanceof ReferenceTypeTreeItem) {
            // Show linked tables for this reference type
            return this.getLinkedTablesForType(element);
        }
        
        if (element instanceof LinkedTableTreeItem) {
            // Show column links
            return this.getColumnLinks(element);
        }
        
        if (element instanceof ColumnLinkTreeItem) {
            // Show column match contexts
            return this.getColumnMatches(element);
        }
        
        return [];
    }

    /**
     * Get root level tables
     */
    private getRootTables(): ColumnExplorerTreeItem[] {
        const items: TableTreeItem[] = [];
        
        // If no data, return empty with helpful message
        if (this.tableData.size === 0) {
            // VS Code doesn't support placeholder messages in tree views,
            // so we'll just return empty array and rely on the welcome message
            return [];
        }
        
        for (const [tableName, data] of this.tableData) {
            // Apply filter
            if (this.filterText && !tableName.toLowerCase().includes(this.filterText)) {
                continue;
            }
            
            items.push(new TableTreeItem(
                tableName,
                data.linkedTables,
                data.referencedByTables,
                data.columns
            ));
        }
        
        // Sort by relevance: total number of relationships (descending), then by table name
        items.sort((a, b) => {
            const totalA = a.linkedTables.size + a.referencedByTables.size;
            const totalB = b.linkedTables.size + b.referencedByTables.size;
            
            if (totalA !== totalB) {
                return totalB - totalA; // More relationships first
            }
            
            return a.tableName.localeCompare(b.tableName); // Alphabetical as tiebreaker
        });
        
        return items;
    }

    /**
     * Get reference types for a table (References and Referenced by)
     */
    private getReferenceTypes(table: TableTreeItem): ColumnExplorerTreeItem[] {
        const items: ReferenceTypeTreeItem[] = [];
        
        // Add "References" if table references other tables
        if (table.linkedTables.size > 0) {
            items.push(new ReferenceTypeTreeItem(
                table.tableName,
                'references',
                table.linkedTables
            ));
        }
        
        // Add "Referenced by" if table is referenced by other tables
        if (table.referencedByTables.size > 0) {
            items.push(new ReferenceTypeTreeItem(
                table.tableName,
                'referencedBy',
                table.referencedByTables
            ));
        }
        
        return items;
    }

    /**
     * Get linked tables for a reference type
     */
    private getLinkedTablesForType(referenceType: ReferenceTypeTreeItem): ColumnExplorerTreeItem[] {
        const items: LinkedTableTreeItem[] = [];
        
        for (const [linkedTableName, info] of referenceType.linkedTables) {
            items.push(new LinkedTableTreeItem(
                referenceType.tableName,
                linkedTableName,
                info
            ));
        }
        
        // Sort by relevance: occurrences (descending), then number of column links, then table name
        items.sort((a, b) => {
            // Primary: More occurrences first
            if (a.info.occurrences !== b.info.occurrences) {
                return b.info.occurrences - a.info.occurrences;
            }
            
            // Secondary: More column links first
            const columnLinksA = a.info.linkedColumns.length;
            const columnLinksB = b.info.linkedColumns.length;
            if (columnLinksA !== columnLinksB) {
                return columnLinksB - columnLinksA;
            }
            
            // Tertiary: Alphabetical by table name
            return a.linkedTable.localeCompare(b.linkedTable);
        });
        
        return items;
    }

    /**
     * Get column links for a linked table
     */
    private getColumnLinks(linkedTable: LinkedTableTreeItem): ColumnExplorerTreeItem[] {
        const items: ColumnLinkTreeItem[] = [];
        
        for (const link of linkedTable.info.linkedColumns) {
            items.push(new ColumnLinkTreeItem(
                link,
                linkedTable.sourceTable,
                linkedTable.linkedTable
            ));
        }
        
        // Sort by relevance: occurrences (descending), then number of files, then column name
        items.sort((a, b) => {
            // Primary: More occurrences first
            if (a.link.occurrences !== b.link.occurrences) {
                return b.link.occurrences - a.link.occurrences;
            }
            
            // Secondary: More files first (indicates wider usage)
            const filesA = a.link.files.length;
            const filesB = b.link.files.length;
            if (filesA !== filesB) {
                return filesB - filesA;
            }
            
            // Tertiary: Alphabetical by source column name
            return a.link.sourceColumn.localeCompare(b.link.sourceColumn);
        });
        
        return items;
    }

    /**
     * Get column matches (contexts) for a column link
     */
    private getColumnMatches(columnLink: ColumnLinkTreeItem): ColumnExplorerTreeItem[] {
        const items = columnLink.link.contexts.map(context => 
            new ColumnMatchTreeItem(
                context,
                columnLink.link.sourceColumn,
                columnLink.link.targetColumn
            )
        );
        
        // Sort by relevance: line number (ascending) within each file, then by file name
        items.sort((a, b) => {
            // Primary: Sort by file name
            const fileComparison = a.context.file.localeCompare(b.context.file);
            if (fileComparison !== 0) {
                return fileComparison;
            }
            
            // Secondary: Within same file, sort by line number (earliest first)
            return a.context.line - b.context.line;
        });
        
        return items;
    }
}

/**
 * Table schema information
 */
interface TableSchema {
    name: string;
    columns: string[];
    columnOrder: Map<string, number>; // Map from column name (lowercase) to order number
}

/**
 * Table data with linked tables
 */
interface TableData {
    tableName: string;
    columns: string[];
    linkedTables: Map<string, LinkedTableInfo>; // Tables this table references
    referencedByTables: Map<string, LinkedTableInfo>; // Tables that reference this table
}
