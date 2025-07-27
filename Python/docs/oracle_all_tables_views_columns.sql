-- Get both tables and views with their columns in one result set
SELECT 
    'TABLE' as object_type,
    t.owner,
    t.table_name as object_name,
    c.column_name,
    c.data_type,
    c.data_length,
    c.data_precision,
    c.data_scale,
    c.nullable,
    c.column_id
FROM 
    all_tables t
    JOIN all_tab_columns c ON t.owner = c.owner AND t.table_name = c.table_name
WHERE 
    t.owner NOT IN ('SYS', 'SYSTEM', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'ORDSYS', 'OUTLN', 'WMSYS', 'XDB')

UNION ALL

SELECT 
    'VIEW' as object_type,
    v.owner,
    v.view_name as object_name,
    c.column_name,
    c.data_type,
    c.data_length,
    c.data_precision,
    c.data_scale,
    c.nullable,
    c.column_id
FROM 
    all_views v
    JOIN all_tab_columns c ON v.owner = c.owner AND v.view_name = c.table_name
WHERE 
    v.owner NOT IN ('SYS', 'SYSTEM', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'ORDSYS', 'OUTLN', 'WMSYS', 'XDB')

ORDER BY 
    owner, object_name, column_id;