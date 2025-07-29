import requests

# Test searching for 'Audit' instead of 'AUDIT'
solr_url = 'http://localhost:8983/solr/MSDyn'

response = requests.get(f'{solr_url}/select', params={
    'q': 'object_name:"Audit"',
    'rows': 3,
    'fl': 'id,object_name,line_text'
})

if response.status_code == 200:
    data = response.json()
    count = data['response']['numFound']
    print(f'Search for "Audit": {count} results')
    
    if count > 0:
        for doc in data['response']['docs'][:3]:
            obj_name = doc.get('object_name', 'N/A')
            line_text = doc.get('line_text', '')[:60] + '...'
            print(f'  Object: {obj_name}')
            print(f'  Line: {line_text}')
    else:
        print('No results found')
else:
    print(f'Error: HTTP {response.status_code}')
