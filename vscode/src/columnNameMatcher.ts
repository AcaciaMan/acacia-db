/**
 * Trie-based structure for efficiently finding column names in character arrays.
 * The trie allows fast lookup and matching of column names by traversing character by character.
 */

/**
 * Node in the trie structure.
 * Each node represents a character position in potential column names.
 */
class TrieNode {
    /** Map of next possible characters to their corresponding nodes */
    children: Map<string, TrieNode>;
    
    /** If this node marks the end of a valid column name, store the full name here */
    columnName: string | null;
    
    /** Depth of this node in the trie (0 for root) */
    depth: number;
    
    /** The original character at this node (for case-sensitive matching) */
    originalChar: string | null;

    constructor(depth: number = 0, originalChar: string | null = null) {
        this.children = new Map();
        this.columnName = null;
        this.depth = depth;
        this.originalChar = originalChar;
    }

    /**
     * Check if this node has a child for the given character
     */
    hasChild(char: string): boolean {
        return this.children.has(char.toLowerCase());
    }

    /**
     * Get the child node for the given character
     */
    getChild(char: string): TrieNode | undefined {
        return this.children.get(char.toLowerCase());
    }

    /**
     * Add a child node for the given character
     */
    addChild(char: string): TrieNode {
        const lowerChar = char.toLowerCase();
        if (!this.children.has(lowerChar)) {
            this.children.set(lowerChar, new TrieNode(this.depth + 1, char));
        }
        return this.children.get(lowerChar)!;
    }

    /**
     * Check if this node represents the end of a column name
     */
    isEndOfWord(): boolean {
        return this.columnName !== null;
    }
    
    /**
     * Check if a character matches this node (case-sensitive or insensitive)
     */
    matchesChar(char: string, caseSensitive: boolean): boolean {
        if (caseSensitive) {
            return this.originalChar === char;
        } else {
            return this.originalChar !== null && this.originalChar.toLowerCase() === char.toLowerCase();
        }
    }
}

/**
 * Represents a candidate column name being matched
 */
interface MatchCandidate {
    /** Current node in the trie for this candidate */
    node: TrieNode;
    
    /** Starting index in the character array where this match began */
    startIndex: number;
    
    /** Current index in the character array */
    currentIndex: number;
    
    /** Number of characters matched so far */
    matchedLength: number;
}

/**
 * Result of a column name match
 */
export interface ColumnNameMatch {
    /** The matched column name */
    columnName: string;
    
    /** Starting index in the character array */
    startIndex: number;
    
    /** Ending index in the character array (inclusive) */
    endIndex: number;
    
    /** Length of the match */
    length: number;
}

/**
 * Trie-based column name matcher.
 * Efficiently finds column names in arrays of characters.
 */
export class ColumnNameMatcher {
    private root: TrieNode;
    private columnNames: Set<string>;

    constructor() {
        this.root = new TrieNode(0);
        this.columnNames = new Set();
    }

    /**
     * Add a column name to the matcher
     */
    addColumnName(columnName: string): void {
        if (!columnName || columnName.length === 0) {
            return;
        }

        this.columnNames.add(columnName);
        
        // Store both lowercase version (for case-insensitive) 
        // and original version (for case-sensitive)
        let currentNode = this.root;

        // Build the trie path for this column name
        for (let i = 0; i < columnName.length; i++) {
            const char = columnName[i];
            currentNode = currentNode.addChild(char);
        }

        // Mark the end of this column name
        currentNode.columnName = columnName;
    }

    /**
     * Add multiple column names at once
     */
    addColumnNames(columnNames: string[]): void {
        for (const name of columnNames) {
            this.addColumnName(name);
        }
    }

    /**
     * Find all column names in the given character array.
     * Returns the longest matches, avoiding overlapping results.
     * 
     * @param chars - Array of characters to search through
     * @param caseSensitive - Whether to perform case-sensitive matching (default: false)
     * @returns Array of matches sorted by start index
     */
    findColumnNames(chars: string[], caseSensitive: boolean = false): ColumnNameMatch[] {
        const matches: ColumnNameMatch[] = [];
        let i = 0;

        while (i < chars.length) {
            const match = this.findLongestMatchAt(chars, i, caseSensitive);
            
            if (match) {
                matches.push(match);
                // Move past this match
                i = match.endIndex + 1;
            } else {
                // No match at this position, move to next character
                i++;
            }
        }

        return matches;
    }

    /**
     * Find the longest column name match starting at the given position
     */
    private findLongestMatchAt(chars: string[], startIndex: number, caseSensitive: boolean): ColumnNameMatch | null {
        const startChar = chars[startIndex];
        const searchChar = caseSensitive ? startChar : startChar.toLowerCase();
        
        // Check if any column name can start with this character
        if (!this.root.hasChild(searchChar)) {
            return null;
        }

        let currentNode = this.root.getChild(searchChar)!;
        
        // Verify the node matches the character in case-sensitive mode
        if (caseSensitive && !currentNode.matchesChar(startChar, true)) {
            return null;
        }
        
        let longestMatch: ColumnNameMatch | null = null;
        let i = startIndex;

        // Check if single character is a match
        if (currentNode.isEndOfWord()) {
            longestMatch = {
                columnName: currentNode.columnName!,
                startIndex: startIndex,
                endIndex: i,
                length: 1
            };
        }

        // Try to extend the match as far as possible
        i++;
        while (i < chars.length) {
            const char = chars[i];
            const searchChar = caseSensitive ? char : char.toLowerCase();
            
            if (currentNode.hasChild(searchChar)) {
                const nextNode = currentNode.getChild(searchChar)!;
                
                // In case-sensitive mode, verify the character matches exactly
                if (caseSensitive && !nextNode.matchesChar(char, true)) {
                    break;
                }
                
                currentNode = nextNode;
                
                // If this is a complete column name, record it
                if (currentNode.isEndOfWord()) {
                    longestMatch = {
                        columnName: currentNode.columnName!,
                        startIndex: startIndex,
                        endIndex: i,
                        length: i - startIndex + 1
                    };
                }
                
                i++;
            } else {
                // Can't continue further
                break;
            }
        }

        return longestMatch;
    }

    /**
     * Find column names in a string by converting it to a character array
     */
    findColumnNamesInString(text: string, caseSensitive: boolean = false): ColumnNameMatch[] {
        const chars = text.split('');
        return this.findColumnNames(chars, caseSensitive);
    }

    /**
     * Get all column names stored in this matcher
     */
    getColumnNames(): string[] {
        return Array.from(this.columnNames);
    }

    /**
     * Get the count of column names in this matcher
     */
    getColumnCount(): number {
        return this.columnNames.size;
    }

    /**
     * Clear all column names from the matcher
     */
    clear(): void {
        this.root = new TrieNode(0);
        this.columnNames.clear();
    }

    /**
     * Check if a specific column name exists in the matcher
     */
    hasColumnName(columnName: string): boolean {
        return this.columnNames.has(columnName);
    }

    /**
     * Get statistics about the trie structure
     */
    getStats(): {
        columnCount: number;
        maxDepth: number;
        totalNodes: number;
    } {
        let maxDepth = 0;
        let totalNodes = 0;

        const traverse = (node: TrieNode) => {
            totalNodes++;
            maxDepth = Math.max(maxDepth, node.depth);
            
            for (const child of node.children.values()) {
                traverse(child);
            }
        };

        traverse(this.root);

        return {
            columnCount: this.columnNames.size,
            maxDepth,
            totalNodes
        };
    }
}
