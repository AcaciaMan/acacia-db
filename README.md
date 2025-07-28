# acacia-db
Scripts for database source code analysis

## Available Python Scripts

### Core SOLR Integration Scripts

#### 1. `tables_views_to_solr.py`
Processes Oracle DB tables/views and finds their mentions in source code using ripgrep.
- Reads configuration from `oracle_db_example_to_solr.json`
- Loads tables/views from specified JSON file
- Uses ripgrep to search for object mentions in source code
- Stores results with context (+- 50 lines) in `data/output` folder

#### 2. `index_to_solr.py`
Transforms ripgrep search results into Solr documents and indexes them.
- Reads search results JSON from `tables_views_to_solr.py`
- Transforms data into Solr-compatible documents
- Indexes documents into Solr for searchable database object references

### Analysis Scripts

#### 3. `analyze_object_relations.py`
Analyzes Oracle DB object relationships through Solr search results.
- Queries Solr for all Oracle database objects
- Loads column information for each object from `tables_views.json`
- Finds relationships between objects based on column name matches
- Calculates relationship strength statistics
- Outputs relationship analysis results

#### 4. `analyze_object_relationship_columns.py`
Analyzes object relationships and their column usage with proximity-based scoring.
- Finds pairs of objects that appear together in the same Solr documents
- Analyzes the first object's columns mentioned in relationship documents
- Uses proximity-based scoring (closer mentions get higher scores)
- Applies weighted scoring: `line_text` & `context_after` = 3x, `context_before` = 1x
- Returns top 3 columns for the first object in each relationship

#### 5. `analyze_relational_columns.py`
Analyzes Oracle DB object columns used in relations with proximity-based weighting.
- Loads object metadata from `tables_views.json`
- For each object, finds documents in Solr where the object appears
- Searches for column mentions in relation to the object
- Applies weighted scoring based on proximity and context
- Returns top columns used in relations for each object

#### 6. `analyze_top_columns.py`
Analyzes Oracle DB objects to find the top 3 most mentioned columns in Solr.
- Loads object metadata from `tables_views.json`
- Queries Solr for all documents containing each object
- Searches for column mentions in `context_before`, `line_text`, and `context_after`
- Applies weighted scoring: `context_before` & `line_text` = 3x, `context_after` = 1x
- Returns top 3 columns for each object based on weighted scores

#### 7. `example_script.py`
Demonstration script showing best practices for the organized folder structure.
- Shows how to import utilities
- Demonstrates configuration loading
- Examples of working with data files
- Sample data usage patterns
