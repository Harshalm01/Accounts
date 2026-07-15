"""
Instagram Link Validator
Check which Instagram links are working vs broken
Display results on local web server
"""

import requests
import pandas as pd
from flask import Flask, render_template_string
import time
import random
from datetime import datetime
from urllib.parse import urlparse

class InstagramLinkValidator:
    def __init__(self):
        self.results = []
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-us,en;q=0.5',
            'Accept-Encoding': 'gzip,deflate',
            'Connection': 'keep-alive',
        }
    
    def clean_instagram_url(self, url):
        """Clean and standardize Instagram URLs"""
        if pd.isna(url) or not url:
            return None
            
        url = str(url).strip()
        
        # Handle common URL formats
        if not url.startswith('http'):
            if url.startswith('instagram.com/') or url.startswith('www.instagram.com/'):
                url = 'https://' + url
            elif url.startswith('@'):
                username = url[1:]
                url = f'https://instagram.com/{username}'
            else:
                # Assume it's just a username
                url = f'https://instagram.com/{url}'
        
        # Standardize to instagram.com (not www.instagram.com)
        url = url.replace('www.instagram.com', 'instagram.com')
        
        return url
    
    def check_instagram_link(self, url):
        """Check if Instagram link is working"""
        clean_url = self.clean_instagram_url(url)
        
        if not clean_url:
            return {
                'original_url': url,
                'clean_url': None,
                'status': 'Invalid URL',
                'status_code': None,
                'profile_exists': False,
                'error': 'Invalid or empty URL'
            }
        
        try:
            # Make request with timeout
            response = requests.get(clean_url, headers=self.headers, timeout=10, allow_redirects=True)
            
            # Check response
            status_code = response.status_code
            
            if status_code == 200:
                # Check if it's actually a profile page (not error page)
                content = response.text.lower()
                
                # Instagram shows "Sorry, this page isn't available" for broken profiles
                if any(error_text in content for error_text in [
                    "sorry, this page isn't available",
                    "page not found",
                    "user not found",
                    "this content isn't available"
                ]):
                    profile_exists = False
                    status = "Profile Not Found"
                elif "instagram" in content and ("profile" in content or "posts" in content):
                    profile_exists = True
                    status = "✅ Working"
                else:
                    profile_exists = False
                    status = "Unclear Response"
            
            elif status_code == 404:
                profile_exists = False
                status = "❌ Not Found (404)"
            elif status_code == 403:
                profile_exists = False  
                status = "❌ Forbidden (403)"
            elif status_code == 429:
                profile_exists = None
                status = "⚠️ Rate Limited (429)"
            else:
                profile_exists = False
                status = f"❌ Error ({status_code})"
            
            return {
                'original_url': url,
                'clean_url': clean_url,
                'status': status,
                'status_code': status_code,
                'profile_exists': profile_exists,
                'final_url': response.url,
                'error': None
            }
            
        except requests.exceptions.Timeout:
            return {
                'original_url': url,
                'clean_url': clean_url,
                'status': '⏱️ Timeout',
                'status_code': None,
                'profile_exists': False,
                'error': 'Request timeout'
            }
        except requests.exceptions.ConnectionError:
            return {
                'original_url': url,
                'clean_url': clean_url,
                'status': '🌐 Connection Error',
                'status_code': None,
                'profile_exists': False,
                'error': 'Connection failed'
            }
        except Exception as e:
            return {
                'original_url': url,
                'clean_url': clean_url,
                'status': '❌ Error',
                'status_code': None,
                'profile_exists': False,
                'error': str(e)
            }
    
    def validate_links_from_csv(self, csv_file_path):
        """Read CSV and validate all Instagram links"""
        print(f"📂 Reading links from: {csv_file_path}")
        
        try:
            # Read CSV file - assume first column contains URLs
            df = pd.read_csv(csv_file_path, header=None, names=['url'])
            urls = df['url'].tolist()
            
            print(f"🔗 Found {len(urls)} links to validate")
            
            results = []
            
            for i, url in enumerate(urls, 1):
                print(f"\n🔍 Checking {i}/{len(urls)}: {url}")
                
                result = self.check_instagram_link(url)
                result['check_order'] = i
                result['checked_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                
                results.append(result)
                
                print(f"   Status: {result['status']}")
                
                # Rate limiting to be respectful
                if i < len(urls):
                    sleep_time = random.uniform(2, 4)
                    print(f"   ⏳ Waiting {sleep_time:.1f}s...")
                    time.sleep(sleep_time)
            
            self.results = results
            
            # Save results
            results_df = pd.DataFrame(results)
            results_df.to_csv('data/link_validation_results.csv', index=False)
            
            print(f"\n📊 VALIDATION COMPLETE!")
            print(f"✅ Results saved: data/link_validation_results.csv")
            
            # Summary
            working = len([r for r in results if r['profile_exists']])
            broken = len([r for r in results if r['profile_exists'] == False])
            unclear = len([r for r in results if r['profile_exists'] is None])
            
            print(f"\n📈 SUMMARY:")
            print(f"✅ Working: {working}")
            print(f"❌ Broken: {broken}")
            print(f"⚠️  Unclear: {unclear}")
            print(f"📊 Total: {len(results)}")
            
            return results
            
        except Exception as e:
            print(f"❌ Error reading CSV: {e}")
            return []

# Flask Web Server for Results
app = Flask(__name__)

validator = None

@app.route('/')
def show_results():
    """Display link validation results"""
    
    if not validator or not validator.results:
        return """
        <h1>🔗 Instagram Link Validator</h1>
        <p>No results available. Please run link validation first.</p>
        <pre>python link_validator.py</pre>
        """
    
    results = validator.results
    
    # Calculate summary stats
    total_links = len(results)
    working_links = len([r for r in results if r['profile_exists']])
    broken_links = len([r for r in results if r['profile_exists'] == False])
    unclear_links = len([r for r in results if r['profile_exists'] is None])
    
    # Generate HTML report
    html_template = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Instagram Link Validation Report</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 40px; 
                background-color: #f5f5f5;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                border-radius: 10px;
                margin-bottom: 30px;
            }
            .stats {
                display: flex;
                justify-content: space-around;
                margin: 20px 0;
                flex-wrap: wrap;
            }
            .stat-card {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                min-width: 150px;
                text-align: center;
            }
            .stat-number {
                font-size: 2em;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .working { color: #28a745; }
            .broken { color: #dc3545; }
            .unclear { color: #ffc107; }
            
            table {
                width: 100%;
                border-collapse: collapse;
                background: white;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #e0e0e0;
            }
            th {
                background-color: #f8f9fa;
                font-weight: bold;
            }
            tr:hover {
                background-color: #f8f9fa;
            }
            .status-working { color: #28a745; font-weight: bold; }
            .status-broken { color: #dc3545; font-weight: bold; }
            .status-unclear { color: #ffc107; font-weight: bold; }
            
            .url-cell {
                max-width: 300px;
                word-break: break-all;
            }
            
            .footer {
                margin-top: 30px;
                text-align: center;
                color: #666;
                font-size: 0.9em;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🔗 Instagram Link Validation Report</h1>
            <p>Validation completed: {{ checked_time }}</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number working">{{ working_count }}</div>
                <div>✅ Working Links</div>
            </div>
            <div class="stat-card">
                <div class="stat-number broken">{{ broken_count }}</div>
                <div>❌ Broken Links</div>
            </div>
            <div class="stat-card">
                <div class="stat-number unclear">{{ unclear_count }}</div>
                <div>⚠️ Unclear Status</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{{ total_count }}</div>
                <div>📊 Total Links</div>
            </div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Original URL</th>
                    <th>Status</th>
                    <th>HTTP Code</th>
                    <th>Clean URL</th>
                    <th>Error</th>
                </tr>
            </thead>
            <tbody>
                {% for result in results %}
                <tr>
                    <td>{{ result.check_order }}</td>
                    <td class="url-cell">{{ result.original_url }}</td>
                    <td class="{% if result.profile_exists %}status-working{% elif result.profile_exists == False %}status-broken{% else %}status-unclear{% endif %}">
                        {{ result.status }}
                    </td>
                    <td>{{ result.status_code or 'N/A' }}</td>
                    <td class="url-cell">{{ result.clean_url or 'N/A' }}</td>
                    <td>{{ result.error or '-' }}</td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
        
        <div class="footer">
            <p>Generated by Instagram Link Validator | {{ total_count }} links checked</p>
        </div>
    </body>
    </html>
    """
    
    from flask import Markup
    import jinja2
    
    template = jinja2.Template(html_template)
    html_content = template.render(
        results=results,
        working_count=working_links,
        broken_count=broken_links,
        unclear_count=unclear_links,
        total_count=total_links,
        checked_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    
    return Markup(html_content)

def main():
    """Main function to run link validation"""
    global validator
    
    # Initialize validator
    validator = InstagramLinkValidator()
    
    # CSV file path
    csv_file = 'data/Testing/Testing Data - Sheet4.csv'
    
    print("🔗 Instagram Link Validator Starting...")
    
    # Validate links
    results = validator.validate_links_from_csv(csv_file)
    
    if results:
        print(f"\n🌐 Starting web server...")
        print(f"📊 View results at: http://localhost:5000")
        print(f"🔍 Press Ctrl+C to stop server")
        
        # Start Flask server
        try:
            app.run(host='0.0.0.0', port=5000, debug=False)
        except KeyboardInterrupt:
            print(f"\n🛑 Server stopped by user")
    else:
        print(f"❌ No results to display")

if __name__ == "__main__":
    main()