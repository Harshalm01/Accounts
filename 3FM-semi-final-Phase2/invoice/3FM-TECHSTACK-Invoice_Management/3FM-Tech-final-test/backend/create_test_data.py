#!/usr/bin/env python
"""
Script to populate database with sample influencer data for testing.
Creates diverse test records to verify model functionality.
"""
import os
import django
from datetime import datetime, timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from influencers.models import Influencer, BrandCollaboration, ImportLog

def create_sample_data():
    """Create sample influencers and collaborations for testing."""

    print("="*80)
    print("CREATING SAMPLE TEST DATA")
    print("="*80)

    # Clear existing data (only for testing!)
    print("\n[1/4] Clearing existing test data...")
    Influencer.objects.all().delete()
    BrandCollaboration.objects.all().delete()
    ImportLog.objects.all().delete()
    print("  [OK] Database cleared")

    # Sample influencers with diverse data
    print("\n[2/4] Creating sample influencers...")

    influencers_data = [
        {
            'name': 'Priya Sharma',
            'contact': '9876543210',
            'email': 'priya.sharma@gmail.com',
            'ig_link': 'https://instagram.com/priyasharma',
            'instagram_handle': 'priyasharma',
            'followers': 45000,
            'location': 'Mumbai',
            'gender': 'Female',
            'genre': 'Fashion|Lifestyle|Beauty',
            'brand': 'Mama Earth, Nykaa',
        },
        {
            'name': 'Rahul Verma',
            'contact': '9123456789',
            'email': 'rahul.fitness@gmail.com',
            'ig_link': 'https://instagram.com/rahulfit',
            'instagram_handle': 'rahulfit',
            'followers': 125000,
            'location': 'Delhi',
            'gender': 'Male',
            'genre': 'Health & Fitness|Sports',
            'brand': 'MyProtein, Decathlon',
        },
        {
            'name': 'Ayesha Khan',
            'contact': '9988776655',
            'email': 'ayesha.foodie@gmail.com',
            'ig_link': 'https://instagram.com/ayeshafoodie',
            'instagram_handle': 'ayeshafoodie',
            'followers': 8500,
            'location': 'Bangalore',
            'gender': 'Female',
            'genre': 'Food & Beverages|Travel',
            'brand': 'Zomato',
        },
        {
            'name': 'Vikas Tech',
            'email': 'vikas.tech@gmail.com',
            'ig_link': 'https://instagram.com/vikastech',
            'instagram_handle': 'vikastech',
            'followers': 250000,
            'location': 'Pune',
            'gender': 'Male',
            'genre': 'Technology|Gaming',
        },
        {
            'name': 'Sneha & Rohan',
            'contact': '9876501234',
            'email': 'sneharohan@gmail.com',
            'ig_link': 'https://instagram.com/sneharohan',
            'instagram_handle': 'sneharohan',
            'followers': 95000,
            'location': 'Kolkata',
            'gender': 'Couple',
            'genre': 'Travel|Photography|Lifestyle',
            'brand': 'MakeMyTrip, AirBnb',
        },
        {
            'name': 'Arjun Singh',
            'contact': '9191919191',
            'email': 'arjun.entertainment@gmail.com',
            'ig_link': 'https://instagram.com/arjunsingh',
            'instagram_handle': 'arjunsingh',
            'followers': 3200,
            'location': 'Jaipur',
            'gender': 'Male',
            'genre': 'Entertainment|Comedy',
        },
        {
            'name': 'Divya Patel',
            'contact': '9898989898',
            'email': 'divya.makeup@gmail.com',
            'ig_link': 'https://instagram.com/divyamakeup',
            'instagram_handle': 'divyamakeup',
            'followers': 520000,
            'location': 'Ahmedabad',
            'gender': 'Female',
            'genre': 'Makeup|Beauty|Fashion',
            'brand': 'Lakme, Maybelline, Nykaa',
        },
        {
            'name': 'Tech Guru India',
            'email': 'techguru@gmail.com',
            'ig_link': 'https://instagram.com/techguruindia',
            'instagram_handle': 'techguruindia',
            'followers': 1500000,
            'location': 'Bangalore',
            'gender': 'Male',
            'genre': 'Technology|Reviews|Education',
            'brand': 'Samsung, OnePlus, Amazon',
        },
    ]

    influencers = []
    for data in influencers_data:
        influencer = Influencer.objects.create(**data)
        influencers.append(influencer)
        tier = influencer.tier or 'unknown'
        print(f"  [OK] Created: {influencer.name} (@{influencer.instagram_handle}) - {influencer.followers:,} followers ({tier})")

    print(f"\n  Total influencers created: {len(influencers)}")

    # Create brand collaborations
    print("\n[3/4] Creating sample brand collaborations...")

    collaborations = [
        {
            'influencer': influencers[0],  # Priya Sharma
            'brand_name': 'Mama Earth',
            'campaign_name': 'Natural Beauty Campaign',
            'status': 'completed',
            'start_date': datetime.now().date() - timedelta(days=90),
            'end_date': datetime.now().date() - timedelta(days=60),
            'compensation': 15000.00,
            'notes': 'Instagram posts and stories promoting skincare products',
        },
        {
            'influencer': influencers[1],  # Rahul Verma
            'brand_name': 'MyProtein',
            'campaign_name': 'Summer Fitness Challenge',
            'status': 'active',
            'start_date': datetime.now().date() - timedelta(days=15),
            'end_date': datetime.now().date() + timedelta(days=45),
            'compensation': 25000.00,
            'notes': 'Weekly workout videos and supplement reviews',
        },
        {
            'influencer': influencers[6],  # Divya Patel
            'brand_name': 'Nykaa',
            'campaign_name': 'Festive Makeup Looks',
            'status': 'completed',
            'start_date': datetime.now().date() - timedelta(days=120),
            'end_date': datetime.now().date() - timedelta(days=90),
            'compensation': 50000.00,
            'notes': 'Diwali makeup tutorial series',
        },
    ]

    for collab_data in collaborations:
        collab = BrandCollaboration.objects.create(**collab_data)
        print(f"  [OK] Created: {collab.influencer.name} x {collab.brand_name} ({collab.status})")

    print(f"\n  Total collaborations created: {len(collaborations)}")

    # Create import log
    print("\n[4/4] Creating sample import log...")

    import_log = ImportLog.objects.create(
        filename='test_sample_data.csv',
        total_records=len(influencers),
        imported_records=len(influencers),
        failed_records=0,
        status='completed',
        started_at=datetime.now()
    )
    import_log.completed_at = datetime.now()
    import_log.save()

    print(f"  [OK] Created import log: {import_log.filename}")

    # Statistics
    print("\n" + "="*80)
    print("SUMMARY STATISTICS")
    print("="*80)

    total_influencers = Influencer.objects.count()
    print(f"\nTotal Influencers: {total_influencers}")

    # By tier
    nano = Influencer.objects.filter(followers__lt=10000, followers__gte=1).count()
    micro = Influencer.objects.filter(followers__lt=100000, followers__gte=10000).count()
    mid = Influencer.objects.filter(followers__lt=1000000, followers__gte=100000).count()
    macro = Influencer.objects.filter(followers__gte=1000000).count()

    print(f"\nBy Tier:")
    print(f"  Nano (1-10K):       {nano}")
    print(f"  Micro (10K-100K):   {micro}")
    print(f"  Mid (100K-1M):      {mid}")
    print(f"  Macro (1M+):        {macro}")

    # By gender
    print(f"\nBy Gender:")
    for gender in ['Male', 'Female', 'Couple']:
        count = Influencer.objects.filter(gender=gender).count()
        print(f"  {gender}: {count}")

    # By location
    print(f"\nTop Locations:")
    locations = Influencer.objects.values_list('location', flat=True).distinct()
    for loc in locations:
        count = Influencer.objects.filter(location=loc).count()
        print(f"  {loc}: {count}")

    # Complete contact info
    complete_contact = sum(1 for inf in Influencer.objects.all() if inf.has_complete_contact_info)
    print(f"\nInfluencers with complete contact info (phone+email+IG): {complete_contact}/{total_influencers}")

    # Collaborations
    total_collabs = BrandCollaboration.objects.count()
    print(f"\nTotal Brand Collaborations: {total_collabs}")

    print("\n" + "="*80)
    print("TEST DATA CREATION COMPLETE!")
    print("="*80)
    print(f"\nYou can now:")
    print(f"  1. Access Django Admin: http://127.0.0.1:8000/admin/")
    print(f"     Username: admin")
    print(f"     Password: admin123")
    print(f"\n  2. Run Django server:")
    print(f"     python manage.py runserver")
    print(f"\n  3. Test model methods and queries")

    return influencers


if __name__ == '__main__':
    try:
        influencers = create_sample_data()

        # Test model properties
        print("\n" + "="*80)
        print("TESTING MODEL PROPERTIES")
        print("="*80)

        test_influencer = influencers[0]
        print(f"\nTesting influencer: {test_influencer.name}")
        print(f"  Tier: {test_influencer.tier}")
        print(f"  Genre list: {test_influencer.genre_list}")
        print(f"  Has complete contact: {test_influencer.has_complete_contact_info}")
        print(f"  String representation: {test_influencer}")

    except Exception as e:
        print(f"\n[ERROR] Error creating test data: {e}")
        import traceback
        traceback.print_exc()
