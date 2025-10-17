# Testing the Relationship-Only Filtering Feature

Step-by-step guide to test the new filtering feature and verify file size reduction.

---

## Prerequisites

1. ✅ Extension compiled successfully
2. ✅ Have a `tables_views.json` file with database schema
3. ✅ Have source code to analyze
4. ✅ ripgrep (rg) installed and in PATH

---

## Test Plan

### Test 1: Baseline Analysis (Without Filtering)

**Purpose**: Establish baseline file size and reference count

**Steps**:

1. **Ensure filtering is disabled** (default):
   ```json
   {
     "acaciaDb.filterToRelationshipsOnly": false
   }
   ```

2. **Run analysis**:
   - Press `F5` to launch extension in debug mode
   - Open Activity Bar → Acacia DB
   - Configure tables/views file and source folder
   - Click refresh icon to analyze

3. **Check results**:
   - Open `.vscode/table_refs.json`
   - Note file size (e.g., 48.7 MB)
   - Note total references from summary
   - Check console output

4. **Record baseline**:
   ```
   Without Filtering:
   - File size: _______ MB
   - Total references: _______
   - Tables with refs: _______
   - Relationships detected: _______
   ```

---

### Test 2: Filtered Analysis (With Filtering)

**Purpose**: Test filtering and measure reduction

**Steps**:

1. **Enable filtering**:
   ```json
   {
     "acaciaDb.filterToRelationshipsOnly": true
   }
   ```

2. **Run analysis again**:
   - Click refresh icon in Database Explorer
   - Wait for completion

3. **Check console output**:
   Look for message:
   ```
   Filtered to 15,234 references that are part of relationships
   Analysis results saved (5.2 MB)
   ```

4. **Check results file**:
   - Open `.vscode/table_refs.json`
   - Note new file size
   - Compare with baseline

5. **Record filtered results**:
   ```
   With Filtering:
   - File size: _______ MB
   - Total references: _______
   - Tables with refs: _______
   - Reduction: _______% 
   ```

6. **Calculate reduction**:
   ```
   Size Reduction = (Baseline - Filtered) / Baseline × 100%
   Reference Reduction = (Baseline Refs - Filtered Refs) / Baseline Refs × 100%
   ```

---

### Test 3: Tree View Verification

**Purpose**: Ensure tree view still works correctly with filtered data

**Steps**:

1. **Expand tree view**:
   - Click on a table to expand
   - Verify "Linked Tables" section appears
   - Expand linked tables

2. **Check hierarchy**:
   - Level 1: Tables (✓ visible)
   - Level 2: Linked Tables + Files (✓ visible)
   - Level 3: Individual linked tables (✓ visible)
   - Level 4: Relationship files (✓ visible)
   - Level 5: Proximity instances (✓ visible)
   - Level 6: Clickable lines (✓ visible)

3. **Test navigation**:
   - Click on a line item
   - Verify it navigates to correct file and line
   - Test multiple references

4. **Compare with baseline**:
   - Do you see fewer references per table? (✓ Expected)
   - Are only relationship references shown? (✓ Expected)
   - Do all references have linked tables nearby? (✓ Expected)

---

### Test 4: Edge Cases

#### Edge Case A: No Relationships Detected

**Setup**: Analyze code with no table relationships

**Expected**: Filtering should have no effect (saves all references)

**Steps**:
1. Create test file with isolated table references:
   ```javascript
   // file1.js
   SELECT * FROM USERS
   
   // file2.js (separate file)
   SELECT * FROM ORDERS
   ```

2. Run analysis with filtering enabled
3. Check if all references are saved (not filtered)

**Expected**: Console shows "Filtered to 0 references" or falls back to all references

---

#### Edge Case B: All References Are Relationships

**Setup**: Analyze code where all tables appear together

**Expected**: No reduction in file size

**Steps**:
1. Create test file with all tables in one query:
   ```sql
   SELECT * 
   FROM USERS 
   JOIN ORDERS ON ...
   JOIN PRODUCTS ON ...
   ```

2. Run analysis with filtering enabled
3. Check if all references are saved

**Expected**: 100% of references saved (all are relationships)

---

#### Edge Case C: Toggle Filtering On/Off

**Purpose**: Verify setting changes work without reloading

**Steps**:
1. Run analysis with filtering disabled
2. Note file size
3. Enable filtering in settings
4. Run analysis again (without reloading window)
5. Note file size
6. Disable filtering
7. Run analysis again
8. Verify file size returns to original

**Expected**: Settings apply immediately without restart

---

### Test 5: Performance Test

**Purpose**: Measure performance impact of filtering

**Steps**:

1. **Measure baseline analysis time**:
   - Disable filtering
   - Clear `.vscode/table_refs.json`
   - Run analysis
   - Note time from console

2. **Measure filtered analysis time**:
   - Enable filtering
   - Clear `.vscode/table_refs.json`
   - Run analysis
   - Note time from console

3. **Compare times**:
   ```
   Analysis Time (no filtering): _______ seconds
   Analysis Time (with filtering): _______ seconds
   Overhead: _______ seconds
   ```

4. **Measure load time**:
   - Reload window
   - Note how long tree view takes to populate

