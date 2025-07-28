"""Test script to debug the proximity calculation issue."""

import requests
import json
import re
import math

def test_proximity_calculation():
    """Test the proximity calculation with actual Solr data."""
    
    # Query Solr for a sample document
    response = requests.get('http://localhost:8983/solr/oracle_db_search/select', params={
        'q': 'object_name:"EMPLOYEES"',
        'rows': 3,
        'fl': 'id,object_name,line_text,context_before,context_after',
        'wt': 'json'
    })
    
    data = response.json()
    docs = data['response']['docs']
    
    if not docs:
        print("No documents found")
        return
    
    print(f"Found {len(docs)} documents. Examining first document:")
    doc = docs[0]
    
    print(f"\nDocument ID: {doc.get('id')}")
    print(f"Object name: {doc.get('object_name')}")
    print(f"Line text: {doc.get('line_text', '')}")
    print(f"Context before: {doc.get('context_before', [])}")
    print(f"Context after: {doc.get('context_after', [])}")
    
    # Test proximity calculation
    object_name = "EMPLOYEES"
    column_name = "SALARY"
    
    context_before_text = ' '.join(doc.get('context_before', []))
    line_text = doc.get('line_text', '')
    context_after_text = ' '.join(doc.get('context_after', []))
    
    print(f"\n=== Testing proximity for {object_name} and {column_name} ===")
    print(f"Context before text: '{context_before_text}'")
    print(f"Line text: '{line_text}'")
    print(f"Context after text: '{context_after_text}'")
    
    # Test each field
    fields = [
        ('context_before', context_before_text),
        ('line_text', line_text),
        ('context_after', context_after_text)
    ]
    
    for field_name, text in fields:
        print(f"\n--- Testing {field_name} ---")
        print(f"Text: '{text}'")
        
        if not text:
            print("Empty text")
            continue
            
        text_upper = text.upper()
        object_pattern = r'\b' + re.escape(object_name) + r'\b'
        column_pattern = r'\b' + re.escape(column_name) + r'\b'
        
        object_matches = list(re.finditer(object_pattern, text_upper))
        column_matches = list(re.finditer(column_pattern, text_upper))
        
        print(f"Object matches: {len(object_matches)}")
        for match in object_matches:
            print(f"  Found '{object_name}' at position {match.start()}-{match.end()}")
            
        print(f"Column matches: {len(column_matches)}")
        for match in column_matches:
            print(f"  Found '{column_name}' at position {match.start()}-{match.end()}")
        
        if object_matches and column_matches:
            min_distance = float('inf')
            for obj_match in object_matches:
                obj_pos = obj_match.start()
                for col_match in column_matches:
                    col_pos = col_match.start()
                    distance = abs(obj_pos - col_pos)
                    min_distance = min(min_distance, distance)
                    print(f"  Distance between positions {obj_pos} and {col_pos}: {distance}")
            
            proximity_score = math.exp(-min_distance / 100.0)
            print(f"  Minimum distance: {min_distance}")
            print(f"  Proximity score: {proximity_score:.6f}")
        else:
            print("  No proximity calculation possible - missing object or column")


if __name__ == "__main__":
    test_proximity_calculation()
