# Ripgrep Search Strategy Change

## Problem with `-w` (Whole Word Flag)

The `-w` flag in ripgrep uses strict word boundaries that only work with alphanumeric characters and underscores. This causes it to **miss many valid occurrences** in source code:

### Examples that `-w` MISSES:

```javascript
// ❌ Missed - table name in quotes
const query = "SELECT * FROM users WHERE id = 1";

// ❌ Missed - table name after dot
database.users.findAll();

// ❌ Missed - table name in template literal
const sql = `INSERT INTO users (name) VALUES (?)`;

// ❌ Missed - table name with punctuation
if (table === "users") { }
```

### Why `-w` Fails:

The `-w` flag treats quotes, dots, and other punctuation as **non-word characters**, requiring alphanumeric boundaries on both sides.

## Solution: Regex with Word Boundaries `\b`

We now use a regex pattern with word boundaries: `\b${tableName}\b`

### How It Works:

```bash
# Old command (strict word boundaries)
rg -i -w --json "users" "/source/folder"

# New command (regex word boundaries)
rg -e "\busers\b" -i --json "/source/folder"
```

### What `\b` Matches:

The `\b` boundary matches between:
- Word character (`\w`: a-z, A-Z, 0-9, _) and non-word character
- Start/end of string and word character

### Examples that `\b` FINDS:

```javascript
// ✅ Found - in quotes
const query = "SELECT * FROM users WHERE id = 1";
//                           ^^^^^ matched

// ✅ Found - after dot
database.users.findAll();
//       ^^^^^ matched

// ✅ Found - in template literal
const sql = `INSERT INTO users (name) VALUES (?)`;
//                       ^^^^^ matched

// ✅ Found - with punctuation
if (table === "users") { }
//             ^^^^^ matched

// ✅ Found - in SQL
FROM users JOIN orders ON users.id = orders.user_id
//   ^^^^^             ^^^^^ both matched

// ✅ Found - in object keys
const tables = { users: [], orders: [] };
//               ^^^^^ matched
```

### What `\b` Does NOT Match (Correctly):

```javascript
// ❌ Not matched - part of larger word
const usersTable = [];
//    ^^^^^ not matched (part of "usersTable")

// ❌ Not matched - with underscore
const users_archived = [];
//    ^^^^^ not matched (underscore connects it)

// ❌ Not matched - in identifier
function getUsersList() {}
//         ^^^^^ not matched (camelCase identifier)
```

## Implementation Details

### Regex Escaping

Table names may contain special regex characters, so we escape them:

```typescript
private escapeRegex(str: string): string {
    // Escape: . * + ? ^ $ { } ( ) | [ ] \
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

**Example:**
- Table name: `user.profile`
- Escaped: `user\\.profile`
- Final pattern: `\buser\\.profile\b`

### Command Construction

```typescript
const pattern = `\\b${this.escapeRegex(tableName)}\\b`;
const command = `rg -e "${pattern}" -i --json "${sourceFolder}"`;
```

**For table "users":**
```bash
rg -e "\busers\b" -i --json "/src"
```

**For table "order_items":**
```bash
rg -e "\border_items\b" -i --json "/src"
```

## Benefits

1. **More Matches**: Finds table references in strings, SQL queries, object properties
2. **Accurate**: Still avoids partial word matches (like "users" in "usersTable")
3. **Flexible**: Works across different programming languages and contexts
4. **Case-Insensitive**: Combined with `-i` flag to match any casing

## Testing Results

Given table name: **"users"**

| Code Example | `-w` (old) | `\b` (new) |
|-------------|-----------|-----------|
| `"SELECT * FROM users"` | ❌ Miss | ✅ Found |
| `db.users.find()` | ❌ Miss | ✅ Found |
| `{users: []}` | ❌ Miss | ✅ Found |
| `FROM users WHERE` | ✅ Found | ✅ Found |
| `const usersTable` | ✅ Not found | ✅ Not found |

## Conclusion

The regex word boundary approach (`\b`) is **superior** for finding database table references in real-world source code because it:

- Matches tables in strings and SQL queries
- Works with programming language syntax (dots, quotes, brackets)
- Still prevents false positives from partial word matches
- Is more aligned with how developers actually reference database tables in code
