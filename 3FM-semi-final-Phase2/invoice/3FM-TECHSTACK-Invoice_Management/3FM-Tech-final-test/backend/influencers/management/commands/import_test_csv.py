"""
Django management command to import test influencer data from Testing CSV file.
Usage: python manage.py import_test_csv
"""
from django.core.management.base import BaseCommand
from influencers.models import Influencer, ImportLog
import pandas as pd
from datetime import datetime
import os
import re


class Command(BaseCommand):
    help = 'Import influencer data from testing CSV file'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default=r'c:\3 Folks Media\data\Testing\Testing Data - Sheet1.csv',
            help='Path to CSV file to import'
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing influencer data before import'
        )

    def extract_instagram_handle(self, ig_link):
        """Extract Instagram handle from URL."""
        if not ig_link or pd.isna(ig_link):
            return None

        # Extract username from Instagram URL
        # Pattern: https://www.instagram.com/username/ or https://www.instagram.com/username?...
        match = re.search(r'instagram\.com/([^/?]+)', str(ig_link))
        if match:
            return match.group(1).lower().strip()
        return None

    def parse_contact_email(self, contact_email_str):
        """Parse the CONTACT/EMAIL field to extract phone or email."""
        if not contact_email_str or pd.isna(contact_email_str):
            return None, None

        contact_email_str = str(contact_email_str).strip()

        # Check if it's an email (contains @)
        if '@' in contact_email_str:
            return None, contact_email_str.lower()

        # Check if it's a phone number (only digits)
        digits = re.sub(r'\D', '', contact_email_str)
        if len(digits) == 10:
            return digits, None
        elif len(digits) > 10:
            # Likely has country code, take last 10 digits
            return digits[-10:], None

        return None, None

    def parse_followers(self, followers_str):
        """Parse follower count from string (handles K suffix)."""
        if not followers_str or pd.isna(followers_str):
            return None

        followers_str = str(followers_str).strip().replace(',', '')

        # Handle 'K' suffix (e.g., "20.1K" -> 20100)
        if 'K' in followers_str.upper():
            try:
                num = float(followers_str.upper().replace('K', '').strip())
                return int(num * 1000)
            except:
                return None

        # Handle regular numbers
        try:
            return int(float(followers_str))
        except:
            return None

    def handle(self, *args, **options):
        csv_file = options['file']
        clear_existing = options['clear']

        self.stdout.write("="*80)
        self.stdout.write(self.style.SUCCESS("TEST CSV IMPORT - 3 Folks Media Influencer Database"))
        self.stdout.write("="*80)

        # Check if file exists
        if not os.path.exists(csv_file):
            self.stdout.write(self.style.ERROR(f"\n[ERROR] File not found: {csv_file}"))
            return

        # Create import log
        import_log = ImportLog.objects.create(
            filename=os.path.basename(csv_file),
            status='processing'
        )

        try:
            # Read CSV
            self.stdout.write(f"\n[1/5] Reading CSV file...")
            self.stdout.write(f"  File: {csv_file}")

            df = pd.read_csv(csv_file, low_memory=False)
            total_records = len(df)
            import_log.total_records = total_records
            import_log.save()

            self.stdout.write(self.style.SUCCESS(f"  [OK] Loaded {total_records:,} records"))

            # Clear existing data if requested
            if clear_existing:
                self.stdout.write(f"\n[2/5] Clearing existing data...")
                existing_count = Influencer.objects.count()
                Influencer.objects.all().delete()
                self.stdout.write(self.style.WARNING(f"  [OK] Deleted {existing_count:,} existing records"))
            else:
                self.stdout.write(f"\n[2/5] Preserving existing data...")
                existing_count = Influencer.objects.count()
                self.stdout.write(f"  [OK] Current database has {existing_count:,} records")

            # Prepare data
            self.stdout.write(f"\n[3/5] Processing data...")

            # Standardize column names
            df.columns = df.columns.str.strip()

            self.stdout.write(f"  Columns found: {list(df.columns)}")
            self.stdout.write(self.style.SUCCESS("  [OK] Data prepared for import"))

            # Import records
            self.stdout.write(f"\n[4/5] Importing {total_records:,} records...")

            imported_count = 0
            failed_count = 0
            error_messages = []

            influencers_to_create = []

            for idx, row in df.iterrows():
                try:
                    # Extract contact and email
                    contact, email = self.parse_contact_email(row.get('CONTACT/ EMAIL'))

                    # Extract Instagram handle from URL
                    ig_link = row.get('IG LINK')
                    instagram_handle = self.extract_instagram_handle(ig_link)

                    # Parse followers
                    followers = self.parse_followers(row.get('FOLLOWERS'))

                    # Parse genre (convert from comma-separated to pipe-separated)
                    genre = None
                    if pd.notna(row.get('Genre')):
                        genre_str = str(row.get('Genre')).strip()
                        # Convert commas or slashes to pipes
                        genre = genre_str.replace(',', '|').replace('/', '|')

                    # Get commercials data
                    commercials = None
                    if pd.notna(row.get('Commercials')):
                        commercials = str(row.get('Commercials')).strip()

                    # Create Influencer object
                    influencer = Influencer(
                        name=row.get('Name') if pd.notna(row.get('Name')) else f"Unknown_{idx}",
                        contact=contact,
                        email=email,
                        ig_link=ig_link if pd.notna(ig_link) else None,
                        instagram_handle=instagram_handle,
                        followers=followers,
                        location=row.get('Location') if pd.notna(row.get('Location')) else None,
                        genre=genre,
                        brand=commercials,  # Map Commercials column to brand field
                    )
                    influencers_to_create.append(influencer)

                except Exception as e:
                    failed_count += 1
                    error_msg = f"Row {idx} ({row.get('Name', 'Unknown')}): {str(e)}"
                    if len(error_messages) < 10:
                        error_messages.append(error_msg)

            # Bulk create all influencers
            try:
                Influencer.objects.bulk_create(influencers_to_create, ignore_conflicts=True)
                imported_count = len(influencers_to_create)
                self.stdout.write(self.style.SUCCESS(f"  [OK] Imported {imported_count:,} records"))
            except Exception as e:
                failed_count += len(influencers_to_create)
                error_messages.append(f"Bulk create error: {str(e)}")
                self.stdout.write(self.style.ERROR(f"  [ERROR] Bulk create failed: {str(e)}"))

            # Update import log
            import_log.imported_records = imported_count
            import_log.failed_records = failed_count
            import_log.status = 'completed'
            import_log.completed_at = datetime.now()

            if error_messages:
                import_log.error_log = "\n".join(error_messages[:10])

            import_log.save()

            # Final statistics
            self.stdout.write(f"\n[5/5] Verifying import...")
            final_count = Influencer.objects.count()

            self.stdout.write("\n" + "="*80)
            self.stdout.write(self.style.SUCCESS("IMPORT SUMMARY"))
            self.stdout.write("="*80)
            self.stdout.write(f"\nTotal records in CSV:     {total_records:,}")
            self.stdout.write(f"Successfully imported:     {imported_count:,}")
            self.stdout.write(f"Failed to import:          {failed_count:,}")
            self.stdout.write(f"Success rate:              {(imported_count/total_records)*100:.2f}%")
            self.stdout.write(f"\nDatabase record count:     {final_count:,}")

            if error_messages:
                self.stdout.write(f"\n{self.style.WARNING('Errors encountered:')}")
                for error in error_messages[:10]:
                    self.stdout.write(f"  - {error}")

            self.stdout.write("\n" + "="*80)
            self.stdout.write(self.style.SUCCESS("IMPORT COMPLETE!"))
            self.stdout.write("="*80)
            self.stdout.write(f"\nYou can now access {final_count:,} influencers via:")
            self.stdout.write(f"  - Django Admin: http://127.0.0.1:8000/admin/influencers/influencer/")
            self.stdout.write(f"  - Django shell: python manage.py shell")

        except Exception as e:
            import_log.status = 'failed'
            import_log.error_log = str(e)
            import_log.completed_at = datetime.now()
            import_log.save()

            self.stdout.write(self.style.ERROR(f"\n[ERROR] Import failed: {str(e)}"))
            import traceback
            traceback.print_exc()
