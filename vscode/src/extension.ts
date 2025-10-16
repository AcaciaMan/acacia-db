// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DatabaseAnalyzer, DatabaseReference } from './databaseAnalyzer';
import { DatabaseTreeDataProvider } from './databaseTreeView';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Acacia DB extension is now active!');

	const analyzer = new DatabaseAnalyzer();
	const treeDataProvider = new DatabaseTreeDataProvider(analyzer);
	
	// Register the tree view
	const treeView = vscode.window.createTreeView('acaciaDbExplorer', {
		treeDataProvider: treeDataProvider,
		showCollapseAll: true
	});

	// Command: Refresh Explorer
	const refreshExplorer = vscode.commands.registerCommand('acacia-db.refreshExplorer', async () => {
		await treeDataProvider.analyze();
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
			await treeDataProvider.analyze();
			const tableUsageMap = treeDataProvider.getTableUsageMap();
			
			if (tableUsageMap.size === 0) {
				vscode.window.showInformationMessage('No database references found in workspace.');
				return;
			}

			vscode.window.showInformationMessage(
				`Analysis complete! Found ${tableUsageMap.size} tables with references.`
			);
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

	context.subscriptions.push(
		treeView,
		refreshExplorer,
		openReference,
		copyTableName,
		analyzeWorkspace,
		findTableReferences,
		generateDocumentation,
		showDatabaseReport
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