**Expected**: 
- Analysis: +0.5-1 second overhead
- Load: -50% faster with smaller file

---

## Verification Checklist

### Functionality
- [ ] Extension compiles successfully
- [ ] Setting appears in VS Code settings
- [ ] Setting default is `false`
- [ ] Filtering can be enabled/disabled
- [ ] Analysis completes successfully with filtering
- [ ] Console shows "Filtered to X references" message
- [ ] File size is dramatically smaller (80-95% reduction)
- [ ] Tree view still displays correctly
- [ ] Line navigation still works
- [ ] Relationships are still detected
- [ ] No crashes or errors

### Data Integrity
- [ ] All saved references are part of relationships
- [ ] No relationship references are lost
- [ ] Tables with no relationship refs are excluded
- [ ] File paths are correct
- [ ] Line numbers are accurate
- [ ] Context strings are preserved

### Performance
- [ ] Analysis completes in reasonable time
- [ ] Filtering overhead is acceptable (<2 seconds)
- [ ] File loads faster
- [ ] Tree view renders faster
- [ ] No memory issues

### User Experience
- [ ] Setting is easy to find
- [ ] Description is clear
- [ ] Console messages are helpful
- [ ] File size reduction is noticeable
- [ ] Documentation is comprehensive

---

## Expected Results

### Small Project (< 10K references)
```
Without Filtering:
- File size: 2 MB
- References: 5,000

With Filtering:
- File size: 0.4 MB (80% reduction)
- References: 1,000 (only relationships)
```

### Medium Project (10K-50K references)
```
Without Filtering:
- File size: 15 MB
- References: 35,000

With Filtering:
- File size: 2 MB (87% reduction)
- References: 4,500 (only relationships)
```

### Large Project (50K-100K references)
```
Without Filtering:
- File size: 35 MB
- References: 75,000

With Filtering:
- File size: 4 MB (89% reduction)
- References: 8,000 (only relationships)
```

### Very Large Project (> 100K references)
```
Without Filtering:
- File size: 50+ MB (may hit limits)
- References: 150,000

With Filtering:
- File size: 5 MB (90% reduction)
- References: 15,000 (only relationships)
```

---

## Troubleshooting Test Issues

### Issue: No file size reduction

**Possible causes**:
1. Filtering not enabled
2. All references are relationships
3. Proximity threshold too high

**Solutions**:
- Verify setting: `"filterToRelationshipsOnly": true`
- Check console for filtered count
- Review proximity threshold

---

### Issue: Console shows "Filtered to 0 references"

**Possible causes**:
1. No relationships detected
2. Proximity threshold too low
3. Tables don't appear near each other

**Solutions**:
- Verify `enableRelationshipDetection` is `true`
- Increase `proximityThreshold` (try 100)
- Check if code actually has multi-table queries

---

### Issue: Tree view is empty after filtering

**Possible causes**:
1. All tables have zero relationship refs
2. Filtering too aggressive

**Solutions**:
- Disable filtering temporarily
- Check if relationships were detected
- Increase proximity threshold

---

### Issue: Performance is slow

**Possible causes**:
1. Very large codebase
2. Many relationships to check

**Solutions**:
- This is expected for first analysis
- Subsequent loads should be fast
- Consider analyzing smaller sections

---

## Report Template

After testing, fill out this report:

```
=== Acacia DB Filtering Test Report ===

Date: _____________
Tester: _____________
Project: _____________

Test Environment:
- VS Code Version: _____________
- Extension Version: 0.0.1
- Tables in Schema: _____________
- Files Analyzed: _____________

Baseline Results (No Filtering):
- File Size: _______ MB
- Total References: _____________
- Tables with Refs: _____________
- Relationships Detected: _____________
- Analysis Time: _______ seconds

Filtered Results (With Filtering):
- File Size: _______ MB
- Total References: _____________
- Tables with Refs: _____________
- Relationships Kept: _____________
- Analysis Time: _______ seconds

Reduction:
- File Size: _______% smaller
- References: _______% fewer

Functionality Tests:
- [ ] Filtering enabled successfully
- [ ] Console shows filtered count
- [ ] File size reduced dramatically
- [ ] Tree view displays correctly
- [ ] Line navigation works
- [ ] No errors or crashes

Performance:
- Analysis overhead: _______ seconds
- Load time improvement: _______% faster

Issues Found:
1. _____________________________________________
2. _____________________________________________
3. _____________________________________________

Recommendations:
_____________________________________________
_____________________________________________
_____________________________________________

Overall Assessment: ☐ Pass  ☐ Fail  ☐ Needs Work

Notes:
_____________________________________________
_____________________________________________
```

---

## Next Steps After Testing

1. **Document Results**: Save test report in project
2. **Adjust Settings**: Fine-tune proximity threshold if needed
3. **Update Docs**: Add real-world examples from testing
4. **Report Issues**: Create GitHub issues for any bugs
5. **Share Findings**: Document expected reductions for different project sizes

---

## Automated Testing (Future)

**TODO**: Add automated tests
- Unit tests for filtering logic
- Integration tests with sample data
- Performance benchmarks
- Regression tests

---

**Ready to test? Press F5 and follow the steps above!** 🚀
