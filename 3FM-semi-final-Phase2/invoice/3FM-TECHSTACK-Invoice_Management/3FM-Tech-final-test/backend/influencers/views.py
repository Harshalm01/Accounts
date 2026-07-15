from django.db.models import Count, Avg, Q
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Influencer, BrandCollaboration, ImportLog
from .serializers import (
    InfluencerSerializer,
    InfluencerListSerializer,
    BrandCollaborationSerializer,
    ImportLogSerializer
)


class InfluencerViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Influencer model with filtering, searching, and stats.
    """
    queryset = Influencer.objects.all().order_by('-followers', 'name')
    serializer_class = InfluencerSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['gender', 'location']
    search_fields = ['name', 'email', 'instagram_handle', 'contact', 'location', 'genre']
    ordering_fields = ['name', 'followers', 'created_at', 'updated_at']

    def get_serializer_class(self):
        """Use lightweight serializer for list view."""
        if self.action == 'list':
            return InfluencerListSerializer
        return InfluencerSerializer

    def get_queryset(self):
        """Apply custom filters for follower tiers and ranges."""
        queryset = super().get_queryset()

        # Filter by tier
        tier = self.request.query_params.get('tier', None)
        if tier:
            if tier == 'nano':
                queryset = queryset.filter(followers__gte=1, followers__lt=10000)
            elif tier == 'micro':
                queryset = queryset.filter(followers__gte=10000, followers__lt=100000)
            elif tier == 'mid':
                queryset = queryset.filter(followers__gte=100000, followers__lt=1000000)
            elif tier == 'macro':
                queryset = queryset.filter(followers__gte=1000000, followers__lt=10000000)
            elif tier == 'mega':
                queryset = queryset.filter(followers__gte=10000000)

        # Filter by follower range
        min_followers = self.request.query_params.get('min_followers', None)
        max_followers = self.request.query_params.get('max_followers', None)

        if min_followers:
            queryset = queryset.filter(followers__gte=int(min_followers))
        if max_followers:
            queryset = queryset.filter(followers__lte=int(max_followers))

        return queryset

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Get dashboard statistics for influencers.
        """
        queryset = self.get_queryset()

        # Basic stats
        total_influencers = queryset.count()
        avg_followers = queryset.aggregate(Avg('followers'))['followers__avg'] or 0
        unique_locations = queryset.exclude(location__isnull=True).exclude(location='').values('location').distinct().count()
        complete_profiles = queryset.filter(
            contact__isnull=False,
            email__isnull=False,
            ig_link__isnull=False
        ).count()

        # Tier distribution
        tier_distribution = [
            {'name': 'Nano', 'value': queryset.filter(followers__gte=1, followers__lt=10000).count()},
            {'name': 'Micro', 'value': queryset.filter(followers__gte=10000, followers__lt=100000).count()},
            {'name': 'Mid-tier', 'value': queryset.filter(followers__gte=100000, followers__lt=1000000).count()},
            {'name': 'Macro', 'value': queryset.filter(followers__gte=1000000, followers__lt=10000000).count()},
            {'name': 'Mega', 'value': queryset.filter(followers__gte=10000000).count()},
        ]

        # Gender distribution
        gender_distribution = list(
            queryset.exclude(gender__isnull=True)
            .values('gender')
            .annotate(value=Count('id'))
            .order_by('-value')
        )
        gender_distribution = [{'name': item['gender'], 'value': item['value']} for item in gender_distribution]

        # Top locations
        top_locations = list(
            queryset.exclude(location__isnull=True)
            .exclude(location='')
            .exclude(location='--')
            .values('location')
            .annotate(value=Count('id'))
            .order_by('-value')[:10]
        )
        top_locations = [{'name': item['location'], 'value': item['value']} for item in top_locations]

        # Top genres (parse pipe-separated genres)
        genre_counts = {}
        for influencer in queryset.exclude(genre__isnull=True).exclude(genre=''):
            genres = influencer.genre.split('|')
            for genre in genres:
                genre = genre.strip()
                if genre:
                    genre_counts[genre] = genre_counts.get(genre, 0) + 1

        top_genres = [{'name': k, 'value': v} for k, v in sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:10]]

        return Response({
            'total_influencers': total_influencers,
            'avg_followers': round(avg_followers, 0),
            'unique_locations': unique_locations,
            'complete_profiles': complete_profiles,
            'tier_distribution': tier_distribution,
            'gender_distribution': gender_distribution,
            'top_locations': top_locations,
            'top_genres': top_genres,
        })


class BrandCollaborationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Brand Collaboration model.
    """
    queryset = BrandCollaboration.objects.all().select_related('influencer').order_by('-start_date', '-created_at')
    serializer_class = BrandCollaborationSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'brand_name', 'influencer']
    search_fields = ['brand_name', 'campaign_name', 'influencer__name']
    ordering_fields = ['start_date', 'end_date', 'compensation', 'created_at']


class ImportLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Import Log model (read-only).
    """
    queryset = ImportLog.objects.all().order_by('-started_at')
    serializer_class = ImportLogSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status']
    ordering_fields = ['started_at', 'completed_at', 'total_records', 'imported_records']
