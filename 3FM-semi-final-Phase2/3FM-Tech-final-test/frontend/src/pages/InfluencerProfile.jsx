import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Instagram, Mail, Phone, MapPin, Users, Calendar, ExternalLink } from 'lucide-react';
import { influencersAPI } from '../services/api';

const InfluencerProfile = () => {
  const { id } = useParams();
  const [influencer, setInfluencer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInfluencer();
  }, [id]);

  const fetchInfluencer = async () => {
    try {
      const response = await influencersAPI.getById(id);
      setInfluencer(response.data);
    } catch (error) {
      console.error('Error fetching influencer:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTierBadge = (followers) => {
    if (!followers) return { label: 'N/A', color: 'bg-gray-500' };
    if (followers < 10000) return { label: 'Nano', color: 'bg-blue-500' };
    if (followers < 100000) return { label: 'Micro', color: 'bg-green-500' };
    if (followers < 1000000) return { label: 'Mid-tier', color: 'bg-yellow-500' };
    if (followers < 10000000) return { label: 'Macro', color: 'bg-red-500' };
    return { label: 'Mega', color: 'bg-purple-500' };
  };

  const formatFollowers = (count) => {
    if (!count) return 'N/A';
    if (count >= 1000000) return `${(count / 1000000).toFixed(2)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toLocaleString();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">Loading profile...</div>
      </div>
    );
  }

  if (!influencer) {
    return (
      <div className="text-center py-12">
        <p className="text-lg text-gray-600">Influencer not found</p>
        <Link to="/influencers" className="text-indigo-600 hover:underline mt-4 inline-block">
          Back to Influencers
        </Link>
      </div>
    );
  }

  const tier = getTierBadge(influencer.followers);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link to="/influencers" className="flex items-center text-indigo-600 hover:text-indigo-700 mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Influencers
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{influencer.name}</h1>
            {influencer.instagram_handle && (
              <p className="text-lg text-gray-600 mt-1">@{influencer.instagram_handle}</p>
            )}
          </div>
          <span className={`${tier.color} text-white px-4 py-2 rounded-lg text-sm font-medium`}>
            {tier.label} Influencer
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Statistics</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center text-gray-600 mb-2">
                  <Users className="w-5 h-5 mr-2" />
                  <span className="text-sm">Followers</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{formatFollowers(influencer.followers)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center text-gray-600 mb-2">
                  <MapPin className="w-5 h-5 mr-2" />
                  <span className="text-sm">Location</span>
                </div>
                <p className="text-lg font-semibold text-gray-900">{influencer.location || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* About */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">About</h2>
            <div className="space-y-3">
              <div className="flex items-start">
                <span className="text-sm font-medium text-gray-600 w-32">Gender:</span>
                <span className="text-sm text-gray-900">{influencer.gender || 'N/A'}</span>
              </div>
              <div className="flex items-start">
                <span className="text-sm font-medium text-gray-600 w-32">Genres:</span>
                <div className="flex-1">
                  {influencer.genre ? (
                    <div className="flex flex-wrap gap-2">
                      {influencer.genre.split('|').map((gen, idx) => (
                        <span key={idx} className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm">
                          {gen.trim()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-900">N/A</span>
                  )}
                </div>
              </div>
              {influencer.address && (
                <div className="flex items-start">
                  <span className="text-sm font-medium text-gray-600 w-32">Address:</span>
                  <span className="text-sm text-gray-900">{influencer.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Commercials/Pricing */}
          {influencer.brand && (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center">
                <span className="text-green-600 mr-2">💰</span>
                Commercials & Pricing
              </h2>
              <div className="bg-white rounded-lg p-4 border border-green-100">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{influencer.brand}</p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Information */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Contact Information</h2>
            <div className="space-y-3">
              {influencer.email && (
                <a href={`mailto:${influencer.email}`} className="flex items-center text-gray-700 hover:text-indigo-600 transition-colors">
                  <Mail className="w-5 h-5 mr-3" />
                  <span className="text-sm">{influencer.email}</span>
                </a>
              )}
              {influencer.contact && (
                <a href={`tel:${influencer.contact}`} className="flex items-center text-gray-700 hover:text-indigo-600 transition-colors">
                  <Phone className="w-5 h-5 mr-3" />
                  <span className="text-sm">{influencer.contact}</span>
                </a>
              )}
              {influencer.ig_link && (
                <a href={influencer.ig_link} target="_blank" rel="noopener noreferrer" className="flex items-center text-gray-700 hover:text-indigo-600 transition-colors">
                  <Instagram className="w-5 h-5 mr-3" />
                  <span className="text-sm">Instagram Profile</span>
                  <ExternalLink className="w-4 h-4 ml-auto" />
                </a>
              )}
              {!influencer.email && !influencer.contact && !influencer.ig_link && (
                <p className="text-sm text-gray-500">No contact information available</p>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Record Info</h2>
            <div className="space-y-3">
              <div className="flex items-center text-sm">
                <Calendar className="w-4 h-4 mr-2 text-gray-600" />
                <span className="text-gray-600">Added:</span>
                <span className="ml-auto text-gray-900">{formatDate(influencer.created_at)}</span>
              </div>
              <div className="flex items-center text-sm">
                <Calendar className="w-4 h-4 mr-2 text-gray-600" />
                <span className="text-gray-600">Updated:</span>
                <span className="ml-auto text-gray-900">{formatDate(influencer.updated_at)}</span>
              </div>
              {influencer.last_synced_at && (
                <div className="flex items-center text-sm">
                  <Calendar className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-gray-600">Last Synced:</span>
                  <span className="ml-auto text-gray-900">{formatDate(influencer.last_synced_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfluencerProfile;
