import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface AnalysisConfig {
    tablesViewsFile?: string;
    sourceFolder?: string;
}

export class ConfigurationTreeDataProvider implements vscode.TreeDataProvider<ConfigItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConfigItem | undefined | null | void> = new vscode.EventEmitter<ConfigItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ConfigItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private config: AnalysisConfig = {};

    constructor() {
        this.loadConfig();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ConfigItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConfigItem): Promise<ConfigItem[]> {
        if (!element) {
            const items: ConfigItem[] = [];

            // Tables/Views JSON file configuration
            const tablesFileItem = new ConfigItem(
                'Tables/Views Definition',
                vscode.TreeItemCollapsibleState.None,
                'tablesFile'
            );
            tablesFileItem.description = this.config.tablesViewsFile 
                ? path.basename(this.config.tablesViewsFile)
                : 'Not set';
            tablesFileItem.tooltip = this.config.tablesViewsFile || 'Click to select tables_views.json file';
            tablesFileItem.iconPath = new vscode.ThemeIcon('json');
            tablesFileItem.command = {
                command: 'acacia-db.selectTablesFile',
                title: 'Select Tables File'
            };
            tablesFileItem.contextValue = 'configItem';
            items.push(tablesFileItem);

            // Source folder configuration
            const sourceFolderItem = new ConfigItem(
                'Source Code Folder',
                vscode.TreeItemCollapsibleState.None,
                'sourceFolder'
            );
            sourceFolderItem.description = this.config.sourceFolder 
                ? path.basename(this.config.sourceFolder)
                : 'Not set';
            sourceFolderItem.tooltip = this.config.sourceFolder || 'Click to select source folder';
            sourceFolderItem.iconPath = new vscode.ThemeIcon('folder');
            sourceFolderItem.command = {
                command: 'acacia-db.selectSourceFolder',
                title: 'Select Source Folder'
            };
            sourceFolderItem.contextValue = 'configItem';
            items.push(sourceFolderItem);

            // Status item
            const isConfigured = this.config.tablesViewsFile || this.config.sourceFolder;
            const statusItem = new ConfigItem(
                isConfigured ? 'Configuration Active' : 'No Configuration',
                vscode.TreeItemCollapsibleState.None,
                'status'
            );
            statusItem.iconPath = new vscode.ThemeIcon(
                isConfigured ? 'check' : 'circle-outline',
                isConfigured ? new vscode.ThemeColor('testing.iconPassed') : undefined
            );
            statusItem.description = isConfigured 
                ? 'Ready to analyze' 
                : 'Configure settings above';
            items.push(statusItem);

            // Info items if configured
            if (this.config.tablesViewsFile) {
                const fileExists = fs.existsSync(this.config.tablesViewsFile);
                const fileInfoItem = new ConfigItem(
                    'Tables file status',
                    vscode.TreeItemCollapsibleState.None,
                    'info'
                );
                fileInfoItem.description = fileExists ? 'Found' : 'Not found';
                fileInfoItem.iconPath = new vscode.ThemeIcon(
                    fileExists ? 'pass' : 'error',
                    fileExists 
                        ? new vscode.ThemeColor('testing.iconPassed')
                        : new vscode.ThemeColor('testing.iconFailed')
                );
                items.push(fileInfoItem);
            }

            if (this.config.sourceFolder) {
                const folderExists = fs.existsSync(this.config.sourceFolder);
                const folderInfoItem = new ConfigItem(
                    'Source folder status',
                    vscode.TreeItemCollapsibleState.None,
                    'info'
                );
                folderInfoItem.description = folderExists ? 'Found' : 'Not found';
                folderInfoItem.iconPath = new vscode.ThemeIcon(
                    folderExists ? 'pass' : 'error',
                    folderExists 
                        ? new vscode.ThemeColor('testing.iconPassed')
                        : new vscode.ThemeColor('testing.iconFailed')
                );
                items.push(folderInfoItem);
            }

            return items;
        }

        return [];
    }

    getConfig(): AnalysisConfig {
        return this.config;
    }

    async setTablesFile(filePath: string): Promise<void> {
        this.config.tablesViewsFile = filePath;
        await this.saveConfig();
        this.refresh();
    }

    async setSourceFolder(folderPath: string): Promise<void> {
        this.config.sourceFolder = folderPath;
        await this.saveConfig();
        this.refresh();
    }

    async clearTablesFile(): Promise<void> {
        this.config.tablesViewsFile = undefined;
        await this.saveConfig();
        this.refresh();
    }

    async clearSourceFolder(): Promise<void> {
        this.config.sourceFolder = undefined;
        await this.saveConfig();
        this.refresh();
    }

    private async saveConfig(): Promise<void> {
        const workspaceConfig = vscode.workspace.getConfiguration('acaciaDb');
        await workspaceConfig.update('tablesViewsFile', this.config.tablesViewsFile, vscode.ConfigurationTarget.Workspace);
        await workspaceConfig.update('sourceFolder', this.config.sourceFolder, vscode.ConfigurationTarget.Workspace);
    }

    private loadConfig(): void {
        const workspaceConfig = vscode.workspace.getConfiguration('acaciaDb');
        this.config.tablesViewsFile = workspaceConfig.get<string>('tablesViewsFile');
        this.config.sourceFolder = workspaceConfig.get<string>('sourceFolder');
    }
}

class ConfigItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'tablesFile' | 'sourceFolder' | 'status' | 'info'
    ) {
        super(label, collapsibleState);
    }
}
