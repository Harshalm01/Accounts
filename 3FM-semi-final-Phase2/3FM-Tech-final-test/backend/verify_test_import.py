"""Verify test data import."""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from influencers.models import Influencer

# Get all influencers
influencers = Influencer.objects.all().order_by('-followers')
total = influencers.count()

print("=" * 100)
print(f"TEST DATA VERIFICATION - Total Influencers: {total}")
print("=" * 100)

print("\nTop 10 Influencers by Followers:")
print("-" * 100)
print(f"{'Name':<30} | {'Followers':>12} | {'Genre':<30} | {'Location':<20}")
print("-" * 100)

for inf in influencers[:10]:
    followers_str = f"{inf.followers:,}" if inf.followers else "N/A"
    genre_str = (inf.genre[:27] + "...") if inf.genre and len(inf.genre) > 30 else (inf.genre or "N/A")
    location_str = (inf.location[:17] + "...") if inf.location and len(inf.location) > 20 else (inf.location or "N/A")
    print(f"{inf.name:<30} | {followers_str:>12} | {genre_str:<30} | {location_str:<20}")

print("\n" + "=" * 100)
print("Sample Records with Contact Info:")
print("=" * 100)

for inf in influencers[:5]:
    print(f"\nName: {inf.name}")
    print(f"  Instagram: {inf.instagram_handle or 'N/A'}")
    print(f"  Followers: {inf.followers:,}" if inf.followers else "  Followers: N/A")
    print(f"  Contact: {inf.contact or 'N/A'}")
    print(f"  Email: {inf.email or 'N/A'}")
    print(f"  Genre: {inf.genre or 'N/A'}")
    print(f"  Location: {inf.location or 'N/A'}")
    print(f"  Tier: {inf.tier or 'N/A'}")

print("\n" + "=" * 100)
print(f"Database is ready for testing with {total} influencer records!")
print("=" * 100)
