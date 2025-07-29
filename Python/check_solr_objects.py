import requests

# Check what object names are actually in Solr
solr_url = 'http://localhost:8983/solr/MSDyn'

try:
    print("Checking what object names are in Solr:")
    print("=" * 50)
    
    # Get facet counts for object_name field
    response = requests.get(f'{solr_url}/select', params={
        'q': '*:*',
        'rows': 0,
        'facet': 'true',
        'facet.field': 'object_name',
        'facet.limit': 20,
        'facet.mincount': 1
    })
    
    if response.status_code == 200:
        data = response.json()
        total_docs = data['response']['numFound']
        print(f'Total documents in Solr: {total_docs}')
        print()
        
        facets = data.get('facet_counts', {}).get('facet_fields', {}).get('object_name', [])
        if facets:
            print("Top 20 object names in Solr:")
            for i in range(0, len(facets), 2):
                if i + 1 < len(facets):
                    obj_name = facets[i]
                    count = facets[i + 1]
                    print(f'  {obj_name}: {count} documents')
                    
                    # Check if this contains AUDIT
                    if 'AUDIT' in obj_name.upper():
                        print(f'    ^^^ Contains AUDIT!')
        else:
            print("No facet data available")
            
        # Also try to find any documents that mention AUDIT in line_text
        print("\nSearching for AUDIT in line_text:")
        response2 = requests.get(f'{solr_url}/select', params={
            'q': 'line_text:*AUDIT*',
            'rows': 3,
            'fl': 'object_name,line_text'
        })
        
        if response2.status_code == 200:
            data2 = response2.json()
            count = data2['response']['numFound']
            print(f'Found {count} documents with AUDIT in line_text')
            
            for doc in data2['response']['docs'][:3]:
                obj_name = doc.get('object_name', 'N/A')
                line_text = doc.get('line_text', '')[:80] + '...'
                print(f'  Object: {obj_name}')
                print(f'  Line: {line_text}')
                print()
        
    else:
        print(f'Error: HTTP {response.status_code}')
        print(response.text)
        
except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()
