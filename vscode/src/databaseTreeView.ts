import * as vscode from 'vscode';
import { DatabaseAnalyzer, TableUsage } from './databaseAnalyzer';
import * as path from 'path';

export class DatabaseTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private tableUsageMap: Map<string, TableUsage> = new Map();
    private analyzer: DatabaseAnalyzer;
    private lastAnalysisTimestamp?: string;
    private filterText: string = '';
    
    // Lazy loading cache: file -> references with context
    private fileContextCache: Map<string, Map<number, string>> = new Map();

    constructor(analyzer: DatabaseAnalyzer) {
        this.analyzer = analyzer;
        // Load cached results on startup
        this.loadCachedResults();
    }

    setFilter(filterText: string): void {
        this.filterText = filterText.toLowerCase().trim();
        this.refresh();
    }

    getFilter(): string {
        return this.filterText;
    }

    clearFilter(): void {
        this.filterText = '';
        this.refresh();
    }

    private async loadCachedResults(): Promise<void> {
        try {
            const cachedResults = await this.analyzer.loadResults();
            if (cachedResults) {
                this.tableUsageMap = cachedResults;
                this.lastAnalysisTimestamp = this.analyzer.getLastAnalysisTimestamp();
                this.refresh();
                console.log('Loaded cached analysis results from table_refs.json');
            }
        } catch (error) {
            console.error('Error loading cached results:', error);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
        // Clear context cache on refresh to ensure fresh data
        this.fileContextCache.clear();
    }

    async analyze(): Promise<void> {
        this.tableUsageMap = await this.analyzer.analyzeWorkspace();
        this.lastAnalysisTimestamp = this.analyzer.getLastAnalysisTimestamp();
        this.refresh();
    }

    /**
     * LAZY LOADING: Load file contexts on demand when file node is expanded.
     * Uses memory-efficient line reading to avoid loading entire file.
     */
    private async loadFileContexts(filePath: string, references: any[]): Promise<void> {
        try {
            const lineCache = new Map<number, string>();
            
            // Extract unique line numbers that need contexts
            const lines = new Set<number>();
            for (const ref of references) {
                if (!ref.context || ref.context === '') {
                    lines.add(ref.line);
                }
            }
            
            // Load contexts using analyzer's memory-efficient method
            // This reads only specific lines, not the entire file
            for (const lineNum of lines) {
                const context = await this.readLineFromFile(filePath, lineNum);
                lineCache.set(lineNum, context);
            }
            
            // Cache for future use
            this.fileContextCache.set(filePath, lineCache);
        } catch (error) {
            console.error(`Error loading contexts for ${filePath}:`, error);
        }
    }

    /**
     * Memory-efficient line reader (delegates to analyzer or uses own implementation).
     * Reads only specific lines without loading entire file into memory.
     */
    private async readLineFromFile(filePath: string, lineNumber: number): Promise<string> {
        // Use Node.js fs to read specific line efficiently
        const fs = require('fs');
        try {
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
                    break;
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
                
                if (currentLine > lineNumber) {
                    break;
                }
            }
            
            fs.closeSync(fd);
            
            if (currentLine === lineNumber && currentLineContent) {
                const trimmed = currentLineContent.trim();
                return trimmed.length > 200 ? trimmed.substring(0, 200) + '...' : trimmed;
            }
            
            return '';
        } catch (err) {
            return '';
        }
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            // Root level - show summary and tables
            if (this.tableUsageMap.size === 0) {
                return [new TreeItem('No database references found. Click "Analyze" to scan.', vscode.TreeItemCollapsibleState.None, 'info')];
            }

            const items: TreeItem[] = [];
            
            // Apply filter if set
            const filterActive = this.filterText.length > 0;
            
            // Get tables with references and apply filter
            let tablesWithRefs = Array.from(this.tableUsageMap.values())
                .filter(usage => usage.references.length > 0);
            
            if (filterActive) {
                tablesWithRefs = tablesWithRefs.filter(usage => 
                    usage.tableName.toLowerCase().includes(this.filterText)
                );
            }
            
            const totalRefs = tablesWithRefs
                .reduce((sum, usage) => sum + usage.references.length, 0);
            
            // Show filter indicator in summary
            let summaryLabel = filterActive 
                ? `🔍 ${tablesWithRefs.length} of ${Array.from(this.tableUsageMap.values()).filter(u => u.references.length > 0).length} tables`
                : `${tablesWithRefs.length} tables, ${totalRefs} references`;
            let tooltipText = summaryLabel;
            
            if (filterActive) {
                tooltipText = `Filter: "${this.filterText}"\n${tablesWithRefs.length} matching tables, ${totalRefs} references`;
            } else if (this.lastAnalysisTimestamp) {
                const analysisDate = new Date(this.lastAnalysisTimestamp);
                const formattedDate = analysisDate.toLocaleString();
                tooltipText = `${summaryLabel}\nAnalyzed: ${formattedDate}`;
            }
            
            const summaryItem = new TreeItem(
                summaryLabel,
                vscode.TreeItemCollapsibleState.None,
                'summary'
            );
            summaryItem.iconPath = new vscode.ThemeIcon('database');
            summaryItem.tooltip = tooltipText;
            items.push(summaryItem);

            // If no tables match filter, show message
            if (filterActive && tablesWithRefs.length === 0) {
                const noMatchItem = new TreeItem(
                    `No tables matching "${this.filterText}"`,
                    vscode.TreeItemCollapsibleState.None,
                    'info'
                );
                noMatchItem.iconPath = new vscode.ThemeIcon('search-stop');
                items.push(noMatchItem);
                return items;
            }

            // Table items - only show tables with references (and matching filter)
            const sortedTables = tablesWithRefs
                .map(usage => [usage.tableName, usage] as [string, TableUsage])
                .sort((a, b) => {
                    const refDiff = b[1].references.length - a[1].references.length;
                    if (refDiff !== 0) {
                        return refDiff;
                    }
                    return a[0].localeCompare(b[0]); // Sort by table name if refs are equal
                });

            for (const [tableName, usage] of sortedTables) {
                const item = new TreeItem(
                    tableName,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'table',
                    usage
                );
                item.description = `${usage.references.length} refs`;
                item.iconPath = new vscode.ThemeIcon('symbol-field');
                item.contextValue = 'table';
                items.push(item);
            }

            return items;
        } else if (element.type === 'table' && element.tableUsage) {
            // Show linked tables and references for a table
            const items: TreeItem[] = [];
            const tableName = element.tableUsage.tableName;
            
            // Get relationships for this table
            const relationships = this.analyzer.getRelationships();
            const linkedTables = new Map<string, { occurrences: number; fileCount: number }>();
            
            for (const [key, rel] of relationships) {
                const table1Name = this.analyzer.getTableName(rel.table1Id);
                const table2Name = this.analyzer.getTableName(rel.table2Id);
                
                if (table1Name === tableName) {
                    linkedTables.set(table2Name, { occurrences: rel.occurrences, fileCount: rel.fileCount });
                } else if (table2Name === tableName) {
                    linkedTables.set(table1Name, { occurrences: rel.occurrences, fileCount: rel.fileCount });
                }
            }
            
            // Add linked tables section if there are any
            if (linkedTables.size > 0) {
                const linkedTablesItem = new TreeItem(
                    '🔗 Linked Tables',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'linkedTables',
                    element.tableUsage
                );
                linkedTablesItem.description = `${linkedTables.size} tables`;
                linkedTablesItem.tooltip = 'Tables that appear near this table in code';
                linkedTablesItem.contextValue = 'linkedTables';
                items.push(linkedTablesItem);
            }
            
            // Group by file
            const fileGroups = new Map<string, typeof element.tableUsage.references>();
            for (const ref of element.tableUsage.references) {
                if (!fileGroups.has(ref.filePath)) {
                    fileGroups.set(ref.filePath, []);
                }
                fileGroups.get(ref.filePath)!.push(ref);
            }

            // Sort file groups by reference count (descending), then alphabetically
            const sortedFileGroups = Array.from(fileGroups.entries())
                .sort((a, b) => {
                    const refDiff = b[1].length - a[1].length; // Most references first
                    if (refDiff !== 0) {
                        return refDiff;
                    }
                    return a[0].localeCompare(b[0]); // Alphabetically if equal
                });

            for (const [filePath, refs] of sortedFileGroups) {
                const fileName = path.basename(filePath);
                const relativePath = vscode.workspace.asRelativePath(filePath);
                const item = new TreeItem(
                    fileName,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'file',
                    element.tableUsage,
                    refs
                );
                item.description = `${refs.length} refs`;
                item.tooltip = relativePath;
                item.iconPath = vscode.ThemeIcon.File;
                item.contextValue = 'file';
                items.push(item);
            }

            return items;
        } else if (element.type === 'linkedTables' && element.tableUsage) {
            // Show individual linked tables
            const items: TreeItem[] = [];
            const tableName = element.tableUsage.tableName;
            const relationships = this.analyzer.getRelationships();
            const linkedTables = new Map<string, { occurrences: number; fileCount: number }>();
            
            for (const [key, rel] of relationships) {
                const table1Name = this.analyzer.getTableName(rel.table1Id);
                const table2Name = this.analyzer.getTableName(rel.table2Id);
                
                if (table1Name === tableName) {
                    linkedTables.set(table2Name, { occurrences: rel.occurrences, fileCount: rel.fileCount });
                } else if (table2Name === tableName) {
                    linkedTables.set(table1Name, { occurrences: rel.occurrences, fileCount: rel.fileCount });
                }
            }
            
            // Sort by occurrences (descending), then by name (ascending)
            const sortedLinkedTables = Array.from(linkedTables.entries())
                .sort((a, b) => {
                    const occDiff = b[1].occurrences - a[1].occurrences;
                    if (occDiff !== 0) {
                        return occDiff;
                    }
                    return a[0].localeCompare(b[0]);
                });
            
            for (const [linkedTableName, data] of sortedLinkedTables) {
                const item = new TreeItem(
                    linkedTableName,
                    vscode.TreeItemCollapsibleState.Collapsed,  // Make it expandable
                    'linkedTable',
                    element.tableUsage,
                    undefined,
                    undefined,
                    linkedTableName
                );
                item.description = `${data.occurrences} relationships in ${data.fileCount} files`;
                item.tooltip = `${linkedTableName} appears near ${tableName} in ${data.fileCount} files`;
                item.iconPath = new vscode.ThemeIcon('link');
                item.contextValue = 'linkedTable';
                items.push(item);
            }
            
            return items;
        } else if (element.type === 'linkedTable' && element.tableUsage && element.linkedTableName) {
            // Show files where this linked table relationship occurs
            const items: TreeItem[] = [];
            const table1 = element.tableUsage.tableName;
            const table2 = element.linkedTableName;
            const relationships = this.analyzer.getRelationships();
            
            // Find the relationship
            let relationship: any = null;
            for (const [key, rel] of relationships) {
                const table1Name = this.analyzer.getTableName(rel.table1Id);
                const table2Name = this.analyzer.getTableName(rel.table2Id);
                
                if ((table1Name === table1 && table2Name === table2) || 
                    (table1Name === table2 && table2Name === table1)) {
                    relationship = rel;
                    break;
                }
            }
            
            if (relationship && relationship.proximityInstances) {
                // Group instances by file
                const fileInstances = new Map<string, typeof relationship.proximityInstances>();
                for (const instance of relationship.proximityInstances) {
                    const fileName = this.analyzer.getFileName(instance.fileId);
                    if (!fileInstances.has(fileName)) {
                        fileInstances.set(fileName, []);
                    }
                    fileInstances.get(fileName)!.push(instance);
                }
                
                // Sort files by instance count (descending), then alphabetically
                const sortedFiles = Array.from(fileInstances.entries())
                    .sort((a, b) => {
                        const instDiff = b[1].length - a[1].length; // Most instances first
                        if (instDiff !== 0) {
                            return instDiff;
                        }
                        return a[0].localeCompare(b[0]); // Alphabetically if equal
                    });
                
                for (const [filePath, instances] of sortedFiles) {
                    const fileName = path.basename(filePath);
                    const relativePath = vscode.workspace.asRelativePath(filePath);
                    const item = new TreeItem(
                        fileName,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'relationshipFile',
                        element.tableUsage,
                        instances,  // Store instances in references field
                        undefined,
                        element.linkedTableName
                    );
                    item.description = `${instances.length} ${instances.length === 1 ? 'instance' : 'instances'}`;
                    item.tooltip = relativePath;
                    item.iconPath = vscode.ThemeIcon.File;
                    item.contextValue = 'relationshipFile';
                    items.push(item);
                }
            }
            
            return items;
        } else if (element.type === 'relationshipFile' && element.references && element.tableUsage && element.linkedTableName) {
            // Show individual proximity instances
            const items: TreeItem[] = [];
            const table1 = element.tableUsage.tableName;
            const table2 = element.linkedTableName;
            
            // Sort instances by distance (ascending - closest first), then by line1 (ascending - earliest first)
            const sortedInstances = [...element.references].sort((a: any, b: any) => {
                const distDiff = a.distance - b.distance; // Closest proximity first
                if (distDiff !== 0) {
                    return distDiff;
                }
                return a.line1 - b.line1; // Earliest line if same distance
            });
            
            for (const instance of sortedInstances) {
                // Create a group item for this proximity instance
                const item = new TreeItem(
                    `${table1} ↔ ${table2}`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'relationshipInstance',
                    element.tableUsage,
                    undefined,
                    instance,
                    element.linkedTableName
                );
                item.description = `${instance.distance} lines apart`;
                item.tooltip = `${table1} at line ${instance.line1}, ${table2} at line ${instance.line2}`;
                item.iconPath = new vscode.ThemeIcon('arrow-both');
                item.contextValue = 'relationshipInstance';
                items.push(item);
            }
            
            return items;
        } else if (element.type === 'relationshipInstance' && element.reference && element.tableUsage && element.linkedTableName) {
            // Show the two specific lines where tables appear
            const items: TreeItem[] = [];
            const table1 = element.tableUsage.tableName;
            const table2 = element.linkedTableName;
            const instance = element.reference;
            
            // Convert fileId to actual file path
            const filePath = this.analyzer.getFileName(instance.fileId);
            
            // First table reference
            const item1 = new TreeItem(
                `${table1}: Line ${instance.line1}`,
                vscode.TreeItemCollapsibleState.None,
                'relationshipLine',
                undefined,
                undefined,
                { filePath: filePath, line: instance.line1, tableName: table1 }
            );
            item1.iconPath = new vscode.ThemeIcon('symbol-field');
            item1.contextValue = 'relationshipLine';
            item1.command = {
                command: 'acacia-db.openReference',
                title: 'Open Reference',
                arguments: [{ filePath: filePath, line: instance.line1, column: 1 }]
            };
            items.push(item1);
            
            // Second table reference
            const item2 = new TreeItem(
                `${table2}: Line ${instance.line2}`,
                vscode.TreeItemCollapsibleState.None,
                'relationshipLine',
                undefined,
                undefined,
                { filePath: filePath, line: instance.line2, tableName: table2 }
            );
            item2.iconPath = new vscode.ThemeIcon('symbol-field');
            item2.contextValue = 'relationshipLine';
            item2.command = {
                command: 'acacia-db.openReference',
                title: 'Open Reference',
                arguments: [{ filePath: filePath, line: instance.line2, column: 1 }]
            };
            items.push(item2);
            
            return items;
        } else if (element.type === 'file' && element.references) {
            // LAZY LOADING: Load contexts on demand when file node is expanded
            const sortedRefs = [...element.references].sort((a, b) => a.line - b.line);
            
            // Batch load contexts for this file if not cached
            const filePath = sortedRefs[0]?.filePath;
            if (filePath && !this.fileContextCache.has(filePath)) {
                await this.loadFileContexts(filePath, sortedRefs);
            }
            
            return sortedRefs.map(ref => {
                // Get context from cache (already loaded above)
                let context = ref.context || '';
                if (!context && filePath) {
                    const fileCache = this.fileContextCache.get(filePath);
                    context = fileCache?.get(ref.line) || '';
                }
                
                const item = new TreeItem(
                    `Line ${ref.line}`,
                    vscode.TreeItemCollapsibleState.None,
                    'reference',
                    undefined,
                    undefined,
                    ref
                );
                item.description = context.substring(0, 50);
                item.tooltip = context || `Line ${ref.line}, Column ${ref.column}`;
                item.iconPath = new vscode.ThemeIcon('symbol-method');
                item.contextValue = 'reference';
                item.command = {
                    command: 'acacia-db.openReference',
                    title: 'Open Reference',
                    arguments: [ref]
                };
                return item;
            });
        }

        return [];
    }

    getTableUsageMap(): Map<string, TableUsage> {
        return this.tableUsageMap;
    }
}

class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'summary' | 'table' | 'file' | 'reference' | 'info' | 'linkedTables' | 'linkedTable' | 'relationshipFile' | 'relationshipInstance' | 'relationshipLine',
        public readonly tableUsage?: TableUsage,
        public readonly references?: any[],
        public readonly reference?: any,
        public readonly linkedTableName?: string
    ) {
        super(label, collapsibleState);
    }
}
