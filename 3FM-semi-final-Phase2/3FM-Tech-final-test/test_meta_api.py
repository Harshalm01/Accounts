"""
QUICK META API TEST - Paste your token here!
"""

# 1. Get your access token from: https://developers.facebook.com/tools/explorer/
# 2. Replace the token below
# 3. Run this script

ACCESS_TOKEN = "PASTE_YOUR_TOKEN_HERE"

# Test one profile
import requests

def test_meta_api():
    if ACCESS_TOKEN == "PASTE_YOUR_TOKEN_HERE":
        print("❌ Please get your access token first!")
        print("🔗 Go to: https://developers.facebook.com/tools/explorer/")
        return
        
    # Test API call
    test_url = f"https://graph.facebook.com/v18.0/17841405793187218"  # Instagram's official account
    params = {
        'fields': 'username,followers_count,media_count,biography',
        'access_token': ACCESS_TOKEN
    }
    
    try:
        response = requests.get(test_url, params=params)
        
        if response.status_code == 200:
            data = response.json()
            print("🎉 SUCCESS! Meta API is working!")
            print(f"✅ Username: {data.get('username')}")
            print(f"✅ Followers: {data.get('followers_count'):,}")
            print(f"✅ Posts: {data.get('media_count'):,}")
            print(f"✅ Bio: {data.get('biography', '')[:100]}...")
            print("\n🚀 Ready to process 400K profiles!")
        else:
            print(f"❌ API Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Connection error: {e}")

if __name__ == "__main__":
    test_meta_api()