import requests

# Query for documents that mention both EMPLOYEES and SALARY
response = requests.get('http://localhost:8983/solr/oracle_db_search/select', params={
    'q': 'object_name:"EMPLOYEES" AND (line_text:SALARY OR context_before:SALARY OR context_after:SALARY)',
    'rows': 3,
    'fl': 'id,object_name,line_text,context_before,context_after',
    'wt': 'json'
})

data = response.json()
docs = data['response']['docs']

print(f'Found {len(docs)} documents with both EMPLOYEES and SALARY')
for i, doc in enumerate(docs[:2]):
    print(f'\n--- Document {i+1} ---')
    print(f'Line text: {doc.get("line_text", "")}')
    print(f'Context before: {doc.get("context_before", [])}')
    print(f'Context after: {doc.get("context_after", [])}')
    
    # Check for both terms in each field
    line_text = doc.get('line_text', '')
    has_employees_line = 'EMPLOYEES' in line_text.upper()
    has_salary_line = 'SALARY' in line_text.upper()
    
    context_before = ' '.join(doc.get('context_before', []))
    has_employees_before = 'EMPLOYEES' in context_before.upper()
    has_salary_before = 'SALARY' in context_before.upper()
    
    context_after = ' '.join(doc.get('context_after', []))
    has_employees_after = 'EMPLOYEES' in context_after.upper()
    has_salary_after = 'SALARY' in context_after.upper()
    
    print(f'Line text: EMPLOYEES={has_employees_line}, SALARY={has_salary_line}')
    print(f'Context before: EMPLOYEES={has_employees_before}, SALARY={has_salary_before}')
    print(f'Context after: EMPLOYEES={has_employees_after}, SALARY={has_salary_after}')
