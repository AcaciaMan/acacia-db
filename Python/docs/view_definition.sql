-- Get the complete view definition/source code
SELECT 
    owner,
    view_name,
    text_length,
    text as view_source_code
FROM 
    all_views
WHERE 
    owner NOT IN ('SYS', 'SYSTEM', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'ORDSYS', 'OUTLN', 'WMSYS', 'XDB')
ORDER BY 
    owner, view_name;