#!/usr/bin/env python3
"""
Data Cleaning Script for 3 Folks Media Influencer Database
Fixes: 'Female' text corruption, empty columns, duplicates, data standardization
"""
import pandas as pd
import re
import sys
import os
from datetime import datetime

def clean_influencer_csv(input_file, output_file):
    """
    Clean the corrupted influencer CSV file.

    Issues to fix:
    1. 'Female' text incorrectly inserted throughout dataset
    2. Empty columns (Unnamed: 11, 12, 13)
    3. Duplicate contact numbers (~25k)
    4. Invalid/missing data
    5. Column name corruption (Femaleollowers -> Followers)
    """
    print("="*80)
    print("3 FOLKS MEDIA - DATA CLEANING SCRIPT")
    print("="*80)

    # Read CSV
    print(f"\n[1/9] Reading CSV from: {input_file}")
    try:
        df = pd.read_csv(input_file, low_memory=False)
        print(f"[OK] Successfully loaded {len(df):,} records with {len(df.columns)} columns")
    except Exception as e:
        print(f"[ERROR] Error reading CSV: {e}")
        sys.exit(1)

    print(f"\nOriginal shape: {df.shape[0]:,} rows x {df.shape[1]} columns")
    initial_count = len(df)

    # Step 1: Fix column names
    print("\n[2/9] Fixing column names...")
    original_columns = df.columns.tolist()
    df.columns = df.columns.str.replace('Female', '', regex=False).str.strip()

    renamed_cols = [(old, new) for old, new in zip(original_columns, df.columns) if old != new]
    if renamed_cols:
        print("  Renamed columns:")
        for old, new in renamed_cols:
            print(f"    '{old}' -> '{new}'")

    # Step 2: Remove 'Female' corruption from all non-Gender columns
    print("\n[3/9] Removing 'Female' text corruption from data...")
    corruption_count = 0

    for col in df.columns:
        if col != 'Gender' and df[col].dtype == 'object':
            # Count corrupted entries before fixing
            before = df[col].astype(str).str.contains('Female', na=False).sum()

            # Remove 'Female' text
            df[col] = df[col].astype(str).str.replace('Female', '', regex=False)

            corruption_count += before

    print(f"  [OK] Fixed {corruption_count:,} corrupted entries")

    # Step 3: Remove empty columns
    print("\n[4/9] Removing empty columns...")
    # Identify empty columns
    empty_cols = []
    for col in df.columns:
        if df[col].isnull().all() or (df[col].astype(str).str.strip() == '').all():
            empty_cols.append(col)

    if empty_cols:
        df = df.drop(columns=empty_cols)
        print(f"  [OK] Removed {len(empty_cols)} empty columns: {empty_cols}")
    else:
        print("  No empty columns found")

    # Step 4: Standardize NA values
    print("\n[5/9] Standardizing missing values...")
    # Replace various forms of NA with None
    na_variants = ['NA', 'N/A', 'na', 'n/a', 'nan', 'NaN', 'none', 'None', '']
    df = df.replace(na_variants, None)
    print(f"  [OK] Standardized NA values to None/NaN")

    # Step 5: Clean and standardize individual fields
    print("\n[6/9] Cleaning individual fields...")

    # Clean email
    if 'Email' in df.columns:
        df['Email'] = df['Email'].str.lower().str.strip()
        # Remove invalid emails
        invalid_emails = df['Email'].notna() & ~df['Email'].str.contains('@', na=False)
        df.loc[invalid_emails, 'Email'] = None
        print(f"  [OK] Email: lowercase, trimmed, removed {invalid_emails.sum()} invalid")

    # Clean and rename followers column
    if 'ollowers' in df.columns:
        df.rename(columns={'ollowers': 'Followers'}, inplace=True)
        print("  [OK] Renamed 'ollowers' -> 'Followers'")

    # Convert followers to numeric (handle 'k', 'm' suffixes)
    if 'Followers' in df.columns:
        def parse_followers(val):
            if pd.isna(val):
                return None
            val = str(val).strip().lower()
            if val == '' or val == 'none':
                return None

            # Handle 'k' and 'm' suffixes
            if 'k' in val:
                try:
                    return int(float(val.replace('k', '')) * 1000)
                except:
                    return None
            elif 'm' in val:
                try:
                    return int(float(val.replace('m', '')) * 1000000)
                except:
                    return None
            else:
                try:
                    return int(float(val))
                except:
                    return None

        df['Followers'] = df['Followers'].apply(parse_followers)
        print(f"  [OK] Followers: converted to numeric (handled k/m suffixes)")

    # Extract Instagram handle from URL
    if 'IG Link' in df.columns:
        df['Instagram_Handle'] = df['IG Link'].str.extract(r'instagram\.com/([^/\?\s]+)', expand=False)
        # Clean up handles
        df['Instagram_Handle'] = df['Instagram_Handle'].str.strip().str.lower()
        handles_extracted = df['Instagram_Handle'].notna().sum()
        print(f"  [OK] Extracted {handles_extracted:,} Instagram handles from URLs")

    # Clean contact numbers
    if 'Contact' in df.columns:
        # Remove non-numeric characters
        df['Contact'] = df['Contact'].astype(str).str.replace(r'\D', '', regex=True)
        # Set invalid contacts (less than 10 digits) to None
        df.loc[df['Contact'].str.len() < 10, 'Contact'] = None
        # Remove leading zeros and country code if present
        df['Contact'] = df['Contact'].str.replace(r'^0+', '', regex=True)
        df['Contact'] = df['Contact'].str.replace(r'^91', '', regex=True)
        df.loc[df['Contact'].str.len() != 10, 'Contact'] = None
        valid_contacts = df['Contact'].notna().sum()
        print(f"  [OK] Contact: cleaned, {valid_contacts:,} valid 10-digit numbers")

    # Standardize Gender values
    if 'Gender' in df.columns:
        # Map common variations
        gender_mapping = {
            'male': 'Male',
            'female': 'Female',
            'couple': 'Couple',
            'other': 'Other',
            'kid': 'Kid',
            'kids': 'Kid'
        }
        df['Gender'] = df['Gender'].str.lower().str.strip().map(gender_mapping).fillna(df['Gender'])
        print(f"  [OK] Gender: standardized values")

    # Clean Location
    if 'Location' in df.columns:
        df['Location'] = df['Location'].str.strip().str.title()
        # Standardize common variations
        location_mapping = {
            'Delhincr': 'Delhi NCR',
            'New Delhi': 'Delhi',
            'Mumbai': 'Mumbai',
            'Bengaluru': 'Bangalore',
            'Kolkata': 'Kolkata'
        }
        for old, new in location_mapping.items():
            df.loc[df['Location'] == old, 'Location'] = new
        print(f"  [OK] Location: standardized format")

    # Clean Genre (convert comma-separated to pipe-separated for PostgreSQL array)
    if 'Genre' in df.columns:
        df['Genre'] = df['Genre'].str.replace(', ', '|')
        df['Genre'] = df['Genre'].str.replace(',', '|')
        print(f"  [OK] Genre: converted to pipe-separated format")

    # Step 6: Remove duplicates
    print("\n[7/9] Removing duplicate records...")

    # Remove exact duplicates
    exact_dups = df.duplicated().sum()
    df = df.drop_duplicates()
    print(f"  [OK] Removed {exact_dups} exact duplicate rows")

    # Remove duplicate contacts (keep first occurrence)
    if 'Contact' in df.columns:
        contact_dups_before = df[df['Contact'].notna()].duplicated(subset=['Contact']).sum()
        df = df.drop_duplicates(subset=['Contact'], keep='first')
        print(f"  [OK] Removed {contact_dups_before:,} duplicate contact numbers")

    # Remove duplicate emails (keep first occurrence)
    if 'Email' in df.columns:
        email_dups = df[df['Email'].notna()].duplicated(subset=['Email']).sum()
        df = df.drop_duplicates(subset=['Email'], keep='first')
        print(f"  [OK] Removed {email_dups} duplicate emails")

    # Remove duplicate Instagram links
    if 'IG Link' in df.columns:
        ig_dups = df[df['IG Link'].notna()].duplicated(subset=['IG Link']).sum()
        df = df.drop_duplicates(subset=['IG Link'], keep='first')
        print(f"  [OK] Removed {ig_dups} duplicate Instagram links")

    # Step 7: Data quality validation
    print("\n[8/9] Validating data quality...")

    issues = []

    # Check for records with no contact info at all
    no_contact_info = df[(df['Contact'].isna()) & (df['Email'].isna()) & (df['IG Link'].isna())]
    if len(no_contact_info) > 0:
        issues.append(f"  [WARNING] {len(no_contact_info)} records have no contact information")
        # Optionally remove these
        # df = df[~((df['Contact'].isna()) & (df['Email'].isna()) & (df['IG Link'].isna()))]

    # Check for invalid follower counts (outliers)
    if 'Followers' in df.columns:
        invalid_followers = df[(df['Followers'] > 1000000000) | (df['Followers'] < 0)]
        if len(invalid_followers) > 0:
            issues.append(f"  [WARNING] {len(invalid_followers)} records have invalid follower counts")
            df.loc[(df['Followers'] > 1000000000) | (df['Followers'] < 0), 'Followers'] = None

    if issues:
        print("  Issues found:")
        for issue in issues:
            print(issue)
    else:
        print("  [OK] No major data quality issues detected")

    # Step 8: Reorder columns for better readability
    print("\n[9/9] Finalizing cleaned dataset...")

    # Define preferred column order
    preferred_order = ['Name', 'Contact', 'Email', 'IG Link', 'Instagram_Handle',
                      'Followers', 'Location', 'Gender', 'Genre', 'Brand', 'Address']

    # Reorder columns (keep only existing ones)
    existing_cols = [col for col in preferred_order if col in df.columns]
    other_cols = [col for col in df.columns if col not in existing_cols]
    df = df[existing_cols + other_cols]

    print(f"\nFinal shape: {df.shape[0]:,} rows x {df.shape[1]} columns")

    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    # Save cleaned data
    print(f"\nSaving cleaned data to: {output_file}")
    df.to_csv(output_file, index=False)

    # Generate cleaning report
    print("\n" + "="*80)
    print("CLEANING SUMMARY REPORT")
    print("="*80)
    print(f"Original records:        {initial_count:,}")
    print(f"Final records:           {len(df):,}")
    print(f"Records removed:         {initial_count - len(df):,}")
    print(f"Final columns:           {len(df.columns)}")
    print(f"\nData Completeness:")

    for col in df.columns:
        non_null = df[col].notna().sum()
        completeness = (non_null / len(df)) * 100
        print(f"  {col:20s}: {non_null:7,} ({completeness:5.1f}%)")

    print("\n" + "="*80)
    print("✅ DATA CLEANING COMPLETE!")
    print("="*80)

    return df


if __name__ == "__main__":
    # File paths
    input_csv = r"c:\3 Folks Media\WIP_Master_Data - sanitized_merged_dataset.csv"
    output_csv = r"c:\3 Folks Media\data\processed\cleaned_influencers.csv"

    # Run cleaning
    try:
        cleaned_df = clean_influencer_csv(input_csv, output_csv)
        print(f"\n[OK] Cleaned CSV saved successfully!")
        print(f"  Location: {output_csv}")
        print(f"\nYou can now proceed with database migration.")
    except Exception as e:
        print(f"\n[ERROR] Error during cleaning: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
