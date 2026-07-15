#!/usr/bin/env python
"""
Verify the CSV import and display database statistics.
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from influencers.models import Influencer, ImportLog
from django.db.models import Count, Max, Min, Avg

print("="*80)
print("DATABASE VERIFICATION - PRODUCTION DATA")
print("="*80)

# Total count
total = Influencer.objects.count()
print(f"\nTotal influencers in database: {total:,}")

# Recent import log
latest_import = ImportLog.objects.order_by('-started_at').first()
if latest_import:
    print(f"\nLatest import:")
    print(f"  File: {latest_import.filename}")
    print(f"  Status: {latest_import.status}")
    print(f"  Total records: {latest_import.total_records:,}")
    print(f"  Imported: {latest_import.imported_records:,}")
    print(f"  Failed: {latest_import.failed_records}")
    print(f"  Success rate: {(latest_import.imported_records/latest_import.total_records)*100:.2f}%")

# Follower statistics
print("\n" + "="*80)
print("FOLLOWER STATISTICS")
print("="*80)

followers_stats = Influencer.objects.filter(followers__isnull=False).aggregate(
    total=Count('id'),
    max_followers=Max('followers'),
    min_followers=Min('followers'),
    avg_followers=Avg('followers')
)

print(f"\nInfluencers with follower data: {followers_stats['total']:,}")
print(f"Maximum followers: {int(followers_stats['max_followers']):,}")
print(f"Minimum followers: {int(followers_stats['min_followers']):,}")
print(f"Average followers: {int(followers_stats['avg_followers']):,}")

# Tier distribution
nano = Influencer.objects.filter(followers__lt=10000, followers__gte=1).count()
micro = Influencer.objects.filter(followers__lt=100000, followers__gte=10000).count()
mid = Influencer.objects.filter(followers__lt=1000000, followers__gte=100000).count()
macro = Influencer.objects.filter(followers__lt=10000000, followers__gte=1000000).count()
mega = Influencer.objects.filter(followers__gte=10000000).count()

print(f"\nTier Distribution:")
print(f"  Nano (1-10K):       {nano:7,}  ({nano/(nano+micro+mid+macro+mega)*100:5.1f}%)")
print(f"  Micro (10K-100K):   {micro:7,}  ({micro/(nano+micro+mid+macro+mega)*100:5.1f}%)")
print(f"  Mid (100K-1M):      {mid:7,}  ({mid/(nano+micro+mid+macro+mega)*100:5.1f}%)")
print(f"  Macro (1M-10M):     {macro:7,}  ({macro/(nano+micro+mid+macro+mega)*100:5.1f}%)")
print(f"  Mega (10M+):        {mega:7,}  ({mega/(nano+micro+mid+macro+mega)*100:5.1f}%)")

# Top 10 influencers
print("\n" + "="*80)
print("TOP 10 INFLUENCERS BY FOLLOWERS")
print("="*80)

top_10 = Influencer.objects.filter(followers__isnull=False).order_by('-followers')[:10]
for i, inf in enumerate(top_10, 1):
    handle = f"@{inf.instagram_handle}" if inf.instagram_handle else "N/A"
    print(f"{i:2d}. {inf.followers:>12,} - {inf.name:30s} ({handle})")

# Gender distribution
print("\n" + "="*80)
print("DEMOGRAPHIC STATISTICS")
print("="*80)

gender_counts = Influencer.objects.values('gender').annotate(count=Count('id')).order_by('-count')
print(f"\nGender Distribution:")
for item in gender_counts[:10]:
    gender = item['gender'] or 'Unknown'
    count = item['count']
    print(f"  {gender:15s}: {count:7,}  ({count/total*100:5.1f}%)")

# Location distribution
location_counts = Influencer.objects.exclude(location__isnull=True).values('location').annotate(count=Count('id')).order_by('-count')[:10]
print(f"\nTop 10 Locations:")
for i, item in enumerate(location_counts, 1):
    print(f"  {i:2d}. {item['location']:20s}: {item['count']:6,}")

# Contact info completeness
has_contact = Influencer.objects.filter(contact__isnull=False).count()
has_email = Influencer.objects.filter(email__isnull=False).count()
has_ig = Influencer.objects.filter(ig_link__isnull=False).count()

print(f"\nContact Information:")
print(f"  With phone number: {has_contact:7,}  ({has_contact/total*100:5.1f}%)")
print(f"  With email:        {has_email:7,}  ({has_email/total*100:5.1f}%)")
print(f"  With Instagram:    {has_ig:7,}  ({has_ig/total*100:5.1f}%)")

print("\n" + "="*80)
print("VERIFICATION COMPLETE - DATABASE READY!")
print("="*80)
print(f"\nYou can now build the REST API to access {total:,} influencers")
