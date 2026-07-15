import pandas as pd

# Load cleaned data
df = pd.read_csv(r'c:\3 Folks Media\data\processed\cleaned_influencers.csv')

print("="*80)
print("CLEANED DATA REVIEW - 3 FOLKS MEDIA")
print("="*80)

print(f"\nTotal Records: {len(df):,}")
print(f"Total Columns: {len(df.columns)}")

# Show sample records with all contact info
print("\n" + "="*80)
print("SAMPLE RECORDS (with complete info)")
print("="*80)

# Filter records with followers data
sample = df[df['Followers'].notna()].head(10)

for idx, row in sample.iterrows():
    print(f"\n[{idx+1}] {row['Name']}")
    print(f"    Contact: {row['Contact']}")
    print(f"    Email: {row['Email']}")
    print(f"    Instagram: @{row['Instagram_Handle']} ({int(row['Followers']):,} followers)")
    if pd.notna(row['Location']):
        print(f"    Location: {row['Location']}")
    if pd.notna(row['Gender']):
        print(f"    Gender: {row['Gender']}")
    if pd.notna(row['Genre']):
        print(f"    Genre: {row['Genre']}")

# Statistics
print("\n" + "="*80)
print("DATA QUALITY STATISTICS")
print("="*80)

print("\nFollower Distribution (for records with follower data):")
if df['Followers'].notna().sum() > 0:
    followers_stats = df['Followers'].describe()
    print(f"  Records with follower data: {df['Followers'].notna().sum():,}")
    print(f"  Min: {int(followers_stats['min']):,}")
    print(f"  25th percentile: {int(followers_stats['25%']):,}")
    print(f"  Median: {int(followers_stats['50%']):,}")
    print(f"  75th percentile: {int(followers_stats['75%']):,}")
    print(f"  Max: {int(followers_stats['max']):,}")
    print(f"  Average: {int(followers_stats['mean']):,}")

    # Follower tiers
    print("\nInfluencer Tiers:")
    nano = df[df['Followers'] < 10000].shape[0]
    micro = df[(df['Followers'] >= 10000) & (df['Followers'] < 100000)].shape[0]
    mid = df[(df['Followers'] >= 100000) & (df['Followers'] < 1000000)].shape[0]
    macro = df[df['Followers'] >= 1000000].shape[0]

    print(f"  Nano (< 10K): {nano:,}")
    print(f"  Micro (10K-100K): {micro:,}")
    print(f"  Mid-tier (100K-1M): {mid:,}")
    print(f"  Macro (1M+): {macro:,}")

# Gender distribution
print("\nGender Distribution:")
if 'Gender' in df.columns:
    gender_counts = df['Gender'].value_counts().head(10)
    for gender, count in gender_counts.items():
        print(f"  {gender}: {count:,} ({count/len(df)*100:.1f}%)")

# Top locations
print("\nTop 10 Locations:")
if 'Location' in df.columns:
    location_counts = df['Location'].value_counts().head(10)
    for loc, count in location_counts.items():
        print(f"  {loc}: {count:,}")

# Top genres
print("\nTop 10 Genres:")
if 'Genre' in df.columns:
    genre_counts = df['Genre'].value_counts().head(10)
    for genre, count in genre_counts.items():
        print(f"  {genre}: {count:,}")

# Top brands
print("\nTop 10 Brand Collaborations:")
if 'Brand' in df.columns:
    brand_counts = df['Brand'].value_counts().head(10)
    for brand, count in brand_counts.items():
        print(f"  {brand}: {count:,}")

# Contact info completeness
print("\n" + "="*80)
print("CONTACT INFORMATION COMPLETENESS")
print("="*80)

has_contact = df['Contact'].notna().sum()
has_email = df['Email'].notna().sum()
has_ig = df['IG Link'].notna().sum()
has_all = df[(df['Contact'].notna()) & (df['Email'].notna()) & (df['IG Link'].notna())].shape[0]

print(f"  Has Phone: {has_contact:,} ({has_contact/len(df)*100:.1f}%)")
print(f"  Has Email: {has_email:,} ({has_email/len(df)*100:.1f}%)")
print(f"  Has Instagram: {has_ig:,} ({has_ig/len(df)*100:.1f}%)")
print(f"  Has All Three: {has_all:,} ({has_all/len(df)*100:.1f}%)")

print("\n" + "="*80)
print("REVIEW COMPLETE")
print("="*80)
