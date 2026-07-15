#!/usr/bin/env python
"""
Display all test influencers with their details.
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from influencers.models import Influencer

print("="*80)
print("8 TEST INFLUENCERS - COMPLETE DETAILS")
print("="*80)

influencers = Influencer.objects.all().order_by('-followers')

for i, inf in enumerate(influencers, 1):
    print(f"\n[{i}] {inf.name}")
    print("-" * 60)
    print(f"  Instagram Handle: @{inf.instagram_handle}")
    print(f"  Instagram Link:   {inf.ig_link}")
    print(f"  Email:            {inf.email or 'N/A'}")
    print(f"  Phone (Contact):  {inf.contact or 'N/A'}")
    print(f"  Followers:        {inf.followers:,} ({inf.tier})")
    print(f"  Location:         {inf.location}")
    print(f"  Gender:           {inf.gender}")
    print(f"  Genres:           {inf.genre}")
    print(f"  Genre List:       {', '.join(inf.genre_list)}")
    print(f"  Brand History:    {inf.brand or 'None'}")
    print(f"  Complete Contact: {'Yes' if inf.has_complete_contact_info else 'No'}")

print("\n" + "="*80)
print(f"Total: {influencers.count()} influencers")
print("="*80)
