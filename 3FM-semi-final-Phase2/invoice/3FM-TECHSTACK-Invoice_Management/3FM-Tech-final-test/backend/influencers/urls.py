from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import InfluencerViewSet, BrandCollaborationViewSet, ImportLogViewSet

# Create router and register viewsets
router = DefaultRouter()
router.register(r'influencers', InfluencerViewSet, basename='influencer')
router.register(r'campaigns', BrandCollaborationViewSet, basename='campaign')
router.register(r'import-logs', ImportLogViewSet, basename='importlog')

urlpatterns = [
   # API endpoints via router
    path('', include(router.urls)),
]
