"use strict";
/**
 * Example usage of ColumnNameMatcher with DatabaseAnalyzer
 *
 * This demonstrates how to use the Trie-based column name matcher
 * to efficiently find column references in code files.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.basicExample = basicExample;
exports.overlappingNamesExample = overlappingNamesExample;
exports.characterArrayExample = characterArrayExample;
exports.caseSensitivityExample = caseSensitivityExample;
exports.databaseScenarioExample = databaseScenarioExample;
exports.performanceExample = performanceExample;
exports.fileAnalysisExample = fileAnalysisExample;
exports.runAllExamples = runAllExamples;
const columnNameMatcher_1 = require("../src/columnNameMatcher");
// Example 1: Basic usage
function basicExample() {
    console.log('=== Basic Usage Example ===\n');
    const matcher = new columnNameMatcher_1.ColumnNameMatcher();
    // Add column names from a database schema
    const columns = [
        'user_id',
        'username',
        'email',
        'created_at',
        'updated_at',
        'is_active'
    ];
    matcher.addColumnNames(columns);
    // Search in a SQL query
    const sql = 'SELECT user_id, username, email FROM users WHERE is_active = 1';
    const matches = matcher.findColumnNamesInString(sql);
    console.log(`Found ${matches.length} column references:`);
    matches.forEach(match => {
        console.log(`  - ${match.columnName} at position ${match.startIndex}-${match.endIndex}`);
    });
    console.log();
}
// Example 2: Handling nested/overlapping column names
function overlappingNamesExample() {
    console.log('=== Overlapping Names Example ===\n');
    const matcher = new columnNameMatcher_1.ColumnNameMatcher();
    // Some columns are prefixes of others
    matcher.addColumnNames([
        'order',
        'order_id',
        'order_item',
        'order_item_id',
        'order_total'
    ]);
    const code = 'const order_item_id = getOrderItemId(order_id);';
    const matches = matcher.findColumnNamesInString(code);
    console.log('Code:', code);
    console.log(`\nMatches (longest preference):`);
    matches.forEach(match => {
        console.log(`  - "${match.columnName}" (${match.length} chars) at [${match.startIndex}:${match.endIndex}]`);
    });
    console.log();
}
// Example 3: Working with character arrays
function characterArrayExample() {
    console.log('=== Character Array Example ===\n');
    const matcher = new columnNameMatcher_1.ColumnNameMatcher();
    matcher.addColumnNames(['id', 'name', 'value', 'timestamp']);
    // Simulate reading characters one by one from a stream
    const charStream = 'id:123,name:"test",value:456,timestamp:now()'.split('');
    const matches = matcher.findColumnNames(charStream);
    console.log('Character stream:', charStream.join(''));
    console.log(`\nFound ${matches.length} column names:`);
    matches.forEach(match => {
        const chars = charStream.slice(match.startIndex, match.endIndex + 1).join('');
        console.log(`  - "${match.columnName}" -> "${chars}" at position ${match.startIndex}`);
    });
    console.log();
}
// Example 4: Case sensitivity options
function caseSensitivityExample() {
    console.log('=== Case Sensitivity Example ===\n');
    const matcher = new columnNameMatcher_1.ColumnNameMatcher();
    matcher.addColumnName('CustomerId');
    const text1 = 'WHERE CustomerId = 1';
    const text2 = 'WHERE customerid = 1';
    // Case insensitive (default)
    console.log('Case insensitive matching:');
    console.log(`  "${text1}" -> ${matcher.findColumnNamesInString(text1, false).length} matches`);
    console.log(`  "${text2}" -> ${matcher.findColumnNamesInString(text2, false).length} matches`);
    // Case sensitive
    console.log('\nCase sensitive matching:');
    console.log(`  "${text1}" -> ${matcher.findColumnNamesInString(text1, true).length} matches`);
    console.log(`  "${text2}" -> ${matcher.findColumnNamesInString(text2, true).length} matches`);
    console.log();
}
// Example 5: Real-world database scenario
function databaseScenarioExample() {
    console.log('=== Database Schema Scenario ===\n');
    const matcher = new columnNameMatcher_1.ColumnNameMatcher();
    // Simulate loading column names from multiple tables
    const userColumns = ['user_id', 'username', 'email', 'password_hash'];
    const orderColumns = ['order_id', 'user_id', 'order_date', 'total_amount'];
    const productColumns = ['product_id', 'product_name', 'price', 'stock_quantity'];
    matcher.addColumnNames([...userColumns, ...orderColumns, ...productColumns]);
    console.log(`Loaded ${matcher.getColumnCount()} column names from 3 tables`);
    // Analyze a complex query
    const complexQuery = `
        SELECT 
            u.user_id,
            u.username,
            u.email,
            o.order_id,
            o.order_date,
            o.total_amount,
            p.product_id,
            p.product_name,
            p.price
        FROM users u
        JOIN orders o ON u.user_id = o.user_id
        JOIN order_products op ON o.order_id = op.order_id
        JOIN products p ON op.product_id = p.product_id
        WHERE u.user_id = 123
        ORDER BY o.order_date DESC
    `;
    const matches = matcher.findColumnNamesInString(complexQuery);
    console.log(`\nFound ${matches.length} column references in query`);
    // Count references per column
    const refCounts = new Map();
    matches.forEach(match => {
        refCounts.set(match.columnName, (refCounts.get(match.columnName) || 0) + 1);
    });
    console.log('\nColumn reference counts:');
    Array.from(refCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([col, count]) => {
        console.log(`  ${col}: ${count} time(s)`);
    });
    console.log();
}
// Example 6: Performance statistics
function performanceExample() {
    console.log('=== Performance Statistics ===\n');
    const matcher = new columnNameMatcher_1.ColumnNameMatcher();
    // Add a realistic number of columns
    const columns = [];
    for (let i = 0; i < 500; i++) {
        columns.push(`column_${i}`);
    }
    const startAdd = Date.now();
    matcher.addColumnNames(columns);
    const addTime = Date.now() - startAdd;
    console.log(`Added ${columns.length} columns in ${addTime}ms`);
    // Get trie statistics
    const stats = matcher.getStats();
    console.log(`\nTrie statistics:`);
    console.log(`  Total columns: ${stats.columnCount}`);
    console.log(`  Max depth: ${stats.maxDepth}`);
    console.log(`  Total nodes: ${stats.totalNodes}`);
    console.log(`  Avg nodes per column: ${(stats.totalNodes / stats.columnCount).toFixed(2)}`);
    // Benchmark search performance
    const largeText = columns.map(c => `SELECT ${c} FROM table`).join(' ');
    const startSearch = Date.now();
    const matches = matcher.findColumnNamesInString(largeText);
    const searchTime = Date.now() - startSearch;
    console.log(`\nSearch performance:`);
    console.log(`  Text length: ${largeText.length} characters`);
    console.log(`  Matches found: ${matches.length}`);
    console.log(`  Search time: ${searchTime}ms`);
    console.log(`  Speed: ${(largeText.length / searchTime).toFixed(0)} chars/ms`);
    console.log();
}
// Example 7: Integration with file analysis
function fileAnalysisExample() {
    console.log('=== File Analysis Integration ===\n');
    const matcher = new columnNameMatcher_1.ColumnNameMatcher();
    // Load columns from a schema
    matcher.addColumnNames([
        'customer_id', 'customer_name', 'customer_email',
        'invoice_id', 'invoice_date', 'invoice_amount',
        'payment_id', 'payment_method', 'payment_status'
    ]);
    // Simulate analyzing a TypeScript file
    const typescriptCode = `
        interface Customer {
            customer_id: number;
            customer_name: string;
            customer_email: string;
        }
        
        function getInvoice(invoice_id: number) {
            return db.query(
                'SELECT invoice_id, invoice_date, invoice_amount FROM invoices WHERE invoice_id = ?',
                [invoice_id]
            );
        }
        
        const payment = {
            payment_id: 123,
            payment_method: 'credit_card',
            payment_status: 'completed'
        };
    `;
    const matches = matcher.findColumnNamesInString(typescriptCode);
    console.log(`Analyzed TypeScript file (${typescriptCode.length} chars)`);
    console.log(`Found ${matches.length} column references:\n`);
    // Group by line
    const lines = typescriptCode.split('\n');
    const matchesByLine = new Map();
    matches.forEach(match => {
        let currentPos = 0;
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const lineEnd = currentPos + lines[lineNum].length;
            if (match.startIndex >= currentPos && match.startIndex <= lineEnd) {
                if (!matchesByLine.has(lineNum + 1)) {
                    matchesByLine.set(lineNum + 1, []);
                }
                matchesByLine.get(lineNum + 1).push(match.columnName);
                break;
            }
            currentPos = lineEnd + 1; // +1 for newline
        }
    });
    matchesByLine.forEach((cols, lineNum) => {
        const line = lines[lineNum - 1].trim();
        console.log(`Line ${lineNum}: [${cols.join(', ')}]`);
        console.log(`  ${line}`);
        console.log();
    });
}
// Run all examples
function runAllExamples() {
    console.log('\n' + '='.repeat(60));
    console.log('Column Name Matcher - Usage Examples');
    console.log('='.repeat(60) + '\n');
    basicExample();
    overlappingNamesExample();
    characterArrayExample();
    caseSensitivityExample();
    databaseScenarioExample();
    performanceExample();
    fileAnalysisExample();
    console.log('='.repeat(60));
    console.log('All examples completed!');
    console.log('='.repeat(60) + '\n');
}
// Run if executed directly
if (require.main === module) {
    runAllExamples();
}
//# sourceMappingURL=column-name-matcher-usage.js.map