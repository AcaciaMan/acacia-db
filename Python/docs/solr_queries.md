# Solr Queries for Oracle DB Search Results

This document provides example Solr queries to search the indexed Oracle database object mentions found in source code.

## Basic Queries

### 1. Find all documents
```
http://localhost:8983/solr/oracle_db_search/select?q=*:*
```

### 2. Find specific Oracle object mentions
```
http://localhost:8983/solr/oracle_db_search/select?q=object_name:EMPLOYEES
```

### 3. Find objects in specific files
```
http://localhost:8983/solr/oracle_db_search/select?q=file_name:*.sql
```

### 4. Find matches in specific programming languages
```
http://localhost:8983/solr/oracle_db_search/select?q=file_extension:java
```

## Advanced Queries

### 5. Find objects with high match counts
```
http://localhost:8983/solr/oracle_db_search/select?q=total_matches:[10 TO *]&sort=total_matches desc
```

### 6. Search in source code content
```
http://localhost:8983/solr/oracle_db_search/select?q=line_text:"SELECT * FROM"
```

### 7. Find objects by owner/schema
```
http://localhost:8983/solr/oracle_db_search/select?q=object_owner:HR
```

### 8. Boolean search for multiple objects
```
http://localhost:8983/solr/oracle_db_search/select?q=object_name:(EMPLOYEES OR DEPARTMENTS)
```

### 9. Find objects in specific file paths
```
http://localhost:8983/solr/oracle_db_search/select?q=file_path:*/dao/*
```

### 10. Find objects with errors
```
http://localhost:8983/solr/oracle_db_search/select?q=has_error:true
```

## Faceted Search

### 11. Facet by object type
```
http://localhost:8983/solr/oracle_db_search/select?q=*:*&facet=true&facet.field=object_type
```

### 12. Facet by file extension
```
http://localhost:8983/solr/oracle_db_search/select?q=*:*&facet=true&facet.field=file_extension
```

### 13. Facet by object owner
```
http://localhost:8983/solr/oracle_db_search/select?q=*:*&facet=true&facet.field=object_owner
```

## Range Queries

### 14. Find matches in specific line ranges
```
http://localhost:8983/solr/oracle_db_search/select?q=line_number:[100 TO 200]
```

### 15. Find recent searches
```
http://localhost:8983/solr/oracle_db_search/select?q=search_timestamp:[NOW-1DAY TO NOW]
```

## Full-Text Search

### 16. Search all text content
```
http://localhost:8983/solr/oracle_db_search/select?q=all_text:"database connection"
```

### 17. Search code content specifically
```
http://localhost:8983/solr/oracle_db_search/select?q=code_content:"WHERE employee_id"
```

## Grouping and Statistics

### 18. Group by object name
```
http://localhost:8983/solr/oracle_db_search/select?q=*:*&group=true&group.field=object_name
```

### 19. Statistics on match counts
```
http://localhost:8983/solr/oracle_db_search/select?q=*:*&stats=true&stats.field=total_matches
```

### 20. Most frequently found objects
```
http://localhost:8983/solr/oracle_db_search/select?q=found:true&facet=true&facet.field=object_name&facet.sort=count&facet.limit=10
```

## Complex Queries

### 21. Find Java files with database table mentions
```
http://localhost:8983/solr/oracle_db_search/select?q=file_extension:java AND object_type:TABLE
```

### 22. Find SQL files mentioning specific schema objects
```
http://localhost:8983/solr/oracle_db_search/select?q=file_extension:sql AND object_owner:HR
```

### 23. Find objects mentioned in multiple files
```
http://localhost:8983/solr/oracle_db_search/select?q=total_files:[2 TO *]&sort=total_files desc
```

### 24. Search with highlighting
```
http://localhost:8983/solr/oracle_db_search/select?q=line_text:SELECT&hl=true&hl.fl=line_text
```

### 25. Find objects with context
```
http://localhost:8983/solr/oracle_db_search/select?q=object_name:EMPLOYEES&fl=object_name,file_path,line_number,line_text,context_before,context_after
```

## Export Queries

### 26. Export to CSV
```
http://localhost:8983/solr/oracle_db_search/select?q=*:*&wt=csv&fl=object_name,file_path,line_number,line_text
```

### 27. Export to JSON
```
http://localhost:8983/solr/oracle_db_search/select?q=*:*&wt=json&fl=object_name,file_path,line_number,total_matches
```

## Curl Examples

### 28. Command line search
```bash
curl "http://localhost:8983/solr/oracle_db_search/select?q=object_name:EMPLOYEES&wt=json"
```

### 29. POST query with complex parameters
```bash
curl -X POST "http://localhost:8983/solr/oracle_db_search/select" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "q=object_type:TABLE&facet=true&facet.field=object_owner&wt=json"
```

### 30. Search with filters
```bash
curl "http://localhost:8983/solr/oracle_db_search/select?q=*:*&fq=found:true&fq=file_extension:java&wt=json"
```
