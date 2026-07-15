"""
Real Browser Check - See exactly what users see
Uses Selenium to check profiles like a real user
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import pandas as pd

def check_profile_with_browser(url):
    """Check profile using real browser to see what users see"""
    
    # Setup Chrome 
    chrome_options = Options()
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    
    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        print(f"🌐 Loading page with browser: {url}")
        driver.get(url)
        
        # Wait for page to load
        time.sleep(5)
        
        # Get page title and visible text
        page_title = driver.title
        page_source = driver.page_source.lower()
        
        print(f"Page Title: '{page_title}'")
        
        # Try to find visible text elements
        try:
            body_text = driver.find_element(By.TAG_NAME, 'body').text
            print(f"Body text length: {len(body_text)}")
            
            # Show first 500 characters of visible text
            visible_snippet = body_text[:500] if body_text else "No visible text"
            print(f"Visible text: {visible_snippet}...")
            
        except:
            body_text = ""
            print("Could not get body text")
        
        # Specifically look for error messages
        error_messages = [
            "Sorry, this page isn't available",
            "sorry, this page isn't available",
            "Page not found", 
            "User not found",
            "This content isn't available"
        ]
        
        found_error = None
        for error_msg in error_messages:
            if error_msg.lower() in page_source or error_msg.lower() in body_text.lower():
                found_error = error_msg
                print(f"❌ FOUND ERROR: '{error_msg}'")
                break
        
        # Look for profile indicators
        profile_indicators = [
            "followers", "following", "posts", "bio"
        ]
        
        found_indicators = []
        for indicator in profile_indicators:
            if indicator in body_text.lower():
                found_indicators.append(indicator)
        
        if found_indicators:
            print(f"✅ FOUND PROFILE INDICATORS: {', '.join(found_indicators)}")
        
        # Take a screenshot for reference
        try:
            screenshot_name = f"data/screenshot_{url.split('/')[-1]}.png"
            driver.save_screenshot(screenshot_name)
            print(f"📸 Screenshot saved: {screenshot_name}")
        except:
            pass
        
        # Final determination
        if found_error:
            result = f"❌ PROFILE NOT AVAILABLE - '{found_error}'"
        elif found_indicators:
            result = f"✅ PROFILE AVAILABLE - Found: {', '.join(found_indicators)}"
        elif "login" in body_text.lower() or "sign up" in body_text.lower():
            result = f"🔒 LOGIN REQUIRED - Profile may exist but needs authentication"
        else:
            result = f"⚠️ UNCLEAR - No clear indicators"
        
        print(f"\n🎯 BROWSER RESULT: {result}")
        return result
        
    except Exception as e:
        print(f"❌ Browser error: {e}")
        return f"❌ BROWSER ERROR: {e}"
        
    finally:
        driver.quit()

def check_all_profiles_with_browser(csv_file):
    """Check all profiles using browser automation"""
    
    print("🌐 REAL BROWSER PROFILE CHECKER")
    print("="*50)
    
    # Read CSV
    df = pd.read_csv(csv_file, header=None, names=['url'])
    urls = df['url'].tolist()
    
    results = []
    
    for i, url in enumerate(urls, 1):
        print(f"\n📱 Profile {i}/{len(urls)}")
        
        # Clean URL
        clean_url = str(url).strip()
        if not clean_url.startswith('http'):
            if 'instagram.com/' not in clean_url:
                clean_url = f"https://instagram.com/{clean_url}"
            else:
                clean_url = f"https://{clean_url}"
        
        result = check_profile_with_browser(clean_url)
        
        results.append({
            'order': i,
            'original_url': url,
            'clean_url': clean_url,
            'browser_result': result,
            'checked_at': time.strftime("%Y-%m-%d %H:%M:%S")
        })
        
        print(f"Result: {result}")
        
        # Delay between checks
        if i < len(urls):
            print(f"⏳ Waiting 3 seconds...")
            time.sleep(3)
    
    # Save results
    results_df = pd.DataFrame(results)
    results_df.to_csv('data/browser_check_results.csv', index=False)
    
    print(f"\n📊 BROWSER CHECK COMPLETE!")
    print(f"📄 Results saved: data/browser_check_results.csv")
    
    # Summary
    available = len([r for r in results if '✅' in r['browser_result']])
    unavailable = len([r for r in results if '❌' in r['browser_result']])
    unclear = len(results) - available - unavailable
    
    print(f"\n✅ Available: {available}")
    print(f"❌ Unavailable: {unavailable}") 
    print(f"⚠️ Unclear: {unclear}")
    
    return results

def main():
    """Check ALL profiles from final CSV with browser for accurate results"""
    
    csv_file = 'data/Testing/Testing Data - final.csv'
    results = check_all_profiles_with_browser(csv_file)

if __name__ == "__main__":
    main()