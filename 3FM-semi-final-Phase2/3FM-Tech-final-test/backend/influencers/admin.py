from django.contrib import admin
from django.db.models import Q
from .models import Influencer, BrandCollaboration, ImportLog


class FollowerTierFilter(admin.SimpleListFilter):
    """
    Custom filter for influencer tiers based on follower count.
    Tiers: Nano (1-10K), Micro (10K-100K), Mid (100K-1M), Macro (1M-10M), Mega (10M+)
    """
    title = 'follower tier'
    parameter_name = 'tier'

    def lookups(self, request, model_admin):
        """Define the filter options."""
        return (
            ('nano', 'Nano (1-10K)'),
            ('micro', 'Micro (10K-100K)'),
            ('mid', 'Mid-tier (100K-1M)'),
            ('macro', 'Macro (1M-10M)'),
            ('mega', 'Mega (10M+)'),
            ('no_followers', 'No follower data'),
        )

    def queryset(self, request, queryset):
        """Filter the queryset based on selected tier."""
        if self.value() == 'nano':
            return queryset.filter(followers__gte=1, followers__lt=10000)
        elif self.value() == 'micro':
            return queryset.filter(followers__gte=10000, followers__lt=100000)
        elif self.value() == 'mid':
            return queryset.filter(followers__gte=100000, followers__lt=1000000)
        elif self.value() == 'macro':
            return queryset.filter(followers__gte=1000000, followers__lt=10000000)
        elif self.value() == 'mega':
            return queryset.filter(followers__gte=10000000)
        elif self.value() == 'no_followers':
            return queryset.filter(Q(followers__isnull=True) | Q(followers=0))
        return queryset


@admin.register(Influencer)
class InfluencerAdmin(admin.ModelAdmin):
    """
    Admin interface for Influencer model with advanced search and filtering.
    """

    # List display
    list_display = [
        'name',
        'instagram_handle',
        'email',
        'contact',
        'followers',
        'tier',
        'location',
        'gender',
        'has_complete_contact_info',
        'created_at',
    ]

    # List filters
    list_filter = [
        FollowerTierFilter,
        'gender',
        'location',
        'created_at',
        'updated_at',
    ]

    # Search fields (searches across these fields)
    search_fields = [
        'name',
        'email',
        'instagram_handle',
        'contact',
        'location',
        'genre',
    ]

    # Fields to display when editing
    fieldsets = (
        ('Basic Information', {
            'fields': ('name',)
        }),
        ('Contact Information', {
            'fields': ('contact', 'email', 'ig_link', 'instagram_handle')
        }),
        ('Metrics', {
            'fields': ('followers', 'last_synced_at')
        }),
        ('Demographics', {
            'fields': ('location', 'gender', 'address')
        }),
        ('Content & Collaborations', {
            'fields': ('genre', 'brand')
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    # Read-only fields
    readonly_fields = ['created_at', 'updated_at']

    # Ordering
    ordering = ['-followers', 'name']

    # Number of items per page
    list_per_page = 50

    # Date hierarchy
    date_hierarchy = 'created_at'

    # Actions
    actions = ['mark_for_sync']

    def mark_for_sync(self, request, queryset):
        """Mark selected influencers for Instagram sync."""
        count = queryset.count()
        self.message_user(request, f'{count} influencers marked for sync.')
    mark_for_sync.short_description = "Mark for Instagram sync"

    def has_complete_contact_info(self, obj):
        """Display if influencer has all contact methods."""
        return obj.has_complete_contact_info
    has_complete_contact_info.boolean = True
    has_complete_contact_info.short_description = 'Complete Contact'


@admin.register(BrandCollaboration)
class BrandCollaborationAdmin(admin.ModelAdmin):
    """
    Admin interface for Brand Collaboration model.
    """

    list_display = [
        'influencer',
        'brand_name',
        'campaign_name',
        'status',
        'start_date',
        'end_date',
        'compensation',
        'created_at',
    ]

    list_filter = [
        'status',
        'brand_name',
        'start_date',
        'created_at',
    ]

    search_fields = [
        'influencer__name',
        'brand_name',
        'campaign_name',
        'notes',
    ]

    fieldsets = (
        ('Collaboration Details', {
            'fields': ('influencer', 'brand_name', 'campaign_name', 'status')
        }),
        ('Timeline', {
            'fields': ('start_date', 'end_date')
        }),
        ('Financials', {
            'fields': ('compensation',)
        }),
        ('Additional Information', {
            'fields': ('notes',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    readonly_fields = ['created_at', 'updated_at']

    ordering = ['-start_date', '-created_at']

    list_per_page = 50

    date_hierarchy = 'start_date'

    # Autocomplete for influencer selection
    autocomplete_fields = ['influencer']


@admin.register(ImportLog)
class ImportLogAdmin(admin.ModelAdmin):
    """
    Admin interface for Import Log model.
    """

    list_display = [
        'filename',
        'status',
        'total_records',
        'imported_records',
        'failed_records',
        'success_rate',
        'started_at',
        'completed_at',
    ]

    list_filter = [
        'status',
        'started_at',
    ]

    search_fields = [
        'filename',
        'error_log',
    ]

    fieldsets = (
        ('Import Details', {
            'fields': ('filename', 'status')
        }),
        ('Statistics', {
            'fields': ('total_records', 'imported_records', 'failed_records')
        }),
        ('Error Information', {
            'fields': ('error_log',)
        }),
        ('Timeline', {
            'fields': ('started_at', 'completed_at')
        }),
    )

    readonly_fields = ['started_at']

    ordering = ['-started_at']

    list_per_page = 50

    date_hierarchy = 'started_at'

    def success_rate(self, obj):
        """Calculate and display success rate."""
        if obj.total_records == 0:
            return "N/A"
        rate = (obj.imported_records / obj.total_records) * 100
        return f"{rate:.1f}%"
    success_rate.short_description = 'Success Rate'


# Customize admin site headers
admin.site.site_header = "3 Folks Media - Influencer Management"
admin.site.site_title = "3FM Admin"
admin.site.index_title = "Influencer Platform Administration"
