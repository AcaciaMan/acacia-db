// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DatabaseAnalyzer, DatabaseReference } from './databaseAnalyzer';
import { DatabaseTreeDataProvider } from './databaseTreeView';
import { ConfigurationTreeDataProvider } from './configurationTreeView';
import { ColumnExplorerProvider } from './columnExplorerTreeView';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Acacia DB extension is now active!');

	const analyzer = new DatabaseAnalyzer();
	const treeDataProvider = new DatabaseTreeDataProvider(analyzer);
	const configProvider = new ConfigurationTreeDataProvider();
	const columnExplorerProvider = new ColumnExplorerProvider();
	
	// Register the tree views
	const treeView = vscode.window.createTreeView('acaciaDbExplorer', {
		treeDataProvider: treeDataProvider,
		showCollapseAll: true
	});

	const configView = vscode.window.createTreeView('acaciaDbConfiguration', {
		treeDataProvider: configProvider,
		showCollapseAll: false
	});

	const columnExplorerView = vscode.window.createTreeView('acaciaDbColumnExplorer', {
		treeDataProvider: columnExplorerProvider,
		showCollapseAll: true
	});

	// Command: Select Tables/Views JSON File
	const selectTablesFile = vscode.commands.registerCommand('acacia-db.selectTablesFile', async () => {
		const fileUri = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: {
				'JSON Files': ['json'],
				'All Files': ['*']
			},
			title: 'Select Tables/Views JSON File'
		});

		if (fileUri && fileUri[0]) {
			await configProvider.setTablesFile(fileUri[0].fsPath);
			vscode.window.showInformationMessage(`Tables file set to: ${fileUri[0].fsPath}`);
		}
	});

	// Command: Select Source Folder
	const selectSourceFolder = vscode.commands.registerCommand('acacia-db.selectSourceFolder', async () => {
		const folderUri = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: 'Select Source Code Folder to Analyze'
		});

		if (folderUri && folderUri[0]) {
			await configProvider.setSourceFolder(folderUri[0].fsPath);
			vscode.window.showInformationMessage(`Source folder set to: ${folderUri[0].fsPath}`);
		}
	});

	// Command: Clear Tables File
	const clearTablesFile = vscode.commands.registerCommand('acacia-db.clearTablesFile', async () => {
		await configProvider.clearTablesFile();
		vscode.window.showInformationMessage('Tables file cleared');
	});

	// Command: Clear Source Folder
	const clearSourceFolder = vscode.commands.registerCommand('acacia-db.clearSourceFolder', async () => {
		await configProvider.clearSourceFolder();
		vscode.window.showInformationMessage('Source folder cleared');
	});

	// Command: Refresh Explorer
	const refreshExplorer = vscode.commands.registerCommand('acacia-db.refreshExplorer', async () => {
		await treeDataProvider.analyze();
	});

	// Command: Filter Tables
	const filterTables = vscode.commands.registerCommand('acacia-db.filterTables', async () => {
		const currentFilter = treeDataProvider.getFilter();
		const filterText = await vscode.window.showInputBox({
			prompt: 'Enter text to filter table names',
			placeHolder: 'e.g. user, order, customer',
			value: currentFilter,
			title: 'Filter Tables'
		});

		if (filterText !== undefined) {
			treeDataProvider.setFilter(filterText);
			if (filterText.trim().length > 0) {
				vscode.window.showInformationMessage(`Filtering tables by: "${filterText}"`);
			}
		}
	});

	// Command: Clear Filter
	const clearFilter = vscode.commands.registerCommand('acacia-db.clearFilter', async () => {
		const currentFilter = treeDataProvider.getFilter();
		if (currentFilter.length > 0) {
			treeDataProvider.clearFilter();
			vscode.window.showInformationMessage('Filter cleared');
		} else {
			vscode.window.showInformationMessage('No filter active');
		}
	});

	// Command: Open Reference
	const openReference = vscode.commands.registerCommand('acacia-db.openReference', async (reference: DatabaseReference) => {
		if (reference) {
			const document = await vscode.workspace.openTextDocument(reference.filePath);
			const editor = await vscode.window.showTextDocument(document);
			const position = new vscode.Position(reference.line - 1, reference.column);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
		}
	});

	// Command: Copy Table Name
	const copyTableName = vscode.commands.registerCommand('acacia-db.copyTableName', async (item: any) => {
		if (item && item.label) {
			await vscode.env.clipboard.writeText(item.label);
			vscode.window.showInformationMessage(`Copied table name: ${item.label}`);
		}
	});

	// Command: Analyze Workspace
	const analyzeWorkspace = vscode.commands.registerCommand('acacia-db.analyzeWorkspace', async () => {
		try {
			// Configuration is read directly from settings by the analyzer
			await treeDataProvider.analyze();
			const tableUsageMap = treeDataProvider.getTableUsageMap();
			
			if (tableUsageMap.size === 0) {
				vscode.window.showInformationMessage('No database references found in workspace.');
				return;
			}

			// The analyzer already shows completion message with relationship info
		} catch (error) {
			vscode.window.showErrorMessage(`Analysis failed: ${error}`);
		}
	});

	// Command: Find Table References
	const findTableReferences = vscode.commands.registerCommand('acacia-db.findTableReferences', async () => {
		const tableName = await vscode.window.showInputBox({
			prompt: 'Enter table name to search for',
			placeHolder: 'users'
		});

		if (!tableName) {
			return;
		}

		try {
			const references = await analyzer.findTableReferences(tableName);
			
			if (references.length === 0) {
				vscode.window.showInformationMessage(`No references found for table: ${tableName}`);
				return;
			}

			// Create a QuickPick to show all references
			const items = references.map(ref => ({
				label: `${vscode.workspace.asRelativePath(ref.filePath)}:${ref.line}`,
				description: ref.context,
				detail: ref.filePath,
				reference: ref
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: `${references.length} references found for table: ${tableName}`
			});

			if (selected) {
				// Open file at the reference location
				const document = await vscode.workspace.openTextDocument(selected.reference.filePath);
				const editor = await vscode.window.showTextDocument(document);
				const position = new vscode.Position(selected.reference.line - 1, selected.reference.column);
				editor.selection = new vscode.Selection(position, position);
				editor.revealRange(new vscode.Range(position, position));
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Search failed: ${error}`);
		}
	});

	// Command: Generate Documentation
	const generateDocumentation = vscode.commands.registerCommand('acacia-db.generateDocumentation', async () => {
		try {
			const tableUsageMap = await analyzer.analyzeWorkspace();
			
			if (tableUsageMap.size === 0) {
				vscode.window.showInformationMessage('No database references found in workspace.');
				return;
			}

			const report = analyzer.generateReport(tableUsageMap);
			
			// Create a new document with the report
			const doc = await vscode.workspace.openTextDocument({
				content: report,
				language: 'markdown'
			});
			
			await vscode.window.showTextDocument(doc);
			vscode.window.showInformationMessage('Database documentation generated!');
		} catch (error) {
			vscode.window.showErrorMessage(`Documentation generation failed: ${error}`);
		}
	});

	// Command: Show Database Report
	const showDatabaseReport = vscode.commands.registerCommand('acacia-db.showDatabaseReport', async () => {
		try {
			const tableUsageMap = treeDataProvider.getTableUsageMap();
			
			if (tableUsageMap.size === 0) {
				vscode.window.showInformationMessage('No database references found. Please analyze workspace first.');
				return;
			}

			const report = analyzer.generateReport(tableUsageMap);
			
			// Create a webview panel
			const panel = vscode.window.createWebviewPanel(
				'acaciaDbReport',
				'Database Usage Report',
				vscode.ViewColumn.One,
				{}
			);

			// Convert markdown to HTML (basic conversion)
			const htmlContent = markdownToHtml(report);
			panel.webview.html = getWebviewContent(htmlContent);
		} catch (error) {
			vscode.window.showErrorMessage(`Report generation failed: ${error}`);
		}
	});

	// Command: Analyze Column Relationships
	const analyzeColumnRelationships = vscode.commands.registerCommand('acacia-db.analyzeColumnRelationships', async () => {
		await columnExplorerProvider.analyzeColumnRelationships();
	});

	// Command: Refresh Column Explorer
	const refreshColumnExplorer = vscode.commands.registerCommand('acacia-db.refreshColumnExplorer', async () => {
		columnExplorerProvider.refresh();
		vscode.window.showInformationMessage('Column Explorer refreshed');
	});

	// Command: Filter Column Explorer
	const filterColumnExplorer = vscode.commands.registerCommand('acacia-db.filterColumnExplorer', async () => {
		const currentFilter = columnExplorerProvider.getFilter();
		const filterText = await vscode.window.showInputBox({
			prompt: 'Enter text to filter table names',
			placeHolder: 'e.g. user, order, customer',
			value: currentFilter,
			title: 'Filter Tables in Column Explorer'
		});

		if (filterText !== undefined) {
			columnExplorerProvider.setFilter(filterText);
			if (filterText.trim().length > 0) {
				vscode.window.showInformationMessage(`Filtering tables by: "${filterText}"`);
			}
		}
	});

	// Command: Clear Column Explorer Filter
	const clearColumnExplorerFilter = vscode.commands.registerCommand('acacia-db.clearColumnExplorerFilter', async () => {
		const currentFilter = columnExplorerProvider.getFilter();
		if (currentFilter.length > 0) {
			columnExplorerProvider.setFilter('');
			vscode.window.showInformationMessage('Filter cleared');
		} else {
			vscode.window.showInformationMessage('No filter active');
		}
	});

	// Command: Open Column Reference
	const openColumnReference = vscode.commands.registerCommand('acacia-db.openColumnReference', async (filePath: string, line: number) => {
		try {
			const document = await vscode.workspace.openTextDocument(filePath);
			const editor = await vscode.window.showTextDocument(document);
			const position = new vscode.Position(line - 1, 0);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open file: ${error}`);
		}
	});

	context.subscriptions.push(
		treeView,
		configView,
		columnExplorerView,
		selectTablesFile,
		selectSourceFolder,
		clearTablesFile,
		clearSourceFolder,
		refreshExplorer,
		filterTables,
		clearFilter,
		openReference,
		copyTableName,
		analyzeWorkspace,
		findTableReferences,
		generateDocumentation,
		showDatabaseReport,
		analyzeColumnRelationships,
		refreshColumnExplorer,
		filterColumnExplorer,
		clearColumnExplorerFilter,
		openColumnReference
	);
}

