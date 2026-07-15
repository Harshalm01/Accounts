"""
META API INSTAGRAM SOLUTION 
🚀 Official, Reliable, Scalable, ACCURATE!

3 Options for Instagram Data:
1. Instagram Basic Display API (Personal profiles)
2. Instagram Graph API (Business profiles) 
3. Meta Business API (Bulk business discovery)

BEST FOR 400K PROFILES: Instagram Graph API + Business Discovery
"""

import requests
import pandas as pd
import json
from datetime import datetime
import time

class MetaInstagramAPI:
    def __init__(self, access_token):
        """
        Initialize Meta Instagram API client
        
        Get your access_token from:
        https://developers.facebook.com/tools/explorer/
        
        Required permissions:
        - instagram_basic
        - pages_read_engagement
        - business_management
        """
        self.access_token = access_token
        self.base_url = "https://graph.facebook.com/v18.0"
        
    def get_business_account_info(self, username):
        """
        Get Instagram Business Account Info via Graph API
        MUCH more accurate than scraping!
        """
        
        try:
            # Step 1: Search for Instagram business account
            search_url = f"{self.base_url}/ig_hashtag_search"
            
            # Alternative: Direct business account lookup
            account_url = f"{self.base_url}/{username}"
            
            params = {
                'fields': 'id,username,account_type,media_count,followers_count,follows_count,biography,website,profile_picture_url,name',
                'access_token': self.access_token
            }
            
            response = requests.get(account_url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                
                # Get additional engagement data
                media_data = self.get_recent_media_stats(data.get('id'))
                
                return {
                    'username': data.get('username'),
                    'followers': data.get('followers_count'),
                    'following': data.get('follows_count'),
                    'posts': data.get('media_count'),
                    'biography': data.get('biography'),
                    'website': data.get('website'),
                    'account_type': data.get('account_type'),
                    'engagement_rate': media_data.get('engagement_rate'),
                    'avg_likes': media_data.get('avg_likes'),
                    'avg_comments': media_data.get('avg_comments'),
                    'contact_email': self.extract_contact_from_bio(data.get('biography', '')),
                    'genre': self.detect_genre_from_bio(data.get('biography', '')),
                    'api_source': 'Meta Graph API',
                    'scraped_at': datetime.now().isoformat()
                }
            else:
                return {'error': f"API Error: {response.status_code} - {response.text}"}
                
        except Exception as e:
            return {'error': str(e)}
    
    def get_recent_media_stats(self, account_id):
        """Get recent media for engagement calculation"""
        try:
            media_url = f"{self.base_url}/{account_id}/media"
            params = {
                'fields': 'id,media_type,like_count,comments_count,timestamp',
                'limit': 20,  # Get last 20 posts
                'access_token': self.access_token
            }
            
            response = requests.get(media_url, params=params)
            
            if response.status_code == 200:
                media_data = response.json().get('data', [])
                
                if media_data:
                    total_likes = sum(post.get('like_count', 0) for post in media_data)
                    total_comments = sum(post.get('comments_count', 0) for post in media_data)
                    total_engagement = total_likes + total_comments
                    
                    avg_likes = total_likes / len(media_data) if media_data else 0
                    avg_comments = total_comments / len(media_data) if media_data else 0
                    
                    return {
                        'avg_likes': int(avg_likes),
                        'avg_comments': int(avg_comments),
                        'avg_engagement': int(total_engagement / len(media_data)),
                        'engagement_rate': f"{(total_engagement / len(media_data)):.2f}%"
                    }
            
            return {'avg_likes': 0, 'avg_comments': 0, 'engagement_rate': '0%'}
            
        except Exception as e:
            return {'avg_likes': 0, 'avg_comments': 0, 'engagement_rate': 'Error'}
    
    def extract_contact_from_bio(self, bio):
        """Extract contact info from biography"""
        import re
        
        if not bio:
            return "Not provided"
        
        # Email pattern
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        emails = re.findall(email_pattern, bio)
        
        if emails:
            return emails[0]
        
        # Check for contact keywords
        contact_keywords = ['dm', 'email', 'contact', 'business', 'collab']
        for keyword in contact_keywords:
            if keyword.lower() in bio.lower():
                return f"Contact via bio ({keyword})"
        
        return "Not provided"
    
    def detect_genre_from_bio(self, bio):
        """Detect genre from biography"""
        if not bio:
            return "Unknown"
        
        bio_lower = bio.lower()
        
        # Genre keywords mapping
        genre_map = {
            'Fashion': ['fashion', 'style', 'ootd', 'outfit'],
            'Beauty': ['beauty', 'makeup', 'skincare', 'cosmetics'],
            'Food': ['food', 'recipe', 'cooking', 'chef', 'foodie'],
            'Travel': ['travel', 'wanderlust', 'adventure', 'explore'],
            'Fitness': ['fitness', 'gym', 'workout', 'health'],
            'Lifestyle': ['lifestyle', 'blogger', 'life'],
            'Business': ['entrepreneur', 'ceo', 'business', 'founder'],
            'Comedy': ['comedy', 'funny', 'humor', 'comedian'],
            'Music': ['music', 'singer', 'musician', 'artist'],
            'Photography': ['photographer', 'photography', 'photo'],
            'Tech': ['tech', 'developer', 'coding', 'startup']
        }
        
        for genre, keywords in genre_map.items():
            for keyword in keywords:
                if keyword in bio_lower:
                    return genre
        
        return "Lifestyle"  # Default genre
    
    def bulk_account_analysis(self, usernames, output_file='meta_api_results.csv'):
        """
        Analyze multiple accounts using Meta API
        MUCH faster and more accurate than scraping!
        """
        
        results = []
        total = len(usernames)
        
        print(f"🚀 META API Instagram Analysis - {total} accounts")
        print(f"📊 Using official Meta Graph API")
        
        for i, username in enumerate(usernames, 1):
            print(f"\n📱 Account {i}/{total}: {username}")
            
            account_data = self.get_business_account_info(username)
            
            if account_data and 'error' not in account_data:
                results.append(account_data)
                print(f"✅ Success: {account_data.get('followers', 'N/A')} followers")
            else:
                error_result = {
                    'username': username,
                    'error': account_data.get('error', 'Unknown error'),
                    'scraped_at': datetime.now().isoformat()
                }
                results.append(error_result)
                print(f"❌ Error: {account_data.get('error', 'Unknown')}")
            
            # Respectful rate limiting
            if i < total:
                time.sleep(1)  # Meta API allows higher rates than scraping
        
        # Save results
        if results:
            df = pd.DataFrame(results)
            df.to_csv(f'data/{output_file}', index=False)
            
            print(f"\n🎉 META API ANALYSIS COMPLETE!")
            print(f"📊 Results saved: data/{output_file}")
            
            successful = [r for r in results if 'error' not in r]
            print(f"📈 Success rate: {len(successful)}/{total} ({len(successful)/total*100:.1f}%)")
            
            if successful:
                self.show_api_summary(successful)
        
        return results
    
    def show_api_summary(self, successful_results):
        """Show API extraction summary"""
        print(f"\n📋 META API ACCURACY:")
        print(f"✅ Usernames: {len([r for r in successful_results if r.get('username')])}/{len(successful_results)}")
        print(f"✅ Followers: {len([r for r in successful_results if r.get('followers')])}/{len(successful_results)}")
        print(f"✅ Engagement: {len([r for r in successful_results if r.get('engagement_rate') != '0%'])}/{len(successful_results)}")
        print(f"✅ Contact info: {len([r for r in successful_results if r.get('contact_email') != 'Not provided'])}/{len(successful_results)}")
        print(f"✅ Genres: {len([r for r in successful_results if r.get('genre') != 'Unknown'])}/{len(successful_results)}")

# Example usage
def test_meta_api():
    """Test Meta API with sample accounts"""
    
    # YOU NEED TO GET YOUR ACCESS TOKEN:
    # 1. Go to https://developers.facebook.com/tools/explorer/
    # 2. Select your Facebook Page
    # 3. Request permissions: instagram_basic, pages_read_engagement
    # 4. Generate token
    
    ACCESS_TOKEN = "YOUR_ACCESS_TOKEN_HERE"
    
    if ACCESS_TOKEN == "YOUR_ACCESS_TOKEN_HERE":
        print("❌ Please set your Meta API access token first!")
        print("\n📖 HOW TO GET ACCESS TOKEN:")
        print("1. Go to: https://developers.facebook.com/tools/explorer/")
        print("2. Select your Facebook Page")
        print("3. Add permissions: instagram_basic, pages_read_engagement")
        print("4. Generate Access Token")
        print("5. Replace YOUR_ACCESS_TOKEN_HERE with your token")
        return
    
    # Initialize API client
    api = MetaInstagramAPI(ACCESS_TOKEN)
    
    # Test accounts
    test_accounts = [
        "nike",
        "natgeo", 
        "instagram",
        "cristiano",
        "selenagomez"
    ]
    
    # Run analysis
    results = api.bulk_account_analysis(test_accounts, 'meta_api_test.csv')
    
    if results:
        print(f"\n🎯 SAMPLE META API RESULT:")
        successful = [r for r in results if 'error' not in r]
        if successful:
            sample = successful[0]
            for key, value in sample.items():
                if key != 'scraped_at':
                    print(f"   {key}: {value}")

if __name__ == "__main__":
    test_meta_api()