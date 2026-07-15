"""
Instagram Scraper - Main Execution Script
Complete solution for scraping Instagram profile data

Usage:
1. Run scraper: python run_scraper.py scrape
2. Start dashboard: python run_scraper.py dashboard
3. Both: python run_scraper.py all

Features:
- Scrapes Username, IG Link, Followers, Genre from Instagram profiles
- Saves results to CSV file
- Provides web dashboard for viewing results
- Rate limiting and error handling
"""

import sys
import os
import subprocess
import time
from pathlib import Path

def install_requirements():
    """Install required packages"""
    print("Installing required packages...")
    try:
        subprocess.check_call([
            sys.executable, '-m', 'pip', 'install', '-r', 'requirements_scraper.txt'
        ])
        print("✓ Requirements installed successfully")
        return True
    except Exception as e:
        print(f"✗ Error installing requirements: {e}")
        return False

def run_scraper():
    """Run the Instagram scraper"""
    print("\n" + "="*60)
    print("🕷️  STARTING INSTAGRAM SCRAPER")
    print("="*60)
    
    try:
        # Import and run scraper
        from instagram_scraper import main
        results = main()
        
        print("\n✓ Scraping completed successfully!")
        return True
        
    except ImportError:
        print("✗ Error: Could not import scraper. Installing requirements...")
        if install_requirements():
            print("Please run the script again.")
        return False
    except Exception as e:
        print(f"✗ Scraping failed: {e}")
        return False

def start_dashboard():
    """Start the Flask dashboard"""
    print("\n" + "="*60)
    print("🖥️  STARTING WEB DASHBOARD")
    print("="*60)
    
    try:
        # Import and run dashboard
        from instagram_dashboard import app
        print("Starting Flask server...")
        print("Dashboard URL: http://localhost:5000")
        print("Press Ctrl+C to stop the server")
        app.run(debug=False, host='0.0.0.0', port=5000)
        
    except ImportError:
        print("✗ Error: Could not import dashboard. Installing requirements...")
        if install_requirements():
            print("Please run the script again.")
        return False
    except Exception as e:
        print(f"✗ Dashboard failed: {e}")
        return False

def check_input_file():
    """Check if input CSV file exists"""
    input_file = Path("data/Testing/Testing Data - Sheet3.csv")
    
    if not input_file.exists():
        print(f"✗ Input file not found: {input_file}")
        print("Please make sure your Instagram URLs CSV file exists at:")
        print(f"   {input_file.absolute()}")
        return False
    
    print(f"✓ Input file found: {input_file}")
    return True

def show_help():
    """Show help information"""
    help_text = """
Instagram Scraper - Help

SETUP:
1. Make sure your Instagram URLs are in: data/Testing/Testing Data - Sheet3.csv
2. Install dependencies: pip install -r requirements_scraper.txt

COMMANDS:
  python run_scraper.py scrape     - Run the scraper only
  python run_scraper.py dashboard  - Start web dashboard only  
  python run_scraper.py all        - Run scraper then start dashboard
  python run_scraper.py help       - Show this help

OUTPUT:
- CSV file: data/scraped_instagram_profiles.csv
- Web dashboard: http://localhost:5000

SCRAPED DATA:
- Username
- Instagram Link
- Follower Count
- Genre (extracted from bio)
- Scraping Status

IMPORTANT NOTES:
⚠️  This scraper may violate Instagram's Terms of Service
⚠️  Use responsibly and at your own risk
⚠️  Instagram may block requests if rate limits are exceeded
⚠️  Some data may not be available due to privacy settings

RATE LIMITING:
- 2-4 second delay between requests
- Longer breaks every 10 profiles
- May take several minutes for large lists
"""
    print(help_text)

def main():
    """Main execution function"""
    if len(sys.argv) < 2:
        print("Instagram Scraper")
        print("Usage: python run_scraper.py [scrape|dashboard|all|help]")
        print("Run 'python run_scraper.py help' for more information")
        return
    
    command = sys.argv[1].lower()
    
    if command == 'help':
        show_help()
        return
    
    # Check if input file exists for scraping commands
    if command in ['scrape', 'all']:
        if not check_input_file():
            return
    
    if command == 'scrape':
        run_scraper()
        
    elif command == 'dashboard':
        start_dashboard()
        
    elif command == 'all':
        # Run scraper first, then dashboard
        if run_scraper():
            print("\n" + "="*60)
            print("🚀 Scraping completed! Starting dashboard...")
            print("="*60)
            time.sleep(2)
            start_dashboard()
        else:
            print("✗ Scraping failed. Dashboard not started.")
            
    else:
        print(f"Unknown command: {command}")
        print("Available commands: scrape, dashboard, all, help")

if __name__ == "__main__":
    main()