// Helper function to convert markdown to HTML (basic)
function markdownToHtml(markdown: string): string {
	return markdown
		.replace(/^### (.*$)/gim, '<h3>$1</h3>')
		.replace(/^## (.*$)/gim, '<h2>$1</h2>')
		.replace(/^# (.*$)/gim, '<h1>$1</h1>')
		.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
		.replace(/\*(.*)\*/gim, '<em>$1</em>')
		.replace(/`([^`]+)`/gim, '<code>$1</code>')
		.replace(/^- (.*$)/gim, '<li>$1</li>')
		.replace(/\n\n/g, '</p><p>')
		.replace(/^(.+)$/gim, '<p>$1</p>');
}

// Helper function to get webview HTML content
function getWebviewContent(content: string): string {
	return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Database Usage Report</title>
		<style>
			body {
				font-family: var(--vscode-font-family);
				color: var(--vscode-foreground);
				background-color: var(--vscode-editor-background);
				padding: 20px;
				line-height: 1.6;
			}
			h1 {
				color: var(--vscode-editor-foreground);
				border-bottom: 2px solid var(--vscode-panel-border);
				padding-bottom: 10px;
			}
			h2 {
				color: var(--vscode-editor-foreground);
				margin-top: 30px;
				border-bottom: 1px solid var(--vscode-panel-border);
				padding-bottom: 5px;
			}
			h3 {
				color: var(--vscode-symbolIcon-classForeground);
				margin-top: 20px;
			}
			code {
				background-color: var(--vscode-textBlockQuote-background);
				padding: 2px 6px;
				border-radius: 3px;
				font-family: var(--vscode-editor-font-family);
				font-size: 0.9em;
			}
			ul {
				list-style-type: none;
				padding-left: 0;
			}
			li {
				margin: 5px 0;
				padding-left: 20px;
			}
			li:before {
				content: "▪";
				margin-right: 10px;
			}
		</style>
	</head>
	<body>
		${content}
	</body>
	</html>`;
}

// This method is called when your extension is deactivated
export function deactivate() {}

