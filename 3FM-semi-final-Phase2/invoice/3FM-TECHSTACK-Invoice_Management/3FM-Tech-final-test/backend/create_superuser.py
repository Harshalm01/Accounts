#!/usr/bin/env python
"""
Script to create a Django superuser automatically.
Useful for testing and development.
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

# Superuser credentials
username = 'admin'
email = 'admin@3folkmedia.com'
password = 'admin123'  # Change this in production!

# Create superuser if doesn't exist
if not User.objects.filter(username=username).exists():
    User.objects.create_superuser(username=username, email=email, password=password)
    print(f"[OK] Superuser created successfully!")
    print(f"  Username: {username}")
    print(f"  Email: {email}")
    print(f"  Password: {password}")
    print(f"\nYou can now login at: http://127.0.0.1:8000/admin/")
else:
    print(f"[INFO] Superuser '{username}' already exists.")
