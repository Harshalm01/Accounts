#!/usr/bin/env python3
"""
IMPROVED Data Cleaning Script for 3 Folks Media
Strategy: Clean data but preserve more records with smart deduplication
"""
import pandas as pd
import re
import sys
import os
from datetime import datetime

def clean_influencer_csv_v2(input_file, output_file):
    """
    Clean the influencer CSV with less aggressive deduplication.

    Strategy:
    - Apply all data cleaning (Female corruption fix, standardization)
    - Only remove duplicates when they have IDENTICAL contact info across ALL fields
    - Keep records with unique combinations even if they share one field
    """
    print("="*80)
    print("3 FOLKS MEDIA - IMPROVED DATA CLEANING SCRIPT V2")
    print("="*80)

    # Read CSV
    print(f"\n[1/10] Reading CSV from: {input_file}")
    try:
        df = pd.read_csv(input_file, low_memory=False)
        print(f"[OK] Successfully loaded {len(df):,} records with {len(df.columns)} columns")
    except Exception as e:
        print(f"[ERROR] Error reading CSV: {e}")
        sys.exit(1)

    print(f"\nOriginal shape: {df.shape[0]:,} rows x {df.shape[1]} columns")
    initial_count = len(df)

    # Step 1: Fix column names
    print("\n[2/10] Fixing column names...")
    original_columns = df.columns.tolist()
    df.columns = df.columns.str.replace('Female', '', regex=False).str.strip()

    renamed_cols = [(old, new) for old, new in zip(original_columns, df.columns) if old != new]
    if renamed_cols:
        print("  Renamed columns:")
        for old, new in renamed_cols:
            print(f"    '{old}' -> '{new}'")

    # Step 2: Remove 'Female' corruption from all non-Gender columns
    print("\n[3/10] Removing 'Female' text corruption from data...")
    corruption_count = 0

    for col in df.columns:
        if col != 'Gender' and df[col].dtype == 'object':
            before = df[col].astype(str).str.contains('Female', na=False).sum()
            df[col] = df[col].astype(str).str.replace('Female', '', regex=False)
            corruption_count += before

    print(f"  [OK] Fixed {corruption_count:,} corrupted entries")

    # Step 3: Remove empty columns
    print("\n[4/10] Removing empty columns...")
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
    print("\n[5/10] Standardizing missing values...")
    na_variants = ['NA', 'N/A', 'na', 'n/a', 'nan', 'NaN', 'none', 'None', '']
    df = df.replace(na_variants, None)
    print(f"  [OK] Standardized NA values to None/NaN")

    # Step 5: Clean and standardize individual fields
    print("\n[6/10] Cleaning individual fields...")

    # Clean email
    if 'Email' in df.columns:
        df['Email'] = df['Email'].str.lower().str.strip()
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
        df['Instagram_Handle'] = df['Instagram_Handle'].str.strip().str.lower()
        handles_extracted = df['Instagram_Handle'].notna().sum()
        print(f"  [OK] Extracted {handles_extracted:,} Instagram handles from URLs")

    # Clean contact numbers
    if 'Contact' in df.columns:
        df['Contact'] = df['Contact'].astype(str).str.replace(r'\D', '', regex=True)
        df.loc[df['Contact'].str.len() < 10, 'Contact'] = None
        df['Contact'] = df['Contact'].str.replace(r'^0+', '', regex=True)
        df['Contact'] = df['Contact'].str.replace(r'^91', '', regex=True)
        df.loc[df['Contact'].str.len() != 10, 'Contact'] = None
        valid_contacts = df['Contact'].notna().sum()
        print(f"  [OK] Contact: cleaned, {valid_contacts:,} valid 10-digit numbers")

    # Standardize Gender values
    if 'Gender' in df.columns:
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

    # Clean Genre
    if 'Genre' in df.columns:
        df['Genre'] = df['Genre'].str.replace(', ', '|')
        df['Genre'] = df['Genre'].str.replace(',', '|')
        print(f"  [OK] Genre: converted to pipe-separated format")

    # Step 6: IMPROVED DEDUPLICATION STRATEGY
    print("\n[7/10] Smart deduplication (preserving more records)...")

    # Remove exact duplicates first
    exact_dups = df.duplicated().sum()
    df = df.drop_duplicates()
    print(f"  [OK] Removed {exact_dups} exact duplicate rows")

    # Create composite identifier for deduplication
    # Only consider it a duplicate if Contact+Email+Instagram are ALL the same
    print("\n  Creating composite identifiers...")

    # Reset index to ensure unique IDs
    df = df.reset_index(drop=True)

    # Fill NaN with unique placeholders to avoid false matches
    df['_contact_key'] = df.apply(lambda x: x['Contact'] if pd.notna(x['Contact']) else f'no_contact_{x.name}', axis=1)
    df['_email_key'] = df.apply(lambda x: x['Email'] if pd.notna(x['Email']) else f'no_email_{x.name}', axis=1)
    df['_ig_key'] = df.apply(lambda x: x['Instagram_Handle'] if pd.notna(x['Instagram_Handle']) else f'no_ig_{x.name}', axis=1)

    # Composite key: only duplicates if ALL THREE match
    df['_composite_key'] = df['_contact_key'] + '|' + df['_email_key'] + '|' + df['_ig_key']

    composite_dups = df.duplicated(subset=['_composite_key']).sum()
    df = df.drop_duplicates(subset=['_composite_key'], keep='first')
    print(f"  [OK] Removed {composite_dups:,} records with identical Contact+Email+Instagram")

    # Clean up temporary columns
    df = df.drop(columns=['_contact_key', '_email_key', '_ig_key', '_composite_key'])

    # Step 7: Remove obviously fake/test data
    print("\n[8/10] Removing fake/test data...")

    fake_count = 0

    # Remove test phone numbers
    if 'Contact' in df.columns:
        fake_phones = ['1234567890', '0000000000', '9999999999', '1111111111']
        fake_mask = df['Contact'].isin(fake_phones)
        fake_count += fake_mask.sum()
        df = df[~fake_mask]

    # Remove test emails
    if 'Email' in df.columns:
        test_email_patterns = ['test@', 'fake@', 'demo@', 'sample@', 'example@']
        test_mask = df['Email'].notna() & df['Email'].str.contains('|'.join(test_email_patterns), na=False, case=False)
        fake_count += test_mask.sum()
        df = df[~test_mask]

    print(f"  [OK] Removed {fake_count} fake/test records")

    # Step 8: Data quality validation
    print("\n[9/10] Validating data quality...")

    issues = []

    # Remove records with NO contact info at all
    no_contact_info = (df['Contact'].isna()) & (df['Email'].isna()) & (df['IG Link'].isna())
    no_contact_count = no_contact_info.sum()
    if no_contact_count > 0:
        df = df[~no_contact_info]
        issues.append(f"  [WARNING] Removed {no_contact_count} records with no contact information")

    # Check for invalid follower counts
    if 'Followers' in df.columns:
        invalid_followers = (df['Followers'] > 1000000000) | (df['Followers'] < 0)
        if invalid_followers.sum() > 0:
            issues.append(f"  [WARNING] Fixed {invalid_followers.sum()} invalid follower counts")
            df.loc[invalid_followers, 'Followers'] = None

    if issues:
        print("  Data quality fixes:")
        for issue in issues:
            print(issue)
    else:
        print("  [OK] No major data quality issues detected")

    # Step 9: Reorder columns
    print("\n[10/10] Finalizing cleaned dataset...")

    preferred_order = ['Name', 'Contact', 'Email', 'IG Link', 'Instagram_Handle',
                      'Followers', 'Location', 'Gender', 'Genre', 'Brand', 'Address']
    existing_cols = [col for col in preferred_order if col in df.columns]
    other_cols = [col for col in df.columns if col not in existing_cols]
    df = df[existing_cols + other_cols]

    print(f"\nFinal shape: {df.shape[0]:,} rows x {df.shape[1]} columns")

    # Save cleaned data
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    print(f"\nSaving cleaned data to: {output_file}")
    df.to_csv(output_file, index=False)

    # Generate report
    print("\n" + "="*80)
    print("CLEANING SUMMARY REPORT - V2 (IMPROVED)")
    print("="*80)
    print(f"Original records:        {initial_count:,}")
    print(f"Final records:           {len(df):,}")
    print(f"Records removed:         {initial_count - len(df):,}")
    print(f"Retention rate:          {len(df)/initial_count*100:.1f}%")
    print(f"\nComparison to V1:")
    print(f"  V1 kept: 94,375 (23.1%)")
    print(f"  V2 kept: {len(df):,} ({len(df)/initial_count*100:.1f}%)")
    print(f"  Additional records saved: {len(df) - 94375:,}")

    print(f"\nData Completeness:")
    for col in ['Name', 'Contact', 'Email', 'IG Link', 'Instagram_Handle', 'Followers', 'Location', 'Gender']:
        if col in df.columns:
            non_null = df[col].notna().sum()
            completeness = (non_null / len(df)) * 100
            print(f"  {col:20s}: {non_null:7,} ({completeness:5.1f}%)")

    print("\n" + "="*80)
    print("DATA CLEANING COMPLETE - V2!")
    print("="*80)

    return df


if __name__ == "__main__":
    input_csv = r"c:\3 Folks Media\WIP_Master_Data - sanitized_merged_dataset.csv"
    output_csv = r"c:\3 Folks Media\data\processed\cleaned_influencers_v2_full.csv"

    try:
        cleaned_df = clean_influencer_csv_v2(input_csv, output_csv)
        print(f"\n[OK] Improved cleaned CSV saved successfully!")
        print(f"  Location: {output_csv}")
        print(f"\nYou now have MORE records while maintaining data quality!")
    except Exception as e:
        print(f"\n[ERROR] Error during cleaning: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
