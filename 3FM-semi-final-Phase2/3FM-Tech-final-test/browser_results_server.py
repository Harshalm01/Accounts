"""
Browser Check Results Server
Display accurate Instagram profile validation results
"""

from flask import Flask, render_template_string
import pandas as pd
import os
from datetime import datetime

app = Flask(__name__)

@app.route('/')
def show_browser_results():
    """Display browser-based profile check results"""
    
    try:
        # Load browser check results
        results_file = 'data/browser_check_results.csv'
        
        if not os.path.exists(results_file):
            return """
            <div style="text-align: center; margin: 50px; font-family: Arial;">
                <h2>❌ No Browser Results Found</h2>
                <p>Please run the browser checker first:</p>
                <code>python browser_profile_checker.py</code>
            </div>
            """
        
        df = pd.read_csv(results_file)
        results = df.to_dict('records')
        
        # Calculate stats
        available = len([r for r in results if '✅' in str(r.get('browser_result', ''))])
        unavailable = len([r for r in results if '🔒' in str(r.get('browser_result', '')) or 'Profile isn\'t available' in str(r.get('browser_result', ''))])
        total = len(results)
        
        html_template = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Instagram Profile Browser Check Results</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 20px; 
                    background: #f8f9fa;
                }
                .header {
                    background: linear-gradient(135deg, #e74c3c, #c0392b);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                    margin-bottom: 30px;
                }
                .alert {
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    color: #856404;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .stat-card {
                    background: white;
                    border-radius: 10px;
                    padding: 25px;
                    text-align: center;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    border: 3px solid transparent;
                }
                .stat-card.available {
                    border-color: #27ae60;
                }
                .stat-card.unavailable {
                    border-color: #e74c3c;
                }
                .stat-card.total {
                    border-color: #3498db;
                }
                .stat-number {
                    font-size: 3em;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                .available .stat-number { color: #27ae60; }
                .unavailable .stat-number { color: #e74c3c; }
                .total .stat-number { color: #3498db; }
                
                .results-table {
                    background: white;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    padding: 15px;
                    text-align: left;
                    border-bottom: 1px solid #e9ecef;
                }
                th {
                    background: #2c3e50;
                    color: white;
                    font-weight: bold;
                }
                tr:hover {
                    background: #f8f9fa;
                }
                .profile-url {
                    font-family: monospace;
                    background: #f1f2f6;
                    padding: 5px 8px;
                    border-radius: 4px;
                    font-size: 0.9em;
                    max-width: 250px;
                    word-break: break-all;
                }
                .result-available {
                    color: #27ae60;
                    font-weight: bold;
                }
                .result-unavailable {
                    color: #e74c3c;
                    font-weight: bold;
                }
                .screenshot-link {
                    color: #3498db;
                    text-decoration: none;
                    font-size: 0.9em;
                }
                .screenshot-link:hover {
                    text-decoration: underline;
                }
                .accuracy-badge {
                    background: #e74c3c;
                    color: white;
                    padding: 5px 10px;
                    border-radius: 20px;
                    font-size: 0.9em;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🌐 Instagram Profile Browser Check Results</h1>
                <p>Real browser validation - Shows exactly what users see</p>
                <div class="accuracy-badge">{{ accuracy_rate }}% Profiles Not Available</div>
            </div>
            
            <div class="alert">
                <strong>⚠️ Important:</strong> These results are from real browser testing using Selenium. 
                This shows exactly what users see when they visit these Instagram profiles.
            </div>
            
            <div class="stats">
                <div class="stat-card available">
                    <div class="stat-number">{{ available_count }}</div>
                    <div>✅ Available Profiles</div>
                    <small>Actually working</small>
                </div>
                <div class="stat-card unavailable">
                    <div class="stat-number">{{ unavailable_count }}</div>
                    <div>❌ Unavailable Profiles</div>
                    <small>"Profile isn't available"</small>
                </div>
                <div class="stat-card total">
                    <div class="stat-number">{{ total_count }}</div>
                    <div>📊 Total Checked</div>
                    <small>Browser validated</small>
                </div>
            </div>
            
            <div class="results-table">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Profile URL</th>
                            <th>Browser Result</th>
                            <th>Screenshot</th>
                            <th>Checked At</th>
                        </tr>
                    </thead>
                    <tbody>
                        {% for result in results %}
                        <tr>
                            <td>{{ result.order }}</td>
                            <td>
                                <div class="profile-url">{{ result.original_url }}</div>
                            </td>
                            <td class="{% if '✅' in result.browser_result %}result-available{% else %}result-unavailable{% endif %}">
                                {{ result.browser_result }}
                            </td>
                            <td>
                                {% if result.original_url %}
                                <a href="data/screenshot_{{ result.original_url.split('/')[-1] }}.png" 
                                   class="screenshot-link" target="_blank">
                                   📸 View Screenshot
                                </a>
                                {% endif %}
                            </td>
                            <td>{{ result.checked_at }}</td>
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top: 30px; text-align: center; color: #666; font-size: 0.9em;">
                <p>
                    💡 <strong>Tip:</strong> Click on screenshot links to see exactly what the browser saw for each profile.<br>
                    Generated: {{ timestamp }}
                </p>
            </div>
        </body>
        </html>
        """
        
        from jinja2 import Template
        template = Template(html_template)
        
        accuracy_rate = round((unavailable / total) * 100, 1) if total > 0 else 0
        
        return template.render(
            results=results,
            available_count=available,
            unavailable_count=unavailable,
            total_count=total,
            accuracy_rate=accuracy_rate,
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        )
        
    except Exception as e:
        return f"""
        <div style="text-align: center; margin: 50px; font-family: Arial;">
            <h2>❌ Error Loading Results</h2>
            <p>Error: {str(e)}</p>
        </div>
        """

def main():
    """Start the browser results server"""
    
    print("🌐 Browser Results Server Starting...")
    print("📊 View results at: http://localhost:5002")
    print("🔧 Press Ctrl+C to stop")
    
    try:
        app.run(host='127.0.0.1', port=5002, debug=False)
    except KeyboardInterrupt:
        print("\n✅ Server stopped")

if __name__ == "__main__":
    main()