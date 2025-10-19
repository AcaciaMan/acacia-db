import * as assert from 'assert';
import { ColumnNameMatcher, ColumnNameMatch } from '../columnNameMatcher';

suite('ColumnNameMatcher Test Suite', () => {
    let matcher: ColumnNameMatcher;

    setup(() => {
        matcher = new ColumnNameMatcher();
    });

    test('Should add single column name', () => {
        matcher.addColumnName('user_id');
        assert.strictEqual(matcher.getColumnCount(), 1);
        assert.strictEqual(matcher.hasColumnName('user_id'), true);
    });

    test('Should add multiple column names', () => {
        const columns = ['user_id', 'email', 'created_at', 'updated_at'];
        matcher.addColumnNames(columns);
        
        assert.strictEqual(matcher.getColumnCount(), 4);
        columns.forEach(col => {
            assert.strictEqual(matcher.hasColumnName(col), true);
        });
    });

    test('Should find single column name in character array', () => {
        matcher.addColumnName('user_id');
        
        const chars = 'SELECT user_id FROM users'.split('');
        const matches = matcher.findColumnNames(chars);
        
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].columnName, 'user_id');
        assert.strictEqual(matches[0].startIndex, 7);
        assert.strictEqual(matches[0].endIndex, 13);
        assert.strictEqual(matches[0].length, 7);
    });

    test('Should find multiple column names in character array', () => {
        matcher.addColumnNames(['user_id', 'email', 'name']);
        
        const chars = 'SELECT user_id, email, name FROM users'.split('');
        const matches = matcher.findColumnNames(chars);
        
        assert.strictEqual(matches.length, 3);
        assert.strictEqual(matches[0].columnName, 'user_id');
        assert.strictEqual(matches[1].columnName, 'email');
        assert.strictEqual(matches[2].columnName, 'name');
    });

    test('Should find column name in string', () => {
        matcher.addColumnName('customer_id');
        
        const text = 'WHERE customer_id = 123';
        const matches = matcher.findColumnNamesInString(text);
        
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].columnName, 'customer_id');
    });

    test('Should prefer longest match', () => {
        // Add both 'user' and 'user_id'
        matcher.addColumnNames(['user', 'user_id', 'user_id_foreign']);
        
        const chars = 'SELECT user_id_foreign FROM table'.split('');
        const matches = matcher.findColumnNames(chars);
        
        // Should match the longest one: 'user_id_foreign'
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].columnName, 'user_id_foreign');
        assert.strictEqual(matches[0].length, 15); // "user_id_foreign" is 15 characters
    });

    test('Should handle overlapping matches by choosing longest', () => {
        matcher.addColumnNames(['order', 'order_id', 'order_item']);
        
        const chars = 'order_item'.split('');
        const matches = matcher.findColumnNames(chars);
        
        // Should match 'order_item', not 'order'
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].columnName, 'order_item');
    });

    test('Should handle case insensitive matching by default', () => {
        matcher.addColumnName('UserId');
        
        const chars = 'SELECT userid FROM table'.split('');
        const matches = matcher.findColumnNames(chars);
        
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].columnName, 'UserId');
    });

    test('Should handle case sensitive matching when specified', () => {
        matcher.addColumnName('UserId');
        
        // Case insensitive (default)
        let chars = 'SELECT userid FROM table'.split('');
        let matches = matcher.findColumnNames(chars, false);
        assert.strictEqual(matches.length, 1);
        
        // Case sensitive - should not match
        chars = 'SELECT userid FROM table'.split('');
        matches = matcher.findColumnNames(chars, true);
        assert.strictEqual(matches.length, 0);
        
        // Case sensitive - should match
        chars = 'SELECT UserId FROM table'.split('');
        matches = matcher.findColumnNames(chars, true);
        assert.strictEqual(matches.length, 1);
    });

    test('Should find column names separated by various characters', () => {
        matcher.addColumnNames(['id', 'name', 'age', 'email']);
        
        const text = 'id,name;age:email|id name';
        const matches = matcher.findColumnNamesInString(text);
        
        // Should find: id, name, age, email, id, name
        assert.strictEqual(matches.length, 6);
    });

    test('Should handle adjacent column names', () => {
        matcher.addColumnNames(['abc', 'def', 'abcdef']);
        
        // 'abcdef' should be matched as a single longest match
        const chars = 'abcdef'.split('');
        const matches = matcher.findColumnNames(chars);
        
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].columnName, 'abcdef');
    });

    test('Should handle no matches', () => {
        matcher.addColumnNames(['user_id', 'email']);
        
        const chars = 'SELECT * FROM table WHERE x = y'.split('');
        const matches = matcher.findColumnNames(chars);
        
        assert.strictEqual(matches.length, 0);
    });

    test('Should handle empty input', () => {
        matcher.addColumnName('test');
        
        const matches = matcher.findColumnNames([]);
        assert.strictEqual(matches.length, 0);
    });

    test('Should handle empty column names list', () => {
        const chars = 'SELECT * FROM table'.split('');
        const matches = matcher.findColumnNames(chars);
        
        assert.strictEqual(matches.length, 0);
    });

    test('Should provide correct statistics', () => {
        matcher.addColumnNames(['a', 'ab', 'abc', 'abd']);
        
        const stats = matcher.getStats();
        
        assert.strictEqual(stats.columnCount, 4);
        assert.strictEqual(stats.maxDepth, 3); // 'abc' and 'abd' have depth 3
        assert.ok(stats.totalNodes > 0);
    });

    test('Should clear all column names', () => {
        matcher.addColumnNames(['user_id', 'email', 'name']);
        assert.strictEqual(matcher.getColumnCount(), 3);
        
        matcher.clear();
        
        assert.strictEqual(matcher.getColumnCount(), 0);
        assert.strictEqual(matcher.hasColumnName('user_id'), false);
    });

    test('Should find complex real-world example', () => {
        // Simulate database column names
        const columns = [
            'customer_id',
            'customer_name',
            'customer_email',
            'order_id',
            'order_date',
            'order_total',
            'product_id',
            'product_name',
            'quantity',
            'price'
        ];
        
        matcher.addColumnNames(columns);
        
        const sql = `
            SELECT 
                c.customer_id,
                c.customer_name,
                c.customer_email,
                o.order_id,
                o.order_date,
                o.order_total,
                p.product_id,
                p.product_name,
                oi.quantity,
                oi.price
            FROM customers c
            JOIN orders o ON c.customer_id = o.customer_id
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN products p ON oi.product_id = p.product_id
        `;
        
        const matches = matcher.findColumnNamesInString(sql);
        
        // Should find multiple occurrences of various column names
        assert.ok(matches.length > 10);
        
        // Verify some specific matches
        const columnNamesFound = matches.map(m => m.columnName);
        assert.ok(columnNamesFound.includes('customer_id'));
        assert.ok(columnNamesFound.includes('order_id'));
        assert.ok(columnNamesFound.includes('product_id'));
    });

    test('Should handle single character column names', () => {
        matcher.addColumnNames(['a', 'b', 'x', 'y']);
        
        const chars = 'a + b = x * y'.split('');
        const matches = matcher.findColumnNames(chars);
        
        assert.strictEqual(matches.length, 4);
        assert.strictEqual(matches[0].columnName, 'a');
        assert.strictEqual(matches[1].columnName, 'b');
        assert.strictEqual(matches[2].columnName, 'x');
        assert.strictEqual(matches[3].columnName, 'y');
    });

    test('Should handle column names with underscores and numbers', () => {
        matcher.addColumnNames([
            'user_id_1',
            'user_id_2',
            'item_99',
            'test_column_123_abc'
        ]);
        
        const text = 'user_id_1, user_id_2, item_99, test_column_123_abc';
        const matches = matcher.findColumnNamesInString(text);
        
        assert.strictEqual(matches.length, 4);
        assert.strictEqual(matches[3].columnName, 'test_column_123_abc');
    });

    test('Should avoid overlapping matches', () => {
        matcher.addColumnNames(['user', 'user_id']);
        
        // 'user_id' should be matched as one long match, not 'user' separately
        const chars = 'user_id'.split('');
        const matches = matcher.findColumnNames(chars);
        
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].columnName, 'user_id');
        assert.strictEqual(matches[0].startIndex, 0);
        assert.strictEqual(matches[0].endIndex, 6);
    });

    test('Should respect word boundaries - not match partial words', () => {
        matcher.addColumnNames(['id', 'name', 'user']);
        
        // Should NOT match 'id' in 'field', 'name' in 'filename', 'user' in 'username'
        const text1 = 'field = 123';
        const matches1 = matcher.findColumnNamesInString(text1);
        assert.strictEqual(matches1.length, 0, 'Should not match "id" inside "field"');
        
        const text2 = 'filename = "test.txt"';
        const matches2 = matcher.findColumnNamesInString(text2);
        assert.strictEqual(matches2.length, 0, 'Should not match "name" inside "filename"');
        
        const text3 = 'username = "john"';
        const matches3 = matcher.findColumnNamesInString(text3);
        assert.strictEqual(matches3.length, 0, 'Should not match "user" inside "username"');
    });

    test('Should match at word boundaries', () => {
        matcher.addColumnNames(['id', 'name', 'status']);
        
        // Should match when surrounded by non-word characters
        const text = 'WHERE id = 123 AND name = "test" OR (status IN [1,2])';
        const matches = matcher.findColumnNamesInString(text);
        
        assert.strictEqual(matches.length, 3);
        assert.strictEqual(matches[0].columnName, 'id');
        assert.strictEqual(matches[1].columnName, 'name');
        assert.strictEqual(matches[2].columnName, 'status');
    });

    test('Should match at start and end of string', () => {
        matcher.addColumnNames(['id', 'name']);
        
        const text1 = 'id';
        const matches1 = matcher.findColumnNamesInString(text1);
        assert.strictEqual(matches1.length, 1);
        assert.strictEqual(matches1[0].columnName, 'id');
        
        const text2 = 'name';
        const matches2 = matcher.findColumnNamesInString(text2);
        assert.strictEqual(matches2.length, 1);
        assert.strictEqual(matches2[0].columnName, 'name');
    });

    test('Should handle underscores as word characters', () => {
        matcher.addColumnNames(['user', 'id']);
        
        // Should NOT match 'user' or 'id' separately in 'user_id' (underscores are word chars)
        const text = 'user_id = 123';
        const matches = matcher.findColumnNamesInString(text);
        
        // Should find nothing because 'user' and 'id' are part of 'user_id'
        assert.strictEqual(matches.length, 0);
    });

    test('Word boundary with punctuation and operators', () => {
        matcher.addColumnNames(['price', 'quantity', 'total']);
        
        const text = 'price * quantity = total';
        const matches = matcher.findColumnNamesInString(text);
        
        assert.strictEqual(matches.length, 3);
        assert.strictEqual(matches[0].columnName, 'price');
        assert.strictEqual(matches[1].columnName, 'quantity');
        assert.strictEqual(matches[2].columnName, 'total');
    });

    test('Performance test with many column names', () => {
        // Add a large number of column names
        const columns: string[] = [];
        for (let i = 0; i < 1000; i++) {
            columns.push(`column_${i}`);
            columns.push(`field_${i}`);
            columns.push(`attr_${i}`);
        }
        
        const startAdd = Date.now();
        matcher.addColumnNames(columns);
        const addTime = Date.now() - startAdd;
        
        console.log(`Added ${columns.length} columns in ${addTime}ms`);
        assert.ok(addTime < 1000, 'Adding columns should be fast');
        
        // Search in a large text
        const text = 'SELECT column_500, field_750, attr_999 FROM table WHERE column_100 = field_200';
        
        const startSearch = Date.now();
        const matches = matcher.findColumnNamesInString(text);
        const searchTime = Date.now() - startSearch;
        
        console.log(`Searched ${text.length} characters in ${searchTime}ms, found ${matches.length} matches`);
        assert.strictEqual(matches.length, 5);
        assert.ok(searchTime < 100, 'Search should be fast');
    });
});
