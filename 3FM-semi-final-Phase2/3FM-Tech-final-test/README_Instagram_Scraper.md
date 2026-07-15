# Instagram Profile Scraper

A complete solution for scraping Instagram profile data including followers, usernames, and genres.

## ⚠️ Important Disclaimer

**This tool may violate Instagram's Terms of Service. Use responsibly and at your own risk.**

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements_scraper.txt
```

### 2. Prepare Your Data
Make sure your Instagram URLs are in the CSV file:
```
c:\3 Folks Media\data\Testing\Testing Data - Sheet3.csv
```

### 3. Run the Scraper
```bash
# Option 1: Run scraper only
python run_scraper.py scrape

# Option 2: Start web dashboard only
python run_scraper.py dashboard

# Option 3: Run scraper then start dashboard
python run_scraper.py all
```

## 📊 What Gets Scraped

- **Username** - Instagram handle
- **IG Link** - Profile URL
- **Followers** - Follower count
- **Genre** - Content category (extracted from bio)
- **Status** - Scraping success/failure

## 📁 Output Files

- **CSV File**: `data/scraped_instagram_profiles.csv`
- **Web Dashboard**: `http://localhost:5000`

## 🔧 Features

### Instagram Scraper (`instagram_scraper.py`)
- BeautifulSoup-based scraping
- Rate limiting to avoid blocks
- Error handling and retry logic
- Genre detection from profile bio
- Progress tracking

### Web Dashboard (`instagram_dashboard.py`)
- Real-time data visualization
- Summary statistics
- Genre breakdown
- Data export functionality
- REST API endpoints

### Main Controller (`run_scraper.py`)  
- Easy command-line interface
- Automated setup and execution
- Help and status information

## 🌐 Dashboard Features

Once you start the dashboard (`http://localhost:5000`), you can:

- View summary statistics
- Browse all scraped profiles
- Download CSV data
- See genre breakdowns
- Access REST API at `/api/data`

## ⚙️ Technical Details

### Rate Limiting
- 2-4 second delays between requests
- Longer breaks every 10 profiles
- Random delays to appear more human

### Error Handling
- Network timeout protection
- HTTP error code handling
- Graceful failure recovery
- Detailed status reporting

### Data Processing
- URL cleaning and validation
- Username extraction
- Follower count formatting
- Genre keyword detection

## 🔍 Alternative: Selenium Version

For JavaScript-heavy content, you can use Selenium:

```bash
pip install selenium webdriver-manager
```

The code includes a Selenium template for more robust scraping.

## 📈 Performance

- **Speed**: ~2-4 profiles per minute (with rate limiting)
- **Accuracy**: Depends on profile privacy settings
- **Success Rate**: ~70-90% for public profiles

## 🛠️ Customization

### Adding More Data Points
Edit `instagram_scraper.py` to extract additional profile information.

### Changing Rate Limits
Modify delay values in the `scrape_profile_basic()` method.

### Custom Output Format
Modify `save_results_to_csv()` to change output structure.

## 📋 Sample Output

```csv
username,ig_link,followers,avg_views,genre,status,scraped_at
johndoe,https://instagram.com/johndoe/,1500,Not available,Fashion | Lifestyle,Success,2024-01-15 10:30:00
```

## 🚨 Limitations

1. **Instagram's Anti-Bot Measures**: May get blocked after many requests
2. **JavaScript Content**: Some data requires browser automation
3. **Privacy Settings**: Can't access private account data
4. **Rate Limits**: Must respect Instagram's usage policies
5. **Terms of Service**: May violate Instagram's ToS

## 🔧 Troubleshooting

### Common Issues:

**"No data found"**
- Instagram might be blocking requests
- Profile might be private
- Network connectivity issues

**"HTTP 429 Error"**  
- Rate limited by Instagram
- Wait longer between requests
- Use VPN to change IP

**"Module not found"**
- Run: `pip install -r requirements_scraper.txt`

## 📞 Support

For issues or questions:
1. Check the console output for error messages
2. Verify Instagram URLs are accessible in browser
3. Ensure all dependencies are installed

---

**Remember**: Always respect website terms of service and use scrapers responsibly!