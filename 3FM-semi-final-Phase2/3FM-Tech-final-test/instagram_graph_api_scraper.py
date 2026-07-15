"""
Instagram Graph API - High-Speed Implementation for 400K Profiles
Official Facebook API for Instagram Business/Creator accounts

Prerequisites:
1. Facebook Developer Account
2. Facebook App with Instagram permissions  
3. Instagram Business Account Access Tokens
4. Target accounts must be Business/Creator accounts
"""

import asyncio
import aiohttp
import pandas as pd
import time
from datetime import datetime
import logging
from typing import List, Dict
import json
from concurrent.futures import ThreadPoolExecutor
import sqlite3

class InstagramGraphAPI:
    def __init__(self):
        self.base_url = "https://graph.facebook.com/v18.0"
        self.rate_limit_per_hour = 200  # Per access token
        self.max_concurrent_requests = 50
        self.setup_logging()
        self.setup_database()
    
    def setup_logging(self):
        """Setup logging for monitoring"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('instagram_api.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
    
    def setup_database(self):
        """Setup SQLite database for results"""
        self.conn = sqlite3.connect('instagram_data.db', check_same_thread=False)
        self.conn.execute('''
            CREATE TABLE IF NOT EXISTS influencers (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE,
                instagram_id TEXT,
                followers_count INTEGER,
                media_count INTEGER,
                name TEXT,
                biography TEXT,
                last_updated TIMESTAMP,
                api_status TEXT
            )
        ''')
        self.conn.commit()
    
    async def get_instagram_account_id(self, session, page_access_token, page_id):
        """Get Instagram Business Account ID from Facebook Page"""
        try:
            url = f"{self.base_url}/{page_id}"
            params = {
                'fields': 'instagram_business_account',
                'access_token': page_access_token
            }
            
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('instagram_business_account', {}).get('id')
                else:
                    self.logger.error(f"Failed to get Instagram ID for page {page_id}: {response.status}")
                    return None
                    
        except Exception as e:
            self.logger.error(f"Error getting Instagram account ID: {e}")
            return None
    
    async def get_instagram_data(self, session, access_token, instagram_id):
        """Get Instagram profile data"""
        try:
            url = f"{self.base_url}/{instagram_id}"
            params = {
                'fields': 'followers_count,media_count,name,username,biography',
                'access_token': access_token
            }
            
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return {
                        'instagram_id': instagram_id,
                        'username': data.get('username', ''),
                        'followers_count': data.get('followers_count', 0),
                        'media_count': data.get('media_count', 0),
                        'name': data.get('name', ''),
                        'biography': data.get('biography', ''),
                        'last_updated': datetime.now(),
                        'api_status': 'success'
                    }
                elif response.status == 429:  # Rate limited
                    self.logger.warning("Rate limited - waiting...")
                    return {'api_status': 'rate_limited', 'instagram_id': instagram_id}
                else:
                    error_data = await response.json()
                    self.logger.error(f"API Error for {instagram_id}: {error_data}")
                    return {'api_status': 'error', 'instagram_id': instagram_id}
                    
        except Exception as e:
            self.logger.error(f"Error fetching data for {instagram_id}: {e}")
            return {'api_status': 'error', 'instagram_id': instagram_id}
    
    async def process_batch(self, session, accounts_batch, access_tokens):
        """Process a batch of Instagram accounts"""
        tasks = []
        
        for i, (page_id, instagram_id) in enumerate(accounts_batch):
            # Rotate access tokens to maximize rate limits
            token_index = i % len(access_tokens)
            access_token = access_tokens[token_index]
            
            if instagram_id:
                task = self.get_instagram_data(session, access_token, instagram_id)
            else:
                # Need to get Instagram ID first
                task = self.get_instagram_account_id(session, access_token, page_id)
            
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return results
    
    def save_to_database(self, data_batch):
        """Save results to database"""
        try:
            for item in data_batch:
                if isinstance(item, dict) and item.get('api_status') == 'success':
                    self.conn.execute('''
                        INSERT OR REPLACE INTO influencers 
                        (username, instagram_id, followers_count, media_count, name, biography, last_updated, api_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        item.get('username'),
                        item.get('instagram_id'),
                        item.get('followers_count'),
                        item.get('media_count'),
                        item.get('name'),
                        item.get('biography'),
                        item.get('last_updated'),
                        item.get('api_status')
                    ))
            self.conn.commit()
            self.logger.info(f"Saved {len(data_batch)} records to database")
            
        except Exception as e:
            self.logger.error(f"Database error: {e}")
    
    async def scrape_massive_scale(self, instagram_accounts, access_tokens, batch_size=100):
        """
        Scrape 400K+ Instagram profiles using Graph API
        
        Args:
            instagram_accounts: List of (page_id, instagram_id) tuples
            access_tokens: List of access tokens (200+ recommended)
            batch_size: Profiles per batch
        """
        
        total_accounts = len(instagram_accounts)
        processed = 0
        successful = 0
        failed = 0
        
        self.logger.info(f"Starting massive scrape of {total_accounts} accounts")
        self.logger.info(f"Using {len(access_tokens)} access tokens")
        
        # Create batches
        batches = [instagram_accounts[i:i + batch_size] 
                  for i in range(0, total_accounts, batch_size)]
        
        async with aiohttp.ClientSession() as session:
            for batch_num, batch in enumerate(batches, 1):
                try:
                    # Process batch
                    results = await self.process_batch(session, batch, access_tokens)
                    
                    # Count results
                    batch_successful = sum(1 for r in results 
                                         if isinstance(r, dict) and r.get('api_status') == 'success')
                    batch_failed = len(results) - batch_successful
                    
                    successful += batch_successful
                    failed += batch_failed
                    processed += len(batch)
                    
                    # Save to database
                    self.save_to_database([r for r in results if isinstance(r, dict)])
                    
                    # Progress update
                    progress = (processed / total_accounts) * 100
                    self.logger.info(f"Batch {batch_num}/{len(batches)} complete - "
                                   f"Progress: {progress:.1f}% - "
                                   f"Success: {successful} - Failed: {failed}")
                    
                    # Rate limiting - respect API limits
                    if batch_num % 10 == 0:  # Every 10 batches
                        self.logger.info("Pausing for rate limit respect...")
                        await asyncio.sleep(30)  # 30 second pause
                
                except Exception as e:
                    self.logger.error(f"Batch {batch_num} failed: {e}")
                    failed += len(batch)
                    continue
        
        # Final results
        self.logger.info(f"=== MASSIVE SCRAPE COMPLETE ===")
        self.logger.info(f"Total processed: {processed}")
        self.logger.info(f"Successful: {successful}")
        self.logger.info(f"Failed: {failed}")
        self.logger.info(f"Success rate: {(successful/processed)*100:.1f}%")
        
        # Export to CSV
        self.export_to_csv()
        
        return {
            'total': processed,
            'successful': successful,
            'failed': failed,
            'success_rate': (successful/processed)*100 if processed > 0 else 0
        }
    
    def export_to_csv(self):
        """Export database results to CSV"""
        try:
            df = pd.read_sql_query('''
                SELECT username, followers_count, media_count, name, biography, last_updated
                FROM influencers 
                WHERE api_status = 'success'
                ORDER BY followers_count DESC
            ''', self.conn)
            
            filename = f'instagram_graph_api_results_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
            df.to_csv(filename, index=False)
            self.logger.info(f"Exported {len(df)} records to {filename}")
            
        except Exception as e:
            self.logger.error(f"Export error: {e}")

def generate_sample_access_tokens():
    """
    Generate sample access token structure
    In reality, you'd need to collect these through Facebook's OAuth flow
    """
    return [
        "YOUR_ACCESS_TOKEN_1",
        "YOUR_ACCESS_TOKEN_2", 
        "YOUR_ACCESS_TOKEN_3",
        # ... need 200+ tokens for optimal speed
    ]

def generate_sample_accounts():
    """
    Generate sample account structure
    Replace with your actual Instagram Business account IDs
    """
    return [
        ("facebook_page_id_1", "instagram_business_id_1"),
        ("facebook_page_id_2", "instagram_business_id_2"),
        # ... your 400K accounts
    ]

async def main():
    """Main execution function for 400K profiles"""
    
    # Initialize API client
    api = InstagramGraphAPI()
    
    # Load access tokens (you need to collect these)
    access_tokens = generate_sample_access_tokens()
    
    # Load Instagram account IDs (you need your 400K list)
    instagram_accounts = generate_sample_accounts()
    
    # Start massive scraping
    results = await api.scrape_massive_scale(
        instagram_accounts=instagram_accounts,
        access_tokens=access_tokens,
        batch_size=100  # Adjust based on rate limits
    )
    
    print(f"Scraping completed: {results}")

if __name__ == "__main__":
    # Run the massive scraper
    asyncio.run(main())