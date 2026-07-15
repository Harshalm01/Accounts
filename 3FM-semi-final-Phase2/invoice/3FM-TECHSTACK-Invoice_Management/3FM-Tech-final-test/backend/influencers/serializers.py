from rest_framework import serializers
from .models import Influencer, BrandCollaboration, ImportLog


class InfluencerSerializer(serializers.ModelSerializer):
    """Serializer for Influencer model with all fields."""
    tier = serializers.ReadOnlyField()
    genre_list = serializers.ReadOnlyField()
    has_complete_contact_info = serializers.ReadOnlyField()

    class Meta:
        model = Influencer
        fields = [
            'id',
            'name',
            'contact',
            'email',
            'ig_link',
            'instagram_handle',
            'followers',
            'tier',
            'location',
            'gender',
            'genre',
            'genre_list',
            'brand',
            'address',
            'has_complete_contact_info',
            'created_at',
            'updated_at',
            'last_synced_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'last_synced_at']


class InfluencerListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    tier = serializers.ReadOnlyField()

    class Meta:
        model = Influencer
        fields = [
            'id',
            'name',
            'instagram_handle',
            'followers',
            'tier',
            'location',
            'gender',
            'genre',
            'contact',
            'email',
            'ig_link',
        ]


class BrandCollaborationSerializer(serializers.ModelSerializer):
    """Serializer for Brand Collaboration model."""
    influencer_name = serializers.CharField(source='influencer.name', read_only=True)
    influencer_handle = serializers.CharField(source='influencer.instagram_handle', read_only=True)

    class Meta:
        model = BrandCollaboration
        fields = [
            'id',
            'influencer',
            'influencer_name',
            'influencer_handle',
            'brand_name',
            'campaign_name',
            'status',
            'start_date',
            'end_date',
            'compensation',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ImportLogSerializer(serializers.ModelSerializer):
    """Serializer for Import Log model."""
    success_rate = serializers.SerializerMethodField()

    class Meta:
        model = ImportLog
        fields = [
            'id',
            'filename',
            'total_records',
            'imported_records',
            'failed_records',
            'success_rate',
            'status',
            'error_log',
            'started_at',
            'completed_at',
        ]
        read_only_fields = ['started_at', 'completed_at']

    def get_success_rate(self, obj):
        """Calculate success rate percentage."""
        if obj.total_records == 0:
            return 0
        return round((obj.imported_records / obj.total_records) * 100, 2)
