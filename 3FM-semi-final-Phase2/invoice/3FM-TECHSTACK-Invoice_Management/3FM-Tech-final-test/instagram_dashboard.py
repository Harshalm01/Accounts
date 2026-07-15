"""
Local Flask Web Server for Instagram Scraper Results
Provides a web interface to view scraped data
"""

from flask import Flask, render_template, request, jsonify, send_file
import pandas as pd
import os
from datetime import datetime
import json

app = Flask(__name__)

class InstagramDataServer:
    def __init__(self):
        # Try to load the newer Selenium results first, then fallback to basic scraper
        self.selenium_file = r"c:\3 Folks Media\data\selenium_instagram_results.csv"
        self.basic_file = r"c:\3 Folks Media\data\scraped_instagram_profiles.csv"
        self.data = None
        self.load_data()
    
    def load_data(self):
        """Load scraped data from CSV - prioritize Accurate results"""
        try:
            # Check for Accurate scraper results first (NEW!)
            accurate_file = r"c:\3 Folks Media\data\accurate_test_results.csv"
            ultimate_file = r"c:\3 Folks Media\data\ultimate_test_results.csv"
            
            if os.path.exists(accurate_file):
                self.data = pd.read_csv(accurate_file)
                self.data_source = "🎯 Accurate Scraper (Quality Focused)"
                print(f"Loaded {len(self.data)} profiles from Accurate results: {accurate_file}")
            elif os.path.exists(ultimate_file):
                self.data = pd.read_csv(ultimate_file)
                self.data_source = "Ultimate Scraper (8 Fields)"
                print(f"Loaded {len(self.data)} profiles from Ultimate results: {ultimate_file}")
            elif os.path.exists(self.selenium_file):
                self.data = pd.read_csv(self.selenium_file)
                self.data_source = "Selenium Scraper (Enhanced)"
                print(f"Loaded {len(self.data)} profiles from Selenium results: {self.selenium_file}")
            elif os.path.exists(self.basic_file):
                self.data = pd.read_csv(self.basic_file) 
                self.data_source = "Basic Scraper"
                print(f"Loaded {len(self.data)} profiles from basic results: {self.basic_file}")
            else:
                print(f"No data files found")
                self.data = pd.DataFrame()
                self.data_source = "No Data"
        except Exception as e:
            print(f"Error loading data: {e}")
            self.data = pd.DataFrame()
            self.data_source = "Error"
    
    def get_summary_stats(self):
        """Get summary statistics - handles both old and new data formats"""
        if self.data.empty:
            return {}
        
        total_profiles = len(self.data)
        
        # Check data format and calculate success rate accordingly
        if 'engagement_rate' in self.data.columns:
            # Ultimate scraper data - count non-error entries
            successful_scrapes = len(self.data[~self.data['username'].str.contains('error', case=False, na=False)])
        else:
            # Old scraper data - use status column
            successful_scrapes = len(self.data[self.data.get('status', '') == 'Success'])
        
        # Get the appropriate successful data
        if 'engagement_rate' in self.data.columns:
            successful_data = self.data[~self.data['username'].str.contains('error', case=False, na=False)].copy()
        else:
            successful_data = self.data[self.data.get('status', '') == 'Success'].copy()
        
        follower_stats = {}
        if not successful_data.empty and 'followers' in successful_data.columns:
            # Convert follower counts to numeric (handle comma-separated values)
            follower_counts = []
            for followers in successful_data['followers']:
                if isinstance(followers, (int, float)):
                    follower_counts.append(int(followers))
                elif isinstance(followers, str) and followers not in ['Not found', 'Error']:
                    try:
                        # Remove commas and convert to int
                        count = int(str(followers).replace(',', ''))
                        follower_counts.append(count)
                    except:
                        pass
            
            if follower_counts:
                follower_counts = sorted(follower_counts)
                follower_stats = {
                    'min': f"{follower_counts[0]:,}",
                    'max': f"{follower_counts[-1]:,}",
                    'median': f"{follower_counts[len(follower_counts)//2]:,}",
                    'total_followers': f"{sum(follower_counts):,}",
                    'avg_followers': f"{sum(follower_counts)//len(follower_counts):,}"
                }
        
        return {
            'total_profiles': total_profiles,
            'successful_scrapes': successful_scrapes,
            'success_rate': f"{(successful_scrapes/total_profiles*100):.1f}%" if total_profiles > 0 else "0%",
            'follower_stats': follower_stats,
            'data_source': getattr(self, 'data_source', 'Unknown'),
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
    
    def get_genre_breakdown(self):
        """Get breakdown of genres - handles both old and new data formats"""
        if self.data.empty:
            return {}
        
        # Check data format and get successful data accordingly  
        if 'engagement_rate' in self.data.columns:
            # Ultimate scraper data - use all non-error entries
            successful_data = self.data[~self.data['username'].str.contains('error', case=False, na=False)]
        else:
            # Old scraper data - use Success status
            successful_data = self.data[self.data.get('status', '') == 'Success']
        
        genres = {}
        
        if 'genre' in successful_data.columns:
            for genre_text in successful_data['genre']:
                if isinstance(genre_text, str) and genre_text not in ['Not found', 'Analysis needed', 'Unknown']:
                    # Split by | for multiple genres
                    genre_list = [g.strip() for g in genre_text.split('|')]
                    for genre in genre_list:
                        if genre:
                            genres[genre] = genres.get(genre, 0) + 1
        
        return dict(sorted(genres.items(), key=lambda x: x[1], reverse=True))

# Initialize data server
data_server = InstagramDataServer()

@app.route('/')
def home():
    """Main dashboard page"""
    summary = data_server.get_summary_stats()
    genre_breakdown = data_server.get_genre_breakdown()
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Instagram Scraper Dashboard</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }}
            .container {{ max-width: 1200px; margin: 0 auto; }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 30px; }}
            .stats-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
                          gap: 20px; margin-bottom: 30px; }}
            .stat-card {{ background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .stat-number {{ font-size: 2em; font-weight: bold; color: #667eea; }}
            .stat-label {{ color: #666; margin-top: 5px; }}
            .table-container {{ background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            table {{ width: 100%; border-collapse: collapse; }}
            th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
            th {{ background-color: #f8f9fa; font-weight: bold; }}
            .btn {{ background: #667eea; color: white; padding: 10px 20px; 
                   text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 5px; }}
            .btn:hover {{ background: #5a6fd8; }}
            .genre-list {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }}
            .genre-item {{ background: #f8f9fa; padding: 10px; border-radius: 5px; 
                          display: flex; justify-content: space-between; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 Instagram Scraper Dashboard</h1>
                <p>Real-time data from scraped Instagram profiles</p>
                <p style="font-size: 14px; opacity: 0.8;">Data Source: {summary.get('data_source', 'Unknown')}</p>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">{summary.get('total_profiles', 0)}</div>
                    <div class="stat-label">Total Profiles</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">{summary.get('successful_scrapes', 0)}</div>
                    <div class="stat-label">Successfully Scraped</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">{summary.get('success_rate', '0%')}</div>
                    <div class="stat-label">Success Rate</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">{summary.get('follower_stats', {}).get('total_followers', '0')}</div>
                    <div class="stat-label">Total Followers</div>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <a href="/data" class="btn">📋 View All Data</a>
                <a href="/download" class="btn">💾 Download CSV</a>
                <a href="/download-excel" class="btn">📊 Download Excel</a>
                <a href="/api/data" class="btn">🔗 JSON API</a>
                <button onclick="location.reload()" class="btn">🔄 Refresh</button>
            </div>
            
            <div class="table-container">
                <h3>📈 Genre Breakdown</h3>
                <div class="genre-list">
                    {''.join([f'<div class="genre-item"><span>{genre}</span><span><strong>{count}</strong></span></div>' 
                             for genre, count in genre_breakdown.items()])}
                </div>
            </div>
            
            <div class="table-container" style="margin-top: 20px;">
                <h3>📊 Ultimate Scraper Results Preview</h3>
                <p>Last updated: {summary.get('last_updated', 'Never')}</p>
                <div style="overflow-x: auto;">
                <table style="font-size: 12px;">
                    <tr>
                        <th>Username</th>
                        <th>Followers</th>
                        <th>Engagement Rate</th>
                        <th>Genre</th>
                        <th>Gender</th>
                        <th>Location</th>
                        <th>Contact</th>
                        <th>Avg Views</th>
                    </tr>
                    {''.join([f'''<tr>
                        <td style="font-weight: bold;">@{row.get("username", "N/A")}</td>
                        <td style="color: #e91e63;">{f"{row.get('followers', 0):,}" if isinstance(row.get("followers"), (int, float)) else row.get("followers", "N/A")}</td>
                        <td style="color: #4caf50;">{row.get("engagement_rate", "N/A")}</td>
                        <td style="color: #ff9800;">{str(row.get("genre", "N/A"))[:30]}...</td>
                        <td style="color: #9c27b0;">{row.get("gender", "N/A")}</td>
                        <td style="color: #2196f3;">{row.get("location", "N/A")}</td>
                        <td style="color: #607d8b; font-size: 10px;">{str(row.get("contact_email", "N/A"))[:25]}...</td>
                        <td style="color: #795548;">{row.get("avg_views", "N/A")}</td>
                    </tr>''' 
                             for _, row in data_server.data.head(5).iterrows()]) if not data_server.data.empty else '<tr><td colspan="8">No data available</td></tr>'}
                </table>
                </div>
            </div>
            
            <div class="detailed-profiles-section" style="margin-top: 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3>🎯 Detailed Profile Analysis (Top 3)</h3>
                    <button onclick="loadDetailedProfiles()" style="background: #28a745; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer;">Load Detailed Data</button>
                </div>
                <div id="detailed-profiles-container" style="display: none;">
                    <p style="color: #666;">Click "Load Detailed Data" to fetch comprehensive profile information...</p>
                </div>
            </div>
        </div>
        
        <script>
        async function loadDetailedProfiles() {{
            const container = document.getElementById('detailed-profiles-container');
            container.style.display = 'block';
            container.innerHTML = '<p style="color: #007bff;">🔄 Loading detailed profile data...</p>';
            
            try {{
                const response = await fetch('/detailed_profiles');
                const profiles = await response.json();
                
                if (profiles.length === 0) {{
                    container.innerHTML = `<div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px;">
                            <strong>📋 No detailed data available yet</strong><br>
                            Run the detailed scraper first: <code>python detailed_profile_scraper.py</code>
                        </div>`;
                }} else {{
                    let profilesHTML = '';
                    profiles.forEach(profile => {{
                        profilesHTML += `<div style="background: white; border: 1px solid #ddd; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                <div>
                                    <h4 style="margin: 0; color: #333;">@${{profile.username}}</h4>
                                    <p style="margin: 5px 0; color: #666; font-weight: bold;">${{profile.full_name || 'Name not found'}}</p>
                                    ${{profile.verified ? '<span style="color: #1da1f2;">✓ Verified</span>' : ''}}
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 24px; font-weight: bold; color: #e91e63;">${{typeof profile.followers === 'number' ? profile.followers.toLocaleString() : profile.followers || 'N/A'}}</div>
                                    <div style="color: #666; font-size: 12px;">FOLLOWERS</div>
                                </div>
                            </div>
                            
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                                <strong>📝 Bio:</strong><br>
                                <span style="font-style: italic;">${{profile.bio || 'No bio available'}}</span>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 15px;">
                                <div><strong>👥 Following:</strong> ${{profile.following || 'N/A'}}</div>
                                <div><strong>📸 Posts:</strong> ${{profile.posts_count || 'N/A'}}</div>
                                <div><strong>🌐 Website:</strong> ${{profile.website || 'None'}}</div>
                                <div><strong>📧 Email:</strong> ${{profile.contact_email || 'Not found'}}</div>
                            </div>
                            
                            <div style="background: #e7f3ff; padding: 10px; border-radius: 5px; font-size: 14px;">
                                <strong>📊 Engagement Analysis:</strong><br>
                                Avg Likes: ${{profile.avg_likes || 'Analyzing...'}} | 
                                Avg Comments: ${{profile.avg_comments || 'Analyzing...'}} | 
                                Contact Button: ${{profile.has_contact_button ? '✅ Yes' : '❌ No'}}
                            </div>
                            
                            <div style="margin-top: 15px; font-size: 12px; color: #999;">
                                🕐 Scraped: ${{new Date(profile.scraped_at).toLocaleString()}}
                            </div>
                        </div>`;
                    }});
                    
                    container.innerHTML = profilesHTML;
                }}
            }} catch (error) {{
                container.innerHTML = '<div style="color: red;">❌ Error loading detailed profiles: ' + error.message + '</div>';
            }}
        }}
        </script>
    </body>
    </html>
    """

@app.route('/data')
def view_data():
    """View all scraped data in table format"""
    if data_server.data.empty:
        return "<h2>No data available. Run the scraper first.</h2>"
    
    html_table = data_server.data.to_html(classes='table', table_id='dataTable', escape=False)
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>All Instagram Data</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 20px; }}
            .table {{ border-collapse: collapse; width: 100%; }}
            .table th, .table td {{ padding: 8px; text-align: left; border: 1px solid #ddd; }}
            .table th {{ background-color: #f2f2f2; }}
            .btn {{ background: #007bff; color: white; padding: 10px 20px; 
                   text-decoration: none; border-radius: 5px; margin: 10px 0; display: inline-block; }}
        </style>
    </head>
    <body>
        <h1>All Instagram Profile Data</h1>
        <a href="/" class="btn">← Back to Dashboard</a>
        <br><br>
        {html_table}
    </body>
    </html>
    """

@app.route('/api/data')
def api_data():
    """API endpoint to get data as JSON"""
    if data_server.data.empty:
        return jsonify({'error': 'No data available'})
    
    return jsonify({
        'data': data_server.data.to_dict('records'),
        'summary': data_server.get_summary_stats(),
        'genre_breakdown': data_server.get_genre_breakdown()
    })

@app.route('/detailed_profiles')
def detailed_profiles():
    """Get detailed profile information"""
    try:
        # Load detailed profiles if available
        if os.path.exists('data/detailed_profiles.json'):
            with open('data/detailed_profiles.json', 'r') as f:
                detailed_data = json.load(f)
        else:
            detailed_data = []
        
        return jsonify(detailed_data)
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/download')
def download_csv():
    """Download the CSV file"""
    # Try to download the latest data file
    file_to_download = None
    if os.path.exists(data_server.selenium_file):
        file_to_download = data_server.selenium_file
        filename = f'selenium_instagram_data_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    elif os.path.exists(data_server.basic_file):
        file_to_download = data_server.basic_file
        filename = f'basic_instagram_data_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    
    if file_to_download:
        return send_file(file_to_download, as_attachment=True, download_name=filename)
    else:
        return "No data file found", 404

@app.route('/download-excel')
def download_excel():
    """Download the data as Excel file"""
    if data_server.data.empty:
        return "No data available", 404
    
    try:
        # Create Excel file in memory
        excel_filename = f'instagram_data_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
        excel_path = f'C:\\3 Folks Media\\data\\{excel_filename}'
        
        # Create Excel writer object
        with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
            # Main data sheet
            data_server.data.to_excel(writer, sheet_name='Instagram Data', index=False)
            
            # Summary statistics sheet
            summary = data_server.get_summary_stats()
            summary_df = pd.DataFrame([
                ['Total Profiles', summary.get('total_profiles', 0)],
                ['Successful Scrapes', summary.get('successful_scrapes', 0)],
                ['Success Rate', summary.get('success_rate', '0%')],
                ['Data Source', summary.get('data_source', 'Unknown')],
                ['Last Updated', summary.get('last_updated', 'Never')],
                ['Min Followers', summary.get('follower_stats', {}).get('min', 'N/A')],
                ['Max Followers', summary.get('follower_stats', {}).get('max', 'N/A')],
                ['Median Followers', summary.get('follower_stats', {}).get('median', 'N/A')],
                ['Total Followers', summary.get('follower_stats', {}).get('total_followers', 'N/A')]
            ], columns=['Metric', 'Value'])
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
            
            # Genre breakdown sheet
            genre_breakdown = data_server.get_genre_breakdown()
            if genre_breakdown:
                genre_df = pd.DataFrame(list(genre_breakdown.items()), columns=['Genre', 'Count'])
                genre_df.to_excel(writer, sheet_name='Genre Breakdown', index=False)
        
        return send_file(excel_path, as_attachment=True, download_name=excel_filename)
        
    except Exception as e:
        return f"Error creating Excel file: {str(e)}", 500

@app.route('/refresh')
def refresh_data():
    """Refresh data from CSV files"""
    data_server.load_data()
    return jsonify({
        'status': 'success', 
        'message': 'Data refreshed',
        'source': getattr(data_server, 'data_source', 'Unknown'),
        'records': len(data_server.data)
    })

if __name__ == '__main__':
    print("Starting Instagram Scraper Dashboard...")
    print("Dashboard will be available at: http://localhost:5000")
    print("API endpoint: http://localhost:5000/api/data")
    app.run(debug=True, host='0.0.0.0', port=5000)