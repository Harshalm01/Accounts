"""
Simple Instagram Link Checker
Quick validation with local server report
"""

import requests
import pandas as pd
from flask import Flask, render_template_string
import time
from datetime import datetime

app = Flask(__name__)

# Global variable to store results
validation_results = []

def check_links_from_csv():
    """Check Instagram links from CSV file"""
    global validation_results
    
    csv_file = 'data/Testing/Testing Data - Sheet4.csv'
    
    print(f"🔗 Checking Instagram links...")
    
    try:
        # Read the CSV file
        df = pd.read_csv(csv_file, header=None, names=['url'])
        urls = df['url'].tolist()
        
        results = []
        
        for i, url in enumerate(urls, 1):
            print(f"Checking {i}/{len(urls)}: {url}")
            
            # Clean URL
            clean_url = str(url).strip()
            if not clean_url.startswith('http'):
                clean_url = clean_url.replace('instagram.com/', 'https://instagram.com/')
                if not clean_url.startswith('https://'):
                    clean_url = f"https://{clean_url}"
            
            try:
                # GET request to check if profile actually exists
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
                response = requests.get(clean_url, headers=headers, timeout=15, allow_redirects=True)
                
                if response.status_code == 200:
                    # Check page content thoroughly for profile availability
                    content = response.text.lower()
                    
                    # Comprehensive list of "profile not available" indicators
                    error_indicators = [
                        "sorry, this page isn't available",
                        "sorry, this page isn't available.",
                        "profile isn't available",
                        "page isn't available", 
                        "page not found", 
                        "user not found",
                        "this content isn't available",
                        "this account doesn't exist",
                        "the link you followed may be broken",
                        "the link may be broken",
                        "the profile may have been removed",
                        "this page could not be found",
                        "account has been disabled",
                        "account has been suspended",
                        "account has been deactivated",
                        "user has been suspended",
                        "content isn't available"
                    ]
                    
                    # Check for error indicators first
                    profile_unavailable = False
                    found_error = ""
                    
                    for error_text in error_indicators:
                        if error_text in content:
                            status = f"❌ Profile Not Available ({error_text})"
                            working = False
                            profile_unavailable = True
                            found_error = error_text
                            break
                    
                    # If no error found, verify it's actually a valid profile
                    if not profile_unavailable:
                        # Look for positive profile indicators
                        profile_indicators = [
                            '"followers"',
                            '"following"',
                            '"posts"',
                            'followers</span>',
                            'following</span>',
                            'posts</span>',
                            'follower_count',
                            'post_count',
                            '"username"',
                            'profile_pic_url'
                        ]
                        
                        has_profile_indicators = any(indicator in content for indicator in profile_indicators)
                        
                        if has_profile_indicators:
                            status = "✅ Profile Available & Active"
                            working = True
                        else:
                            # Page loads but doesn't look like a profile
                            status = "⚠️ Unclear - May be broken"
                            working = False
                            
                elif response.status_code == 404:
                    status = "❌ URL Not Found (404)"
                    working = False
                elif response.status_code == 403:
                    status = "⚠️ Access Blocked (403)"
                    working = False
                else:
                    status = f"❌ HTTP Error ({response.status_code})"
                    working = False
                    
            except requests.exceptions.Timeout:
                status = "⏱️ Timeout"
                working = False
            except requests.exceptions.ConnectionError:
                status = "🌐 Connection Error"
                working = False
            except Exception as e:
                status = f"❌ Error"
                working = False
            
            result = {
                'order': i,
                'original_url': url,
                'clean_url': clean_url,
                'status': status,
                'working': working,
                'checked_at': datetime.now().strftime("%H:%M:%S")
            }
            
            results.append(result)
            print(f"  → {status}")
            
            # Small delay to be respectful and allow proper page loading
            time.sleep(2)
        
        validation_results = results
        
        # Save results
        results_df = pd.DataFrame(results)
        results_df.to_csv('data/link_check_results.csv', index=False)
        
        working_count = len([r for r in results if r['working']])
        broken_count = len([r for r in results if not r['working']])
        
        print(f"\n📊 SUMMARY:")
        print(f"✅ Working: {working_count}")
        print(f"❌ Broken: {broken_count}")
        print(f"📄 Results saved: data/link_check_results.csv")
        
        return results
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return []

@app.route('/')
def show_report():
    """Display link validation report"""
    
    if not validation_results:
        return """
        <div style="text-align: center; margin: 50px; font-family: Arial;">
            <h2>🔗 Instagram Link Checker</h2>
            <p style="color: #666;">No validation results available.</p>
            <p>Please run the validation first.</p>
        </div>
        """
    
    working_links = [r for r in validation_results if r['working']]
    broken_links = [r for r in validation_results if not r['working']]
    
    html_template = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Link Validation Report</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                background: #f8f9fa;
            }
            .header {
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                padding: 20px;
                border-radius: 10px;
                text-align: center;
            }
            .stats {
                display: flex;
                gap: 20px;
                margin: 20px 0;
                justify-content: center;
                flex-wrap: wrap;
            }
            .stat-card {
                background: white;
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                min-width: 120px;
            }
            .stat-number {
                font-size: 2.5em;
                font-weight: bold;
                margin-bottom: 5px;
            }
            .working { color: #28a745; }
            .broken { color: #dc3545; }
            
            table {
                width: 100%;
                background: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                border-collapse: collapse;
            }
            th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #e9ecef;
            }
            th {
                background: #f8f9fa;
                font-weight: bold;
            }
            .url-column {
                max-width: 300px;
                word-break: break-all;
                font-family: monospace;
                font-size: 0.9em;
            }
            .status-working { color: #28a745; font-weight: bold; }
            .status-broken { color: #dc3545; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🔗 Instagram Link Validation Report</h1>
            <p>Validated {{ total_links }} links at {{ timestamp }}</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number working">{{ working_count }}</div>
                <div>✅ Working</div>
            </div>
            <div class="stat-card">
                <div class="stat-number broken">{{ broken_count }}</div>
                <div>❌ Broken</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{{ total_links }}</div>
                <div>📊 Total</div>
            </div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Original URL</th>
                    <th>Clean URL</th>
                    <th>Status</th>
                    <th>Time</th>
                </tr>
            </thead>
            <tbody>
                {% for result in results %}
                <tr>
                    <td>{{ result.order }}</td>
                    <td class="url-column">{{ result.original_url }}</td>
                    <td class="url-column">{{ result.clean_url }}</td>
                    <td class="{% if result.working %}status-working{% else %}status-broken{% endif %}">
                        {{ result.status }}
                    </td>
                    <td>{{ result.checked_at }}</td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
    </body>
    </html>
    """
    
    from jinja2 import Template
    template = Template(html_template)
    
    return template.render(
        results=validation_results,
        working_count=len(working_links),
        broken_count=len(broken_links),
        total_links=len(validation_results),
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )

def main():
    """Main function"""
    print("🚀 Instagram Link Checker Starting...")
    
    # Check the links first
    results = check_links_from_csv()
    
    if results:
        print(f"\n🌐 Starting web server...")
        print(f"📊 Open browser: http://localhost:5001")
        print(f"🔧 Press Ctrl+C to stop")
        
        try:
            app.run(host='127.0.0.1', port=5001, debug=False)
        except KeyboardInterrupt:
            print(f"\n✅ Server stopped")
    else:
        print(f"❌ No results to show")

if __name__ == "__main__":
    main()