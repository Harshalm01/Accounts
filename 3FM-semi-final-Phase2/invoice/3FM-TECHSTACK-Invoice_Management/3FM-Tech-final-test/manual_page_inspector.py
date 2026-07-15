"""
Manual Page Content Inspector
Find exactly what Instagram is showing
"""

import requests
import re

def inspect_page_content(url):
    """Inspect the actual page content for error messages"""
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        content = response.text
        
        print(f"🔍 MANUAL INSPECTION: {url}")
        print(f"Status: {response.status_code}")
        print("="*60)
        
        # Search for the specific error message ANYWHERE in the content
        error_searches = [
            "Sorry, this page isn't available",
            "sorry, this page isn't available", 
            "Sorry, this page isn't available.",
            "Page not found",
            "User not found",
            "This content isn't available",
            "isn't available",
            "not found"
        ]
        
        print(f"🔍 SEARCHING FOR ERROR MESSAGES:")
        found_any_error = False
        
        for search_term in error_searches:
            if search_term.lower() in content.lower():
                print(f"  ❌ FOUND: '{search_term}'")
                found_any_error = True
                
                # Show context around the error
                index = content.lower().find(search_term.lower())
                start = max(0, index - 100)
                end = min(len(content), index + len(search_term) + 100)
                context = content[start:end]
                print(f"     Context: ...{context}...")
        
        if not found_any_error:
            print(f"  ✅ No explicit error messages found")
        
        # Look for profile-specific content 
        print(f"\n🔍 SEARCHING FOR PROFILE CONTENT:")
        profile_searches = [
            '"followers"',
            '"following"',
            'follower_count',
            'post_count',
            'profile_pic_url',
            'bio',
            'posts',
            '"username"'
        ]
        
        found_profile_content = False
        for search_term in profile_searches:
            if search_term in content:
                print(f"  ✅ FOUND: '{search_term}'")
                found_profile_content = True
        
        if not found_profile_content:
            print(f"  ❌ No profile content found")
        
        # Check if it's a login page or generic Instagram page
        print(f"\n🔍 PAGE TYPE DETECTION:")
        
        if 'login' in content.lower() and 'password' in content.lower():
            print(f"  📋 Detected: LOGIN PAGE")
            page_type = "Login Page"
        elif 'sign up' in content.lower() and 'create account' in content.lower():
            print(f"  📋 Detected: SIGNUP PAGE") 
            page_type = "Signup Page"
        elif found_any_error:
            print(f"  📋 Detected: ERROR PAGE")
            page_type = "Error Page"
        elif found_profile_content:
            print(f"  📋 Detected: PROFILE PAGE")
            page_type = "Profile Page"
        else:
            print(f"  📋 Detected: UNKNOWN PAGE TYPE")
            page_type = "Unknown"
        
        # Show key parts of the page
        print(f"\n📄 KEY CONTENT ANALYSIS:")
        print(f"Total characters: {len(content)}")
        
        # Find and show the main content area
        if '<main' in content:
            main_start = content.find('<main')
            main_end = content.find('</main>', main_start) + 7
            main_content = content[main_start:main_end] if main_end > main_start else ""
            print(f"Main section length: {len(main_content)}")
            
            # Look specifically in main content for error
            if "sorry, this page isn't available" in main_content.lower():
                print(f"  ❌ ERROR MESSAGE FOUND IN MAIN CONTENT")
                return "❌ PROFILE NOT AVAILABLE"
        
        # Final determination
        if found_any_error:
            return f"❌ PROFILE NOT AVAILABLE - {page_type}"
        elif found_profile_content:
            return f"✅ PROFILE AVAILABLE - {page_type}" 
        elif page_type in ["Login Page", "Signup Page"]:
            return f"⚠️ REDIRECTED TO {page_type.upper()} - Profile may not exist"
        else:
            return f"⚠️ UNCLEAR - {page_type}"
            
    except Exception as e:
        return f"❌ ERROR: {e}"

def main():
    """Check the problematic profile"""
    
    url = "https://instagram.com/sanisonsy"
    result = inspect_page_content(url)
    
    print(f"\n🎯 FINAL DETERMINATION:")
    print(f"{result}")

if __name__ == "__main__":
    main()