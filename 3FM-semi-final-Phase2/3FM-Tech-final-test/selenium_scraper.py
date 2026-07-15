"""
Enhanced Instagram Scraper using Selenium
Better success rate for follower counts

Install: pip install selenium webdriver-manager
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time
import random
import pandas as pd
from datetime import datetime
import re

class SeleniumInstagramScraper:
    def __init__(self):
        chrome_options = Options()
        # Comment out headless to see the browser (for debugging)
        # chrome_options.add_argument("--headless")  
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        
        try:
            from webdriver_manager.chrome import ChromeDriverManager
            from selenium.webdriver.chrome.service import Service
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
        except:
            # Fallback to system ChromeDriver
            self.driver = webdriver.Chrome(options=chrome_options)
        
        self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        self.wait = WebDriverWait(self.driver, 15)
    
    def get_follower_count_from_profile(self, url):
        """Extract follower count using Selenium"""
        try:
            print(f"Loading: {url}")
            self.driver.get(url)
            
            # Wait for page to load
            time.sleep(random.uniform(3, 6))
            
            username = self.extract_username_from_url(url)
            
            # Try multiple selectors for follower count
            follower_selectors = [
                "//a[contains(@href, '/followers/')]/span",
                "//a[contains(@href, '/followers/')]",
                "//*[contains(text(), 'followers')]",
                "//span[contains(@title, 'followers')]",
                "//*[@class='_ac2a']",  # Common Instagram class
                "//*[contains(@class, 'x1i10hfl')]//span",
            ]
            
            followers = "Not found"
            
            for selector in follower_selectors:
                try:
                    elements = self.driver.find_elements(By.XPATH, selector)
                    for element in elements:
                        text = element.get_attribute('title') or element.text
                        if text and ('follower' in text.lower() or re.search(r'[\d,]+[KM]?', text)):
                            followers = self.clean_follower_count(text)
                            if followers != "Not found":
                                break
                    if followers != "Not found":
                        break
                except:
                    continue
            
            # Try to get bio for genre detection
            bio = self.extract_bio()
            genre = self.detect_genre_from_bio(bio)
            
            return {
                'username': username,
                'ig_link': url,
                'followers': followers,
                'avg_views': 'Requires post analysis',
                'genre': genre,
                'bio': bio[:100] + '...' if bio and len(bio) > 100 else bio,
                'status': 'Success' if followers != "Not found" else 'Partial'
            }
            
        except Exception as e:
            return {
                'username': self.extract_username_from_url(url),
                'ig_link': url,
                'followers': 'Error',
                'avg_views': 'Error',
                'genre': 'Error',
                'bio': 'Error',
                'status': f'Error: {str(e)}'
            }
    
    def extract_bio(self):
        """Extract bio text"""
        bio_selectors = [
            "//div[contains(@class, 'x11i5rnm')]//span",
            "//div[@class='_aa_c']//span",
            "//*[@data-testid='user-description']",
            "//h1/../following-sibling::div//span"
        ]
        
        for selector in bio_selectors:
            try:
                elements = self.driver.find_elements(By.XPATH, selector)
                for element in elements:
                    text = element.text.strip()
                    if text and len(text) > 10:  # Assuming bio is longer than 10 chars
                        return text
            except:
                continue
        return "Not found"
    
    def clean_follower_count(self, text):
        """Clean and format follower count with proper K/M conversion"""
        if not text:
            return "Not found"
        
        # Remove 'followers' text and clean
        text = text.lower().replace('followers', '').replace('follower', '').strip()
        
        # Look for numbers with K/M (improved regex for decimals)
        match = re.search(r'([\d,]+\.?[\d]*)([km]?)', text)
        if match:
            number, suffix = match.groups()
            number = number.replace(',', '')
            try:
                num = float(number)
                if suffix == 'k':
                    # Convert K to thousands and floor the result
                    # Example: 195K -> 195000, 19.5K -> 19500 (floored to 19500)
                    result = int(num * 1000)
                    return f"{result:,}"
                elif suffix == 'm':
                    # Convert M to millions and floor the result  
                    # Example: 1.2M -> 1200000
                    result = int(num * 1000000)
                    return f"{result:,}"
                else:
                    # No suffix, just return as integer
                    return f"{int(num):,}"
            except:
                pass
        
        return "Not found"
    
    def detect_genre_from_bio(self, bio):
        """Detect genre from bio text"""
        if not bio or bio == "Not found":
            return "Not found"
        
        bio_lower = bio.lower()
        
        genre_keywords = {
            'Fashion': ['fashion', 'style', 'outfit', 'clothing', 'designer', 'model'],
            'Food': ['food', 'chef', 'cooking', 'recipe', 'restaurant', 'foodie'],
            'Travel': ['travel', 'wanderlust', 'explorer', 'adventure', 'journey'],
            'Fitness': ['fitness', 'gym', 'workout', 'health', 'yoga', 'trainer'],
            'Beauty': ['beauty', 'makeup', 'cosmetics', 'skincare', 'beautician'],
            'Lifestyle': ['lifestyle', 'daily', 'life', 'vlog', 'blogger'],
            'Tech': ['tech', 'technology', 'gadgets', 'coding', 'developer'],
            'Music': ['music', 'musician', 'singer', 'artist', 'band'],
            'Comedy': ['comedy', 'funny', 'humor', 'comedian', 'memes'],
            'Business': ['entrepreneur', 'business', 'startup', 'ceo', 'founder'],
            'Photography': ['photographer', 'photography', 'photos', 'camera'],
            'Art': ['art', 'artist', 'creative', 'design', 'painter'],
            'Dance': ['dance', 'dancer', 'choreographer', 'dancing'],
            'Family': ['family', 'mom', 'dad', 'parent', 'kids', 'baby']
        }
        
        found_genres = []
        for genre, keywords in genre_keywords.items():
            if any(keyword in bio_lower for keyword in keywords):
                found_genres.append(genre)
        
        return ' | '.join(found_genres) if found_genres else 'Lifestyle'
    
    def extract_username_from_url(self, url):
        """Extract username from URL"""
        try:
            from urllib.parse import urlparse
            path = urlparse(url).path.strip('/')
            return path.split('/')[0] if path else 'Unknown'
        except:
            return 'Unknown'
    
    def scrape_profiles(self, urls, delay_range=(5, 10)):
        """Scrape multiple profiles"""
        results = []
        
        for i, url in enumerate(urls, 1):
            print(f"\nProcessing {i}/{len(urls)}: {url}")
            
            result = self.get_follower_count_from_profile(url)
            results.append(result)
            
            if result['status'] == 'Success':
                print(f"✓ {result['username']}: {result['followers']} followers")
            else:
                print(f"✗ {result['status']}")
            
            # Random delay to avoid detection
            if i < len(urls):
                delay = random.uniform(delay_range[0], delay_range[1])
                print(f"Waiting {delay:.1f} seconds...")
                time.sleep(delay)
        
        return results
    
    def close(self):
        """Close the browser"""
        self.driver.quit()

# Main execution function
def run_selenium_scraper():
    """Run the enhanced Selenium scraper"""
    
    # Read URLs from CSV
    csv_file = r"c:\3 Folks Media\data\Testing\Testing Data - Sheet3.csv"
    
    urls = []
    try:
        with open(csv_file, 'r', encoding='utf-8') as file:
            content = file.read().strip()
            urls = [url.strip() for url in content.split('\n') if url.strip()]
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return
    
    print(f"Found {len(urls)} URLs to scrape with Selenium")
    
    scraper = SeleniumInstagramScraper()
    
    try:
        # Scrape ALL profiles (change from 5 to all)
        results = scraper.scrape_profiles(urls)
        
        # Save results
        df = pd.DataFrame(results)
        output_file = r"c:\3 Folks Media\data\selenium_instagram_results.csv"
        df.to_csv(output_file, index=False)
        
        print(f"\n=== SELENIUM SCRAPING COMPLETE ===")
        print(f"Processed: {len(results)} profiles")
        print(f"Successful: {len([r for r in results if r['status'] == 'Success'])}")
        print(f"Results saved to: {output_file}")
        
    finally:
        scraper.close()

if __name__ == "__main__":
    run_selenium_scraper()