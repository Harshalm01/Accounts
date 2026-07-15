"""
Django management command to import influencer data from cleaned CSV file.
Usage: python manage.py import_csv
"""
from django.core.management.base import BaseCommand
from influencers.models import Influencer, ImportLog
import pandas as pd
from datetime import datetime
import os


class Command(BaseCommand):
    help = 'Import influencer data from cleaned CSV file'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default=r'c:\3 Folks Media\data\processed\cleaned_influencers_v2_full.csv',
            help='Path to CSV file to import'
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=1000,
            help='Number of records to process per batch (default: 1000)'
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing influencer data before import'
        )

    def handle(self, *args, **options):
        csv_file = options['file']
        batch_size = options['batch_size']
        clear_existing = options['clear']

        self.stdout.write("="*80)
        self.stdout.write(self.style.SUCCESS("CSV IMPORT - 3 Folks Media Influencer Database"))
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

            # Handle missing values
            df = df.where(pd.notna(df), None)

            self.stdout.write(self.style.SUCCESS("  [OK] Data prepared for import"))

            # Import in batches
            self.stdout.write(f"\n[4/5] Importing {total_records:,} records in batches of {batch_size}...")

            imported_count = 0
            failed_count = 0
            error_messages = []

            total_batches = (total_records + batch_size - 1) // batch_size

            for batch_num in range(total_batches):
                start_idx = batch_num * batch_size
                end_idx = min((batch_num + 1) * batch_size, total_records)
                batch_df = df.iloc[start_idx:end_idx]

                batch_objects = []

                for idx, row in batch_df.iterrows():
                    try:
                        # Create Influencer object
                        influencer = Influencer(
                            name=row.get('Name'),
                            contact=row.get('Contact') if pd.notna(row.get('Contact')) else None,
                            email=row.get('Email') if pd.notna(row.get('Email')) else None,
                            ig_link=row.get('IG Link') if pd.notna(row.get('IG Link')) else None,
                            instagram_handle=row.get('Instagram_Handle') if pd.notna(row.get('Instagram_Handle')) else None,
                            followers=int(row.get('Followers')) if pd.notna(row.get('Followers')) else None,
                            location=row.get('Location') if pd.notna(row.get('Location')) else None,
                            gender=row.get('Gender') if pd.notna(row.get('Gender')) else None,
                            genre=row.get('Genre') if pd.notna(row.get('Genre')) else None,
                            brand=row.get('Brand') if pd.notna(row.get('Brand')) else None,
                            address=row.get('Address') if pd.notna(row.get('Address')) else None,
                        )
                        batch_objects.append(influencer)
                    except Exception as e:
                        failed_count += 1
                        error_msg = f"Row {idx}: {str(e)}"
                        if len(error_messages) < 10:  # Keep first 10 errors
                            error_messages.append(error_msg)

                # Bulk create batch
                try:
                    Influencer.objects.bulk_create(batch_objects, ignore_conflicts=True)
                    imported_count += len(batch_objects)

                    # Progress indicator
                    progress = (batch_num + 1) / total_batches * 100
                    self.stdout.write(
                        f"  Batch {batch_num + 1}/{total_batches}: "
                        f"{imported_count:,}/{total_records:,} records ({progress:.1f}%)",
                        ending='\r'
                    )
                    self.stdout.flush()

                except Exception as e:
                    failed_count += len(batch_objects)
                    error_messages.append(f"Batch {batch_num}: {str(e)}")

            self.stdout.write()  # New line after progress
            self.stdout.write(self.style.SUCCESS(f"  [OK] Import complete!"))

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
                self.stdout.write(f"\n{self.style.WARNING('First 10 errors:')}")
                for error in error_messages[:10]:
                    self.stdout.write(f"  - {error}")

            self.stdout.write("\n" + "="*80)
            self.stdout.write(self.style.SUCCESS("IMPORT COMPLETE!"))
            self.stdout.write("="*80)
            self.stdout.write(f"\nYou can now access {final_count:,} influencers via:")
            self.stdout.write(f"  - Django Admin: http://127.0.0.1:8000/admin/influencers/influencer/")
            self.stdout.write(f"  - Django shell: python manage.py shell")
            self.stdout.write(f"  - REST API (once built): /api/influencers/")

        except Exception as e:
            import_log.status = 'failed'
            import_log.error_log = str(e)
            import_log.completed_at = datetime.now()
            import_log.save()

            self.stdout.write(self.style.ERROR(f"\n[ERROR] Import failed: {str(e)}"))
            import traceback
            traceback.print_exc()
