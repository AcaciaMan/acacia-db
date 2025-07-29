import requests

# Test different search patterns for AUDIT in the MSDyn core
solr_url = 'http://localhost:8983/solr/MSDyn'

search_patterns = [
    'object_name:"AUDIT"',      # Exact quoted match
    'object_name:AUDIT',          # Simple match
    'AUDIT',                      # Full text search
    'object_name:*AUDIT*',        # Wildcard search
    '*AUDIT*'                     # General wildcard
]

try:
    print("Testing search patterns for AUDIT:")
    print("=" * 50)
    
    for pattern in search_patterns:
        response = requests.get(f'{solr_url}/select', params={
            'q': pattern,
            'rows': 3,
            'fl': 'id,object_name,line_text'
        })
        
        if response.status_code == 200:
            data = response.json()
            count = data['response']['numFound']
            print(f'Pattern "{pattern}": {count} results')
            
            if count > 0:
                for doc in data['response']['docs'][:2]:  # Show first 2
                    obj_name = doc.get('object_name', 'N/A')
                    line_text = doc.get('line_text', '')[:50] + '...'
                    print(f'  - Object: {obj_name}, Line: {line_text}')
            print()
        else:
            print(f'Pattern "{pattern}": HTTP {response.status_code}')
            
except Exception as e:
    print(f'Error: {e}')
