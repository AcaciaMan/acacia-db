# Solr Core Configuration for Oracle DB Search Results

This document provides instructions for setting up a Solr core to store Oracle database object search results.

## Prerequisites

1. Apache Solr 8.x or 9.x installed
2. Solr server running on http://localhost:8983 (default)

## Core Setup Instructions

### 1. Create the Core
```bash
# Navigate to Solr installation directory
cd $SOLR_HOME

# Create new core
bin/solr create -c oracle_db_search
```

### 2. Deploy Schema
Copy the `config/solr_schema.xml` to your Solr core configuration:

```bash
# Copy schema to core config directory
cp config/solr_schema.xml $SOLR_HOME/server/solr/oracle_db_search/conf/managed-schema

# Restart Solr or reload core
bin/solr restart
# OR
curl "http://localhost:8983/solr/admin/cores?action=RELOAD&core=oracle_db_search"
```

### 3. Alternative: Use Solr Admin UI
1. Open http://localhost:8983/solr/#/
2. Go to Core Admin
3. Click "Add Core"
4. Set name: `oracle_db_search`
5. Copy the schema content to managed-schema file

## Configuration Properties

Create a `solrconfig.xml` if customization is needed:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<config>
  <luceneMatchVersion>8.11.0</luceneMatchVersion>
  
  <dataDir>${solr.data.dir:}</dataDir>
  
  <directoryFactory name="DirectoryFactory" 
                    class="${solr.directoryFactory:solr.NRTCachingDirectoryFactory}"/>
  
  <codecFactory class="solr.SchemaCodecFactory"/>
  
  <indexConfig>
    <lockType>${solr.lock.type:native}</lockType>
    <infoStream>true</infoStream>
  </indexConfig>
  
  <jmx />
  
  <updateHandler class="solr.DirectUpdateHandler2">
    <updateLog>
      <str name="dir">${solr.ulog.dir:}</str>
      <int name="numVersionBuckets">${solr.ulog.numVersionBuckets:65536}</int>
    </updateLog>
    
    <autoCommit>
      <maxTime>${solr.autoCommit.maxTime:15000}</maxTime>
      <openSearcher>false</openSearcher>
    </autoCommit>
    
    <autoSoftCommit>
      <maxTime>${solr.autoSoftCommit.maxTime:1000}</maxTime>
    </autoSoftCommit>
  </updateHandler>
  
  <query>
    <maxBooleanClauses>1024</maxBooleanClauses>
    <filterCache class="solr.FastLRUCache"
                 size="512"
                 initialSize="512"
                 autowarmCount="0"/>
    
    <queryResultCache class="solr.LRUCache"
                     size="512"
                     initialSize="512"
                     autowarmCount="0"/>
    
    <documentCache class="solr.LRUCache"
                   size="512"
                   initialSize="512"
                   autowarmCount="0"/>
    
    <enableLazyFieldLoading>true</enableLazyFieldLoading>
    <queryResultWindowSize>20</queryResultWindowSize>
    <queryResultMaxDocsCached>200</queryResultMaxDocsCached>
    
    <listener event="newSearcher" class="solr.QuerySenderListener">
      <arr name="queries">
        <lst><str name="q">*:*</str></lst>
      </arr>
    </listener>
    
    <listener event="firstSearcher" class="solr.QuerySenderListener">
      <arr name="queries">
        <lst><str name="q">*:*</str></lst>
      </arr>
    </listener>
    
    <useColdSearcher>false</useColdSearcher>
    <maxWarmingSearchers>2</maxWarmingSearchers>
  </query>
  
  <requestDispatcher handleSelect="false">
    <requestParsers enableRemoteStreaming="true" 
                    multipartUploadLimitInKB="2048000"
                    formdataUploadLimitInKB="2048"
                    addHttpRequestToContext="false"/>
    
    <httpCaching never304="true"/>
  </requestDispatcher>
  
  <requestHandler name="/select" class="solr.SearchHandler">
    <lst name="defaults">
      <str name="echoParams">explicit</str>
      <int name="rows">10</int>
      <str name="df">all_text</str>
    </lst>
  </requestHandler>
  
  <requestHandler name="/query" class="solr.SearchHandler">
    <lst name="defaults">
      <str name="echoParams">explicit</str>
      <str name="wt">json</str>
      <str name="indent">true</str>
      <str name="df">all_text</str>
    </lst>
  </requestHandler>
  
  <requestHandler name="/update" class="solr.UpdateRequestHandler"/>
  
  <requestHandler name="/admin/" class="solr.admin.AdminHandlers"/>
  
  <requestHandler name="/admin/ping" class="solr.PingRequestHandler">
    <lst name="invariants">
      <str name="q">*:*</str>
    </lst>
    <lst name="defaults">
      <str name="echoParams">all</str>
    </lst>
  </requestHandler>
  
  <admin>
    <defaultQuery>*:*</defaultQuery>
  </admin>
</config>
```

## Usage Instructions

### 1. Index Data
```bash
# Run the indexing script
python src/scripts/index_to_solr.py --config oracle_db_example_to_solr --clear
```

### 2. Verify Indexing
```bash
# Check document count
curl "http://localhost:8983/solr/oracle_db_search/select?q=*:*&rows=0"

# Get facets
curl "http://localhost:8983/solr/oracle_db_search/select?q=*:*&rows=0&facet=true&facet.field=object_name"
```

### 3. Sample Searches
```bash
# Find specific object
curl "http://localhost:8983/solr/oracle_db_search/select?q=object_name:EMPLOYEES"

# Search in code
curl "http://localhost:8983/solr/oracle_db_search/select?q=line_text:SELECT"

# Get statistics
curl "http://localhost:8983/solr/oracle_db_search/select?q=*:*&stats=true&stats.field=total_matches"
```

## Optimization Tips

### 1. Memory Settings
For large datasets, adjust JVM memory:
```bash
export SOLR_HEAP="2g"
bin/solr start
```

### 2. Index Optimization
Optimize index after bulk loading:
```bash
curl "http://localhost:8983/solr/oracle_db_search/update?optimize=true"
```

### 3. Core Monitoring
Monitor core status:
```bash
curl "http://localhost:8983/solr/admin/cores?action=STATUS&core=oracle_db_search"
```

## Troubleshooting

### Common Issues

1. **Schema conflicts**: Delete and recreate core if schema changes
2. **Memory issues**: Increase heap size for large datasets
3. **Connection refused**: Ensure Solr is running on correct port
4. **Indexing failures**: Check field types match data types

### Debug Commands
```bash
# Check core status
curl "http://localhost:8983/solr/admin/cores?action=STATUS"

# Check schema
curl "http://localhost:8983/solr/oracle_db_search/schema"

# Check field types
curl "http://localhost:8983/solr/oracle_db_search/schema/fields"
```
