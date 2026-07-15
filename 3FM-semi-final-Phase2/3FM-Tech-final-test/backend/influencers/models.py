from django.db import models
from django.contrib.postgres.fields import ArrayField
from django.contrib.postgres.indexes import GinIndex
from django.core.validators import MinValueValidator, RegexValidator


class Influencer(models.Model):
    """
    Influencer model representing content creators in the database.
    Based on cleaned dataset with 407,904 records.
    """

    # Gender choices
    GENDER_CHOICES = [
        ('Male', 'Male'),
        ('Female', 'Female'),
        ('Couple', 'Couple'),
        ('Kid', 'Kid'),
        ('Other', 'Other'),
    ]

    # Follower tier classification
    TIER_NANO = 'nano'          # 1-10K
    TIER_MICRO = 'micro'        # 10K-100K
    TIER_MID = 'mid'            # 100K-1M
    TIER_MACRO = 'macro'        # 1M-10M
    TIER_MEGA = 'mega'          # 10M+

    # Basic Information
    name = models.CharField(
        max_length=255,
        db_index=True,
        help_text="Influencer's full name"
    )

    # Contact Information
    contact = models.CharField(
        max_length=10,
        blank=True,
        null=True,
        validators=[
            RegexValidator(
                regex=r'^\d{10}$',
                message='Contact must be exactly 10 digits',
                code='invalid_contact'
            )
        ],
        help_text="10-digit Indian mobile number (without country code)"
    )

    email = models.EmailField(
        max_length=255,
        blank=True,
        null=True,
        db_index=True,
        help_text="Email address (lowercase)"
    )

    # Instagram Information
    ig_link = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        help_text="Full Instagram profile URL"
    )

    instagram_handle = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        db_index=True,
        help_text="Instagram username (without @)"
    )

    # Metrics
    followers = models.IntegerField(
        blank=True,
        null=True,
        validators=[MinValueValidator(0)],
        db_index=True,
        help_text="Instagram follower count"
    )

    # Demographics
    location = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        db_index=True,
        help_text="Geographic location (city/state)"
    )

    gender = models.CharField(
        max_length=20,
        choices=GENDER_CHOICES,
        blank=True,
        null=True,
        db_index=True,
        help_text="Gender category"
    )

    # Content Categories
    genre = models.TextField(
        blank=True,
        null=True,
        help_text="Content niches (pipe-separated: Fashion|Lifestyle|Beauty)"
    )

    # Brand Collaboration
    brand = models.TextField(
        blank=True,
        null=True,
        help_text="Brand collaboration history"
    )

    address = models.TextField(
        blank=True,
        null=True,
        help_text="Physical address"
    )

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Last Instagram follower sync timestamp"
    )

    # Search field for full-text search (populated via trigger/migration)
    search_vector = models.TextField(
        blank=True,
        null=True,
        editable=False,
        help_text="Full-text search index (auto-generated)"
    )

    class Meta:
        db_table = 'influencers'
        ordering = ['-followers', 'name']
        indexes = [
            models.Index(fields=['name'], name='idx_name'),
            models.Index(fields=['instagram_handle'], name='idx_ig_handle'),
            models.Index(fields=['email'], name='idx_email'),
            models.Index(fields=['followers'], name='idx_followers'),
            models.Index(fields=['location'], name='idx_location'),
            models.Index(fields=['gender'], name='idx_gender'),
            models.Index(fields=['-followers'], name='idx_followers_desc'),
            # GIN index for full-text search (requires PostgreSQL)
            # GinIndex(fields=['search_vector'], name='idx_search_vector'),
        ]
        verbose_name = 'Influencer'
        verbose_name_plural = 'Influencers'

    def __str__(self):
        handle = f"@{self.instagram_handle}" if self.instagram_handle else "No Handle"
        return f"{self.name} ({handle})"

    @property
    def tier(self):
        """Calculate influencer tier based on follower count."""
        if not self.followers:
            return None

        if self.followers < 10000:
            return self.TIER_NANO
        elif self.followers < 100000:
            return self.TIER_MICRO
        elif self.followers < 1000000:
            return self.TIER_MID
        elif self.followers < 10000000:
            return self.TIER_MACRO
        else:
            return self.TIER_MEGA

    @property
    def genre_list(self):
        """Parse pipe-separated genres into a list."""
        if not self.genre:
            return []
        return [g.strip() for g in self.genre.split('|') if g.strip()]

    @property
    def has_complete_contact_info(self):
        """Check if influencer has all three contact methods."""
        return bool(self.contact and self.email and self.ig_link)

    def save(self, *args, **kwargs):
        # Ensure email is lowercase
        if self.email:
            self.email = self.email.lower().strip()

        # Ensure Instagram handle is lowercase
        if self.instagram_handle:
            self.instagram_handle = self.instagram_handle.lower().strip()

        super().save(*args, **kwargs)


class BrandCollaboration(models.Model):
    """
    Track individual brand collaborations with influencers.
    Allows multiple brands per influencer with detailed history.
    """

    CAMPAIGN_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    influencer = models.ForeignKey(
        'Influencer',
        on_delete=models.CASCADE,
        related_name='collaborations',
        help_text="Associated influencer"
    )

    brand_name = models.CharField(
        max_length=255,
        db_index=True,
        help_text="Brand/company name"
    )

    campaign_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Specific campaign name"
    )

    status = models.CharField(
        max_length=20,
        choices=CAMPAIGN_STATUS_CHOICES,
        default='completed',
        help_text="Campaign status"
    )

    start_date = models.DateField(
        blank=True,
        null=True,
        help_text="Campaign start date"
    )

    end_date = models.DateField(
        blank=True,
        null=True,
        help_text="Campaign end date"
    )

    compensation = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        blank=True,
        null=True,
        help_text="Compensation amount (INR)"
    )

    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Additional notes about the collaboration"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'brand_collaborations'
        ordering = ['-start_date', '-created_at']
        indexes = [
            models.Index(fields=['brand_name'], name='idx_brand_name'),
            models.Index(fields=['status'], name='idx_collab_status'),
            models.Index(fields=['-start_date'], name='idx_start_date_desc'),
        ]
        verbose_name = 'Brand Collaboration'
        verbose_name_plural = 'Brand Collaborations'

    def __str__(self):
        return f"{self.influencer.name} x {self.brand_name}"


class ImportLog(models.Model):
    """
    Track CSV import operations for audit trail.
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    filename = models.CharField(max_length=255)
    total_records = models.IntegerField(default=0)
    imported_records = models.IntegerField(default=0)
    failed_records = models.IntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    error_log = models.TextField(blank=True, null=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'import_logs'
        ordering = ['-started_at']
        verbose_name = 'Import Log'
        verbose_name_plural = 'Import Logs'

    def __str__(self):
        return f"{self.filename} - {self.status} ({self.imported_records}/{self.total_records})"
