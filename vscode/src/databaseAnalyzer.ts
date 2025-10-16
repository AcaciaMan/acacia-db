import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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

export interface AnalysisConfig {
    tablesViewsFile?: string;
    sourceFolder?: string;
}

export interface TablesViewsSchema {
    tables?: string[];
    views?: string[];
    [key: string]: any;
}

export class DatabaseAnalyzer {
    private tablePatterns: RegExp[];
    private columnPatterns: RegExp[];
    private config?: AnalysisConfig;
    private knownTables: Set<string> = new Set();
    
    constructor() {
        // Default patterns for detecting table references
        this.tablePatterns = [
            /FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
            /JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
            /INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
            /UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
            /TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
        ];
        
        // Patterns for detecting column references
        this.columnPatterns = [
            /SELECT\s+([\w\s,.*]+)\s+FROM/gi,
            /WHERE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[=<>]/gi,
            /ORDER\s+BY\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
        ];
    }

    setConfig(config: AnalysisConfig): void {
        this.config = config;
        this.loadTablesFromFile();
    }

    private loadTablesFromFile(): void {
        this.knownTables.clear();
        
        if (!this.config?.tablesViewsFile) {
            return;
        }

        try {
            if (fs.existsSync(this.config.tablesViewsFile)) {
                const content = fs.readFileSync(this.config.tablesViewsFile, 'utf8');
                const schema: TablesViewsSchema = JSON.parse(content);
                
                // Load tables
                if (schema.tables && Array.isArray(schema.tables)) {
                    schema.tables.forEach(table => this.knownTables.add(table.toLowerCase()));
                }
                
                // Load views
                if (schema.views && Array.isArray(schema.views)) {
                    schema.views.forEach(view => this.knownTables.add(view.toLowerCase()));
                }

                console.log(`Loaded ${this.knownTables.size} tables/views from ${this.config.tablesViewsFile}`);
            }
        } catch (error) {
            console.error('Error loading tables/views file:', error);
            vscode.window.showWarningMessage(`Failed to load tables file: ${error}`);
        }
    }

    async analyzeWorkspace(): Promise<Map<string, TableUsage>> {
        const config = vscode.workspace.getConfiguration('acaciaDb');
        const scanPatterns = config.get<string[]>('scanPatterns') || ['**/*.{sql,js,ts,java,cs,py,php,rb}'];
        const excludePatterns = config.get<string[]>('excludePatterns') || ['**/node_modules/**'];

        const tableUsageMap = new Map<string, TableUsage>();

        let files: vscode.Uri[] = [];

        // If source folder is configured, use it instead of workspace
        if (this.config?.sourceFolder) {
            try {
                const sourceFolderUri = vscode.Uri.file(this.config.sourceFolder);
                const pattern = new vscode.RelativePattern(sourceFolderUri, `{${scanPatterns.join(',')}}`);
                files = await vscode.workspace.findFiles(pattern, `{${excludePatterns.join(',')}}`);
                
                vscode.window.showInformationMessage(`Analyzing ${files.length} files in: ${this.config.sourceFolder}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Error scanning source folder: ${error}`);
                return tableUsageMap;
            }
        } else {
            // Find all files matching the patterns in workspace
            files = await vscode.workspace.findFiles(
                `{${scanPatterns.join(',')}}`,
                `{${excludePatterns.join(',')}}`
            );
        }

        const totalFiles = files.length;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing database usage",
            cancellable: false
        }, async (progress) => {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                progress.report({ 
                    increment: (100 / totalFiles),
                    message: `Scanning ${path.basename(file.fsPath)} (${i + 1}/${totalFiles})`
                });
                
                await this.analyzeFile(file, tableUsageMap);
            }
        });

        // Filter tables if we have a known tables list
        if (this.knownTables.size > 0) {
            const filteredMap = new Map<string, TableUsage>();
            for (const [tableName, usage] of tableUsageMap) {
                if (this.knownTables.has(tableName.toLowerCase())) {
                    filteredMap.set(tableName, usage);
                }
            }
            vscode.window.showInformationMessage(
                `Filtered to ${filteredMap.size} known tables from ${tableUsageMap.size} total matches`
            );
            return filteredMap;
        }

        return tableUsageMap;
    }

    private async analyzeFile(uri: vscode.Uri, tableUsageMap: Map<string, TableUsage>): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();
            const lines = text.split('\n');

            // Search for table references
            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                
                for (const pattern of this.tablePatterns) {
                    pattern.lastIndex = 0; // Reset regex
                    let match;
                    
                    while ((match = pattern.exec(line)) !== null) {
                        const tableName = match[1];
                        const column = match.index;
                        
                        const reference: DatabaseReference = {
                            tableName,
                            filePath: uri.fsPath,
                            line: lineNum + 1,
                            column: column,
                            context: line.trim()
                        };

                        // Add to table usage map
                        if (!tableUsageMap.has(tableName)) {
                            tableUsageMap.set(tableName, {
                                tableName,
                                references: [],
                                files: new Set()
                            });
                        }

                        const usage = tableUsageMap.get(tableName)!;
                        usage.references.push(reference);
                        usage.files.add(uri.fsPath);
                    }
                }
            }
        } catch (error) {
            console.error(`Error analyzing file ${uri.fsPath}:`, error);
        }
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
        report += `- Files with database references: ${filesSet.size}\n\n`;
        
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
                report += `- \`${relativePath}:${ref.line}\` - \`${ref.context}\`\n`;
            }
            
            if (usage.references.length > 10) {
                report += `\n_...and ${usage.references.length - 10} more references_\n`;
            }
            
            report += '\n';
        }
        
        return report;
    }
}
