"""
Instagram Profile Scraper
Extracts: Username, IG Link, Followers, Avg Views, Genre

WARNING: This may violate Instagram's Terms of Service. Use responsibly.
"""

import requests
from bs4 import BeautifulSoup
import pandas as pd
import json
import re
import time
import random
from urllib.parse import urlparse
import csv
from datetime import datetime
import os


class InstagramScraper:
    def __init__(self):
        self.session = requests.Session()
        
        # Headers to mimic a real browser
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        })
    
    def clean_url(self, url):
        """Clean Instagram URL to get base profile URL"""
        # Remove query parameters and fragments
        parsed = urlparse(url)
        base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        
        # Remove /reels/ if present
        base_url = base_url.replace('/reels/', '/')
        
        # Ensure it ends properly
        if not base_url.endswith('/'):
            base_url += '/'
            
        return base_url
    
    def extract_username_from_url(self, url):
        """Extract username from Instagram URL"""
        try:
            # Remove protocol and domain
            path = urlparse(url).path
            # Extract username (first path segment)
            username = path.strip('/').split('/')[0]
            return username
        except:
            return None
    
    def scrape_profile_basic(self, url):
        """
        Basic scraping using requests + BeautifulSoup
        Works for public information that doesn't require JavaScript
        """
        try:
            username = self.extract_username_from_url(url)
            clean_url = self.clean_url(url)
            
            print(f"Scraping: {username} ({clean_url})")
            
            # Add random delay to avoid rate limiting
            time.sleep(random.uniform(2, 4))
            
            response = self.session.get(clean_url, timeout=15)
            
            if response.status_code != 200:
                return {
                    'username': username,
                    'ig_link': clean_url,
                    'followers': 'Error',
                    'avg_views': 'Error',
                    'genre': 'Error',
                    'status': f'HTTP {response.status_code}'
                }
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Method 1: Try to find JSON data in script tags
            profile_data = self.extract_from_script_tags(soup)
            
            if profile_data:
                return {
                    'username': username,
                    'ig_link': clean_url,
                    'followers': profile_data.get('followers', 'Not found'),
                    'avg_views': profile_data.get('avg_views', 'Not available'),
                    'genre': profile_data.get('genre', 'Not found'),
                    'status': 'Success'
                }
            
            # Method 2: Try to extract from meta tags
            meta_data = self.extract_from_meta_tags(soup)
            
            return {
                'username': username,
                'ig_link': clean_url,
                'followers': meta_data.get('followers', 'Not found'),
                'avg_views': 'Not available via basic scraping',
                'genre': meta_data.get('genre', 'Not found'),
                'status': 'Partial success'
            }
            
        except Exception as e:
            return {
                'username': self.extract_username_from_url(url) or 'Unknown',
                'ig_link': url,
                'followers': 'Error',
                'avg_views': 'Error',
                'genre': 'Error',
                'status': f'Error: {str(e)}'
            }
    
    def extract_from_script_tags(self, soup):
        """Extract data from JavaScript script tags"""
        try:
            # Look for script tags containing profile data
            scripts = soup.find_all('script', {'type': 'application/ld+json'})
            
            for script in scripts:
                try:
                    data = json.loads(script.string)
                    if isinstance(data, dict) and 'mainEntityOfPage' in data:
                        # This might contain follower information
                        pass
                except:
                    continue
            
            # Alternative: Look for window._sharedData
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string and 'window._sharedData' in script.string:
                    # Extract JSON data
                    try:
                        json_start = script.string.find('window._sharedData = ') + 21
                        json_end = script.string.find(';</script>', json_start)
                        json_data = script.string[json_start:json_end]
                        data = json.loads(json_data)
                        
                        # Navigate through the nested structure
                        entry_data = data.get('entry_data', {})
                        profile_page = entry_data.get('ProfilePage', [])
                        
                        if profile_page and len(profile_page) > 0:
                            user_data = profile_page[0].get('graphql', {}).get('user', {})
                            
                            followers = user_data.get('edge_followed_by', {}).get('count', 'Not found')
                            biography = user_data.get('biography', '')
                            
                            # Try to extract genre from bio
                            genre = self.extract_genre_from_bio(biography)
                            
                            return {
                                'followers': followers,
                                'genre': genre
                            }
                    except:
                        continue
            
            return None
        except:
            return None
    
    def extract_from_meta_tags(self, soup):
        """Extract data from meta tags"""
        try:
            data = {}
            
            # Look for description meta tag
            description_meta = soup.find('meta', {'name': 'description'}) or \
                              soup.find('meta', {'property': 'og:description'})
            
            if description_meta:
                description = description_meta.get('content', '')
                
                # Try to extract follower count from description
                follower_match = re.search(r'([\d,]+)\s*[Ff]ollowers', description)
                if follower_match:
                    followers_text = follower_match.group(1).replace(',', '')
                    try:
                        data['followers'] = int(followers_text)
                    except:
                        data['followers'] = followers_text
                
                # Extract genre from description
                data['genre'] = self.extract_genre_from_bio(description)
            
            return data
        except:
            return {}
    
    def extract_genre_from_bio(self, text):
        """Extract genre/category from biography text"""
        if not text:
            return 'Not found'
        
        text_lower = text.lower()
        
        # Define genre keywords
        genre_keywords = {
            'fashion': ['fashion', 'style', 'outfit', 'clothing', 'designer'],
            'food': ['food', 'chef', 'cooking', 'recipe', 'restaurant', 'foodie'],
            'travel': ['travel', 'wanderlust', 'explorer', 'adventure', 'journey'],
            'fitness': ['fitness', 'gym', 'workout', 'health', 'yoga', 'trainer'],
            'beauty': ['beauty', 'makeup', 'cosmetics', 'skincare', 'beautician'],
            'lifestyle': ['lifestyle', 'daily', 'life', 'vlog', 'blogger'],
            'tech': ['tech', 'technology', 'gadgets', 'coding', 'developer'],
            'music': ['music', 'musician', 'singer', 'artist', 'band'],
            'comedy': ['comedy', 'funny', 'humor', 'comedian', 'memes'],
            'business': ['entrepreneur', 'business', 'startup', 'ceo', 'founder'],
            'photography': ['photographer', 'photography', 'photos', 'camera'],
            'art': ['art', 'artist', 'creative', 'design', 'painter']
        }
        
        found_genres = []
        for genre, keywords in genre_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                found_genres.append(genre.title())
        
        return ' | '.join(found_genres) if found_genres else 'General/Lifestyle'
    
    def format_follower_count(self, count):
        """Format follower count for display"""
        if isinstance(count, int):
            if count >= 1000000:
                return f"{count/1000000:.1f}M"
            elif count >= 1000:
                return f"{count/1000:.1f}K"
            else:
                return str(count)
        return str(count)
    
    def scrape_profiles_from_csv(self, csv_file_path, output_file='scraped_instagram_data.csv'):
        """Scrape all profiles from CSV file"""
        
        # Read URLs from CSV
        urls = []
        try:
            with open(csv_file_path, 'r', encoding='utf-8') as file:
                content = file.read().strip()
                urls = [url.strip() for url in content.split('\n') if url.strip()]
        except Exception as e:
            print(f"Error reading CSV file: {e}")
            return
        
        print(f"Found {len(urls)} Instagram URLs to scrape")
        
        results = []
        
        for i, url in enumerate(urls, 1):
            print(f"\nProcessing {i}/{len(urls)}: {url}")
            
            # Scrape profile
            profile_data = self.scrape_profile_basic(url)
            results.append(profile_data)
            
            # Progress update
            if profile_data['status'] == 'Success':
                print(f"✓ Success: {profile_data['username']} - {profile_data['followers']} followers")
            else:
                print(f"✗ {profile_data['status']}")
            
            # Rate limiting - longer delay every 10 requests
            if i % 10 == 0:
                print("Taking a longer break to avoid rate limiting...")
                time.sleep(random.uniform(10, 15))
        
        # Save results to CSV
        self.save_results_to_csv(results, output_file)
        
        # Print summary
        successful = len([r for r in results if r['status'] == 'Success'])
        print(f"\n=== SCRAPING COMPLETE ===")
        print(f"Total profiles: {len(results)}")
        print(f"Successful: {successful}")
        print(f"Failed: {len(results) - successful}")
        print(f"Results saved to: {output_file}")
        
        return results
    
    def save_results_to_csv(self, results, filename):
        """Save scraping results to CSV file"""
        try:
            df = pd.DataFrame(results)
            
            # Reorder columns
            column_order = ['username', 'ig_link', 'followers', 'avg_views', 'genre', 'status']
            df = df.reindex(columns=column_order)
            
            # Add timestamp
            df['scraped_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            df.to_csv(filename, index=False, encoding='utf-8')
            print(f"\nResults saved to {filename}")
            
        except Exception as e:
            print(f"Error saving to CSV: {e}")


# Enhanced Selenium version for JavaScript-heavy content
def create_selenium_scraper():
    """
    Alternative scraper using Selenium for JavaScript-rendered content.
    Requires: pip install selenium
    And download ChromeDriver
    """
    selenium_code = '''
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

class SeleniumInstagramScraper:
    def __init__(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")  # Run in background
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        
        self.driver = webdriver.Chrome(options=chrome_options)
        self.wait = WebDriverWait(self.driver, 10)
    
    def scrape_profile_selenium(self, url):
        try:
            self.driver.get(url)
            time.sleep(3)  # Wait for page to load
            
            # Extract username
            username = url.split('/')[-2] if url.endswith('/') else url.split('/')[-1]
            
            # Try to find follower count
            followers = "Not found"
            try:
                # Instagram keeps changing selectors, these might need updates
                follower_elements = self.driver.find_elements(By.XPATH, "//a[contains(@href, '/followers/')]/span")
                if follower_elements:
                    followers = follower_elements[0].get_attribute('title') or follower_elements[0].text
            except:
                pass
            
            # Extract bio for genre detection
            bio = "Not found"
            try:
                bio_elements = self.driver.find_elements(By.TAG_NAME, "h1")
                if bio_elements:
                    bio = bio_elements[0].text
            except:
                pass
            
            return {
                'username': username,
                'ig_link': url,
                'followers': followers,
                'avg_views': 'Requires post analysis',
                'genre': self.extract_genre_from_text(bio),
                'status': 'Success'
            }
            
        except Exception as e:
            return {
                'username': 'Error',
                'ig_link': url,
                'followers': 'Error',
                'avg_views': 'Error', 
                'genre': 'Error',
                'status': f'Error: {str(e)}'
            }
    
    def close(self):
        self.driver.quit()
'''
    
    return selenium_code


def main():
    """Main function to run the scraper"""
    scraper = InstagramScraper()
    
    # Path to your CSV file with Instagram URLs
    csv_file = r"c:\3 Folks Media\data\Testing\Testing Data - Sheet3.csv"
    
    # Output file
    output_file = r"c:\3 Folks Media\data\scraped_instagram_profiles.csv"
    
    # Run the scraper
    results = scraper.scrape_profiles_from_csv(csv_file, output_file)
    
    return results


if __name__ == "__main__":
    print("Instagram Profile Scraper")
    print("=" * 50)
    print("WARNING: This may violate Instagram's Terms of Service")
    print("Use responsibly and at your own risk")
    print("=" * 50)
    
    # Run the scraper
    results = main()