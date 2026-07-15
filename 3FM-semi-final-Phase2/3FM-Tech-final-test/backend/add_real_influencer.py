#!/usr/bin/env python
"""
Add a real-world influencer example to the database.
Using publicly available information about a well-known Indian influencer.
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from influencers.models import Influencer
from datetime import datetime

print("="*80)
print("ADDING REAL-WORLD INFLUENCER EXAMPLE")
print("="*80)

# Real-world influencer: Bhuvan Bam (BB Ki Vines)
# Using publicly available information

real_influencer = Influencer.objects.create(
    name='Bhuvan Bam',
    email='contact@bbkivines.com',  # Public business email
    ig_link='https://instagram.com/bhuvan.bam22',
    instagram_handle='bhuvan.bam22',
    followers=18700000,  # Approximate as of data (Feb 2026)
    location='Delhi',
    gender='Male',
    genre='Entertainment|Comedy|Music|Acting',
    brand='Mivi, beardo, Myntra, Tasty Treat, and many others',
)

print(f"\n[OK] Real-world influencer added successfully!")
print()
print(f"Name:             {real_influencer.name}")
print(f"Instagram:        @{real_influencer.instagram_handle}")
print(f"Followers:        {real_influencer.followers:,}")
print(f"Tier:             {real_influencer.tier}")
print(f"Location:         {real_influencer.location}")
print(f"Genres:           {', '.join(real_influencer.genre_list)}")
print(f"Brand History:    {real_influencer.brand}")
print()
print("="*80)
print("BHUVAN BAM - BB KI VINES")
print("="*80)
print()
print("Background:")
print("  - One of India's most popular YouTube content creators")
print("  - Creator of 'BB Ki Vines' - comedy sketch series")
print("  - Winner of multiple awards including Filmfare")
print("  - Actor, singer, songwriter")
print("  - 18.7M+ Instagram followers (Macro influencer)")
print()
print("You can now view this influencer in Django Admin:")
print("  http://127.0.0.1:8000/admin/influencers/influencer/")
print()
print("="*80)

# Show total count
total = Influencer.objects.count()
print(f"\nTotal influencers in database: {total}")

# Show tier distribution
macro = Influencer.objects.filter(followers__gte=1000000).count()
print(f"Macro influencers (1M+): {macro}")
print()
