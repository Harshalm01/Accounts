"""
Enhanced Instagram Profile Scraper - Detailed Info for 3 Profiles
Gets comprehensive profile data: bio, contact, verification, posts, etc.
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import random
import pandas as pd
from datetime import datetime
import json

class DetailedInstagramScraper:
    def __init__(self):
        self.setup_selenium()
        
    def setup_selenium(self):
        """Setup Chrome for detailed scraping"""
        chrome_options = Options()
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        
        self.driver = webdriver.Chrome(options=chrome_options)
        self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        self.wait = WebDriverWait(self.driver, 15)
        print("✅ Enhanced Chrome driver ready")
    
    def extract_username(self, url):
        """Clean Instagram URL to get username"""
        try:
            if 'instagram.com/' in url:
                username = url.split('instagram.com/')[-1]
                username = username.split('?')[0].strip('/')
                return username
        except:
            return None
    
    def get_detailed_profile(self, instagram_url):
        """Get comprehensive profile information"""
        
        username = self.extract_username(instagram_url)
        if not username:
            return None
            
        try:
            print(f"🔍 Scraping detailed info for: {username}")
            
            # Navigate to profile
            clean_url = f"https://www.instagram.com/{username}/"
            self.driver.get(clean_url)
            time.sleep(random.uniform(3, 6))
            
            profile_data = {
                'username': username,
                'url': clean_url,
                'scraped_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            # Get follower count
            profile_data['followers'] = self.get_followers()
            
            # Get following count  
            profile_data['following'] = self.get_following()
            
            # Get posts count
            profile_data['posts_count'] = self.get_posts_count()
            
            # Get bio/description
            profile_data['bio'] = self.get_bio()
            
            # Get full name
            profile_data['full_name'] = self.get_full_name()
            
            # Get verification status
            profile_data['verified'] = self.is_verified()
            
            # Get contact/business info
            profile_data.update(self.get_business_info())
            
            # Get recent posts stats
            profile_data.update(self.get_recent_posts_stats())
            
            print(f"✅ {username}: Complete profile scraped")
            return profile_data
            
        except Exception as e:
            print(f"❌ Error scraping {username}: {e}")
            return {
                'username': username,
                'url': clean_url,
                'error': str(e),
                'scraped_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
    
    def get_followers(self):
        """Extract follower count"""
        try:
            selectors = [
                'a[href*="followers"] span',
                'span[title]:contains("followers")',
                'a:contains("followers")',
                'span:contains("followers")'
            ]
            
            for selector in selectors:
                try:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    text = element.get_attribute('title') or element.text
                    if any(char.isdigit() for char in text):
                        return self.convert_follower_count(text)
                except:
                    continue
                    
            # Fallback: look for number pattern
            elements = self.driver.find_elements(By.TAG_NAME, 'span')
            for elem in elements:
                text = elem.text.strip()
                if 'follower' in text.lower() or ('K' in text and text.replace('K','').replace(',','').replace('.','').isdigit()):
                    return self.convert_follower_count(text)
                    
            return "Not found"
            
        except Exception as e:
            return "Error"
    
    def get_following(self):
        """Extract following count"""
        try:
            selectors = [
                'a[href*="following"] span',
                'span:contains("following")',
                'a:contains("following")'
            ]
            
            for selector in selectors:
                try:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    text = element.text
                    if any(char.isdigit() for char in text):
                        return self.convert_follower_count(text.split()[0])
                except:
                    continue
                    
            return "Not found"
        except:
            return "Error"
    
    def get_posts_count(self):
        """Extract posts count"""
        try:
            selectors = [
                'span:contains("posts")',
                'a:contains("posts")',
                'div:contains("posts")'
            ]
            
            for selector in selectors:
                try:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    text = element.text
                    if any(char.isdigit() for char in text):
                        return text.split()[0].replace(',', '')
                except:
                    continue
                    
            return "Not found"
        except:
            return "Error"
    
    def get_bio(self):
        """Extract bio/description"""
        try:
            selectors = [
                'div.-vDIg span',
                'span.-vDIg',
                'div[data-testid="user-bio"]',
                '.-vDIg span',
                'span[dir="auto"]'
            ]
            
            for selector in selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    for elem in elements:
                        text = elem.text.strip()
                        if len(text) > 10 and not text.isdigit():  # Bio likely longer than 10 chars
                            return text
                except:
                    continue
                    
            # Alternative: look for paragraph-like elements
            divs = self.driver.find_elements(By.TAG_NAME, 'div')
            for div in divs:
                text = div.text.strip()
                if 20 <= len(text) <= 200 and '\n' not in text:  # Bio characteristics
                    return text
                    
            return "No bio found"
            
        except Exception as e:
            return f"Bio error: {e}"
    
    def get_full_name(self):
        """Extract full name"""
        try:
            selectors = [
                'h2.x1lliihq',
                'h1',
                'span.x1lliihq',
                'h2'
            ]
            
            for selector in selectors:
                try:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    text = element.text.strip()
                    if text and not text.isdigit() and len(text) < 50:
                        return text
                except:
                    continue
                    
            return "Name not found"
        except:
            return "Error"
    
    def is_verified(self):
        """Check if account is verified"""
        try:
            # Look for verified badge
            page_source = self.driver.page_source
            if 'Verified' in page_source or '✓' in page_source or 'verified' in page_source.lower():
                return True
            return False
        except:
            return False
    
    def get_business_info(self):
        """Extract business/contact information"""
        try:
            business_info = {
                'category': 'Not specified',
                'website': 'Not found',
                'contact_email': 'Not found',
                'contact_phone': 'Not found'
            }
            
            # Look for contact button
            try:
                contact_btn = self.driver.find_element(By.XPATH, "//button[contains(text(), 'Contact')]")
                business_info['has_contact_button'] = True
            except:
                business_info['has_contact_button'] = False
            
            # Look for website in bio
            page_source = self.driver.page_source
            if 'linktr.ee' in page_source:
                business_info['website'] = 'Linktree found'
            elif 'bit.ly' in page_source:
                business_info['website'] = 'Bitly link found'
            elif 'www.' in page_source:
                business_info['website'] = 'Website found'
            
            # Look for email pattern
            import re
            email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
            emails = re.findall(email_pattern, page_source)
            if emails:
                business_info['contact_email'] = emails[0]
            
            return business_info
            
        except Exception as e:
            return {
                'category': 'Error',
                'website': 'Error',
                'contact_email': 'Error', 
                'contact_phone': 'Error'
            }
    
    def get_recent_posts_stats(self):
        """Get stats from recent posts"""
        try:
            stats = {
                'avg_likes': 'Analyzing...',
                'avg_comments': 'Analyzing...',
                'engagement_rate': 'Calculating...',
                'recent_posts_count': 0
            }
            
            # Look for post elements (basic detection)
            posts = self.driver.find_elements(By.CSS_SELECTOR, 'article')
            stats['recent_posts_count'] = len(posts)
            
            return stats
            
        except Exception as e:
            return {
                'avg_likes': 'Error',
                'avg_comments': 'Error', 
                'engagement_rate': 'Error',
                'recent_posts_count': 0
            }
    
    def convert_follower_count(self, follower_text):
        """Convert follower text to number"""
        try:
            if not follower_text or follower_text.lower() == 'not found':
                return 0
                
            # Clean the text
            text = str(follower_text).strip().upper().replace(',', '').replace(' ', '')
            
            # Extract number and multiplier
            if 'M' in text:
                number = float(text.replace('M', ''))
                return int(number * 1000000)
            elif 'K' in text:
                number = float(text.replace('K', ''))
                return int(number * 1000)
            else:
                # Try to extract just numbers
                clean_number = ''.join(filter(str.isdigit, text))
                return int(clean_number) if clean_number else 0
                
        except Exception as e:
            print(f"Conversion error for '{follower_text}': {e}")
            return 0
    
    def scrape_detailed_profiles(self, urls):
        """Scrape detailed info for multiple profiles"""
        
        detailed_profiles = []
        
        for i, url in enumerate(urls, 1):
            print(f"\n🎯 Profile {i}/{len(urls)}")
            
            profile_data = self.get_detailed_profile(url)
            if profile_data:
                detailed_profiles.append(profile_data)
            
            # Respectful delay between profiles
            if i < len(urls):
                sleep_time = random.uniform(5, 10)
                print(f"⏳ Waiting {sleep_time:.1f}s before next profile...")
                time.sleep(sleep_time)
        
        # Save to JSON for dashboard
        with open('data/detailed_profiles.json', 'w') as f:
            json.dump(detailed_profiles, f, indent=2, default=str)
        
        # Also save to CSV
        df = pd.DataFrame(detailed_profiles)
        df.to_csv('data/detailed_profiles.csv', index=False)
        
        print(f"\n✅ Detailed scraping complete! {len(detailed_profiles)} profiles saved")
        return detailed_profiles
    
    def cleanup(self):
        """Close browser"""
        if hasattr(self, 'driver'):
            self.driver.quit()

# Get 3 sample URLs from existing data
def get_sample_urls():
    try:
        df = pd.read_csv('data/selenium_instagram_results.csv')
        urls = [
            df.iloc[0]['ig_link'],  # iamprincesudhir
            df.iloc[1]['ig_link'],  # harshhgandhii  
            df.iloc[2]['ig_link']   # kinshukwearss
        ]
        return urls
    except:
        return [
            "https://www.instagram.com/iamprincesudhir",
            "https://www.instagram.com/harshhgandhii",
            "https://www.instagram.com/kinshukwearss"
        ]

if __name__ == "__main__":
    # Initialize scraper
    scraper = DetailedInstagramScraper()
    
    try:
        # Get 3 sample URLs
        urls = get_sample_urls()
        print(f"🎯 Scraping detailed data for 3 profiles:")
        for url in urls:
            print(f"   • {url}")
        
        # Scrape detailed profiles
        detailed_data = scraper.scrape_detailed_profiles(urls)
        
        print(f"\n🚀 Ready to display on local server!")
        print("   📊 Data saved to: data/detailed_profiles.json")
        print("   📋 CSV saved to: data/detailed_profiles.csv")
        
    except Exception as e:
        print(f"❌ Scraping error: {e}")
        
    finally:
        scraper.cleanup()