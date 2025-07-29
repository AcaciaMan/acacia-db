import json
from pathlib import Path

# Check if AUDIT is in the tables_views.json
config_path = Path('config/MSDynamics.json')
with open(config_path, 'r') as f:
    config = json.load(f)

tables_path = Path(config['tables_views'])
with open(tables_path, 'r', encoding='utf-8') as f:
    tables_data = json.load(f)

print(f'Total AL tables in metadata: {len(tables_data)}')

# Look for AUDIT in table names
audit_tables = []
for table_name in tables_data.keys():
    if 'AUDIT' in table_name.upper():
        audit_tables.append(table_name)

if audit_tables:
    print(f'Tables containing AUDIT: {audit_tables}')
    for table in audit_tables:
        columns_count = len(tables_data[table].get('columns', []))
        print(f'  {table}: {columns_count} columns')
else:
    print('No tables containing AUDIT found in tables_views.json')

# Check if AUDIT exists as exact table name
if 'AUDIT' in tables_data:
    print('Found exact AUDIT table')
    audit_info = tables_data['AUDIT']
    obj_type = audit_info.get('object_type', 'Unknown')
    columns_count = len(audit_info.get('columns', []))
    print(f'  Type: {obj_type}')
    print(f'  Columns: {columns_count}')
else:
    print('No exact AUDIT table found')
    
# Show first 10 table names as sample
print('\nFirst 10 table names in metadata:')
for i, table_name in enumerate(list(tables_data.keys())[:10]):
    print(f'  {i+1}. {table_name}')
