"""
Detailed Instagram Profile Checker
Shows exactly what content is found on each page
"""

import requests
import time

def check_specific_profile(url):
    """Check a specific profile and show detailed response"""
    
    print(f"🔍 Detailed check for: {url}")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
        
        print(f"Status Code: {response.status_code}")
        print(f"Final URL: {response.url}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            content = response.text
            print(f"Page Content Length: {len(content)} characters")
            
            # Look for key phrases
            error_phrases = [
                "Sorry, this page isn't available",
                "sorry, this page isn't available", 
                "Page not found",
                "User not found",
                "This content isn't available",
                "This account doesn't exist"
            ]
            
            positive_phrases = [
                '"followers"',
                '"following"', 
                '"posts"',
                'followers</span>',
                'profile_pic_url',
                '"username"'
            ]
            
            print(f"\n🔍 CHECKING FOR ERROR PHRASES:")
            found_errors = []
            for phrase in error_phrases:
                if phrase.lower() in content.lower():
                    found_errors.append(phrase)
                    print(f"  ❌ FOUND: '{phrase}'")
            
            if not found_errors:
                print(f"  ✅ No error phrases found")
            
            print(f"\n🔍 CHECKING FOR POSITIVE INDICATORS:")
            found_positive = []
            for phrase in positive_phrases:
                if phrase in content:
                    found_positive.append(phrase)
                    print(f"  ✅ FOUND: '{phrase}'")
            
            if not found_positive:
                print(f"  ❌ No positive indicators found")
            
            # Show a snippet of the content around key areas
            print(f"\n📄 CONTENT SNIPPETS:")
            
            # Look for title
            if '<title>' in content:
                start = content.find('<title>') + 7
                end = content.find('</title>', start)
                title = content[start:end] if end > start else "Not found"
                print(f"  Title: {title}")
            
            # Look for Instagram-specific content
            if 'instagram' in content.lower():
                print(f"  ✅ Contains 'instagram' text")
            else:
                print(f"  ❌ No 'instagram' text found")
            
            # Show first 500 characters of body
            body_start = content.find('<body')
            if body_start > -1:
                body_content = content[body_start:body_start+500]
                print(f"  Body start: {body_content[:200]}...")
            
            # Final determination
            if found_errors:
                return f"❌ PROFILE NOT AVAILABLE - Found: {', '.join(found_errors)}"
            elif found_positive:
                return f"✅ PROFILE AVAILABLE - Found: {', '.join(found_positive)}"
            else:
                return f"⚠️ UNCLEAR - No clear indicators found"
                
        else:
            return f"❌ HTTP ERROR - Status: {response.status_code}"
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return f"❌ REQUEST FAILED - {str(e)}"

def main():
    """Check the first profile in detail"""
    
    # The problematic first profile
    first_profile = "https://instagram.com/sanisonsy"
    
    print("🕵️ DETAILED PROFILE INVESTIGATION")
    print("="*50)
    
    result = check_specific_profile(first_profile)
    
    print(f"\n🎯 FINAL RESULT:")
    print(f"{result}")

if __name__ == "__main__":
    main()