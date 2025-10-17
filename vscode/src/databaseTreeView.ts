import * as vscode from 'vscode';
import { DatabaseAnalyzer, TableUsage } from './databaseAnalyzer';
import * as path from 'path';

export class DatabaseTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private tableUsageMap: Map<string, TableUsage> = new Map();
    private analyzer: DatabaseAnalyzer;
    private lastAnalysisTimestamp?: string;

    constructor(analyzer: DatabaseAnalyzer) {
        this.analyzer = analyzer;
        // Load cached results on startup
        this.loadCachedResults();
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
    }

    async analyze(): Promise<void> {
        this.tableUsageMap = await this.analyzer.analyzeWorkspace();
        this.lastAnalysisTimestamp = this.analyzer.getLastAnalysisTimestamp();
        this.refresh();
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
            
            // Summary item
            const totalRefs = Array.from(this.tableUsageMap.values())
                .reduce((sum, usage) => sum + usage.references.length, 0);
            
            let summaryLabel = `${this.tableUsageMap.size} tables, ${totalRefs} references`;
            let tooltipText = summaryLabel;
            
            if (this.lastAnalysisTimestamp) {
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

            // Table items
            const sortedTables = Array.from(this.tableUsageMap.entries())
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
            const linkedTables = new Map<string, { occurrences: number; files: Set<string> }>();
            
            for (const [key, rel] of relationships) {
                if (rel.table1 === tableName) {
                    linkedTables.set(rel.table2, { occurrences: rel.occurrences, files: rel.files });
                } else if (rel.table2 === tableName) {
                    linkedTables.set(rel.table1, { occurrences: rel.occurrences, files: rel.files });
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

            // Sort file groups alphabetically
            const sortedFileGroups = Array.from(fileGroups.entries())
                .sort((a, b) => a[0].localeCompare(b[0]));

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
            const linkedTables = new Map<string, { occurrences: number; files: Set<string> }>();
            
            for (const [key, rel] of relationships) {
                if (rel.table1 === tableName) {
                    linkedTables.set(rel.table2, { occurrences: rel.occurrences, files: rel.files });
                } else if (rel.table2 === tableName) {
                    linkedTables.set(rel.table1, { occurrences: rel.occurrences, files: rel.files });
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
                item.description = `${data.occurrences} relationships in ${data.files.size} files`;
                item.tooltip = `${linkedTableName} appears near ${tableName} in ${data.files.size} files`;
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
                if ((rel.table1 === table1 && rel.table2 === table2) || 
                    (rel.table1 === table2 && rel.table2 === table1)) {
                    relationship = rel;
                    break;
                }
            }
            
            if (relationship && relationship.proximityInstances) {
                // Group instances by file
                const fileInstances = new Map<string, typeof relationship.proximityInstances>();
                for (const instance of relationship.proximityInstances) {
                    if (!fileInstances.has(instance.file)) {
                        fileInstances.set(instance.file, []);
                    }
                    fileInstances.get(instance.file)!.push(instance);
                }
                
                // Sort files alphabetically
                const sortedFiles = Array.from(fileInstances.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]));
                
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
            
            // Sort instances by line1
            const sortedInstances = [...element.references].sort((a: any, b: any) => a.line1 - b.line1);
            
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
            
            // First table reference
            const item1 = new TreeItem(
                `${table1}: Line ${instance.line1}`,
                vscode.TreeItemCollapsibleState.None,
                'relationshipLine',
                undefined,
                undefined,
                { filePath: instance.file, line: instance.line1, tableName: table1 }
            );
            item1.iconPath = new vscode.ThemeIcon('symbol-field');
            item1.contextValue = 'relationshipLine';
            item1.command = {
                command: 'acacia-db.openReference',
                title: 'Open Reference',
                arguments: [{ filePath: instance.file, line: instance.line1, column: 1 }]
            };
            items.push(item1);
            
            // Second table reference
            const item2 = new TreeItem(
                `${table2}: Line ${instance.line2}`,
                vscode.TreeItemCollapsibleState.None,
                'relationshipLine',
                undefined,
                undefined,
                { filePath: instance.file, line: instance.line2, tableName: table2 }
            );
            item2.iconPath = new vscode.ThemeIcon('symbol-field');
            item2.contextValue = 'relationshipLine';
            item2.command = {
                command: 'acacia-db.openReference',
                title: 'Open Reference',
                arguments: [{ filePath: instance.file, line: instance.line2, column: 1 }]
            };
            items.push(item2);
            
            return items;
        } else if (element.type === 'file' && element.references) {
            // Show individual references sorted by line number
            const sortedRefs = [...element.references].sort((a, b) => a.line - b.line);
            return sortedRefs.map(ref => {
                const item = new TreeItem(
                    `Line ${ref.line}`,
                    vscode.TreeItemCollapsibleState.None,
                    'reference',
                    undefined,
                    undefined,
                    ref
                );
                item.description = ref.context.substring(0, 50);
                item.tooltip = ref.context;
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
