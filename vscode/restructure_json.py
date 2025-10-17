import json

# Read the original JSON file
input_file = 'data/msdyn/tables_views.json'
output_file = 'data/msdyn/tables_views_restructured.json'

print(f"Reading {input_file}...")
with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Found {len(data)} tables/views")

# Restructure into an array format
tables_array = []

for table_name, table_data in data.items():
    # Create a new object with the table name as a property
    table_obj = {
        "name": table_name,
        "object_type": table_data.get("object_type"),
        "object_owner": table_data.get("object_owner"),
        "columns": table_data.get("columns", []),
        "metadata": table_data.get("metadata", {})
    }
    tables_array.append(table_obj)

# Create the new structure
restructured_data = {
    "tables": tables_array
}

print(f"Writing restructured data to {output_file}...")
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(restructured_data, f, indent=2)

print(f"✓ Successfully restructured {len(tables_array)} items into 'tables' array")
print(f"✓ Output saved to {output_file}")
