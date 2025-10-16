import * as vscode from 'vscode';
import { DatabaseAnalyzer, TableUsage } from './databaseAnalyzer';
import * as path from 'path';

export class DatabaseTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private tableUsageMap: Map<string, TableUsage> = new Map();
    private analyzer: DatabaseAnalyzer;

    constructor(analyzer: DatabaseAnalyzer) {
        this.analyzer = analyzer;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async analyze(): Promise<void> {
        this.tableUsageMap = await this.analyzer.analyzeWorkspace();
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
            const summaryItem = new TreeItem(
                `${this.tableUsageMap.size} tables, ${totalRefs} references`,
                vscode.TreeItemCollapsibleState.None,
                'summary'
            );
            summaryItem.iconPath = new vscode.ThemeIcon('database');
            items.push(summaryItem);

            // Table items
            const sortedTables = Array.from(this.tableUsageMap.entries())
                .sort((a, b) => b[1].references.length - a[1].references.length);

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
            // Show references for a table
            const items: TreeItem[] = [];
            
            // Group by file
            const fileGroups = new Map<string, typeof element.tableUsage.references>();
            for (const ref of element.tableUsage.references) {
                if (!fileGroups.has(ref.filePath)) {
                    fileGroups.set(ref.filePath, []);
                }
                fileGroups.get(ref.filePath)!.push(ref);
            }

            for (const [filePath, refs] of fileGroups) {
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
        } else if (element.type === 'file' && element.references) {
            // Show individual references
            return element.references.map(ref => {
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
        public readonly type: 'summary' | 'table' | 'file' | 'reference' | 'info',
        public readonly tableUsage?: TableUsage,
        public readonly references?: any[],
        public readonly reference?: any
    ) {
        super(label, collapsibleState);
    }
}
