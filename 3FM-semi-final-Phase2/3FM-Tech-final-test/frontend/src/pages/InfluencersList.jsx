import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, MapPin, Instagram, Mail, Phone, ExternalLink, Users, Plus } from 'lucide-react';
import { influencersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const InfluencersList = () => {
  const { can } = useAuth();
  const [influencers, setInfluencers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState({
    tier: '',
    gender: '',
    location: '',
    minFollowers: '',
    maxFollowers: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchInfluencers();
  }, [filters]);

  const fetchInfluencers = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.tier) params.tier = filters.tier;
      if (filters.gender) params.gender = filters.gender;
      if (filters.location) params.location = filters.location;
      if (filters.minFollowers) params.min_followers = filters.minFollowers;
      if (filters.maxFollowers) params.max_followers = filters.maxFollowers;
      if (searchQuery) params.search = searchQuery;

      const response = await influencersAPI.getAll(params);
      setInfluencers(response.data.results || response.data);
    } catch (error) {
      console.error('Error fetching influencers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchInfluencers();
  };

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
  };

  const resetFilters = () => {
    setFilters({
      tier: '',
      gender: '',
      location: '',
      minFollowers: '',
      maxFollowers: '',
    });
    setSearchQuery('');
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
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Influencers</h1>
        <div className="flex gap-2">
          {can('create') && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Influencer
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Filter className="w-4 h-4 mr-2" />
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, location, genre..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tier</label>
              <select
                value={filters.tier}
                onChange={(e) => handleFilterChange('tier', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Tiers</option>
                <option value="nano">Nano (1-10K)</option>
                <option value="micro">Micro (10K-100K)</option>
                <option value="mid">Mid-tier (100K-1M)</option>
                <option value="macro">Macro (1M-10M)</option>
                <option value="mega">Mega (10M+)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
              <select
                value={filters.gender}
                onChange={(e) => handleFilterChange('gender', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Couple">Couple</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
              <input
                type="text"
                value={filters.location}
                onChange={(e) => handleFilterChange('location', e.target.value)}
                placeholder="e.g., Mumbai, Delhi"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Min Followers</label>
              <input
                type="number"
                value={filters.minFollowers}
                onChange={(e) => handleFilterChange('minFollowers', e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Max Followers</label>
              <input
                type="number"
                value={filters.maxFollowers}
                onChange={(e) => handleFilterChange('maxFollowers', e.target.value)}
                placeholder="1000000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Influencers Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-lg text-gray-600">Loading influencers...</div>
        </div>
      ) : influencers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-md">
          <p className="text-lg text-gray-600">No influencers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {influencers.map((influencer) => {
            const tier = getTierBadge(influencer.followers);
            return (
              <div key={influencer.id} className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{influencer.name}</h3>
                    {influencer.instagram_handle && (
                      <p className="text-sm text-gray-600">@{influencer.instagram_handle}</p>
                    )}
                  </div>
                  <span className={`${tier.color} text-white text-xs px-2 py-1 rounded-full`}>
                    {tier.label}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <Users className="w-4 h-4 mr-2" />
                    <span>{formatFollowers(influencer.followers)} followers</span>
                  </div>

                  {influencer.location && (
                    <div className="flex items-center text-sm text-gray-600">
                      <MapPin className="w-4 h-4 mr-2" />
                      <span>{influencer.location}</span>
                    </div>
                  )}

                  {influencer.genre && (
                    <div className="mt-2">
                      <div className="flex flex-wrap gap-1">
                        {influencer.genre.split('|').slice(0, 3).map((gen, idx) => (
                          <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                            {gen.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-4">
                  {influencer.email && (
                    <a href={`mailto:${influencer.email}`} className="text-gray-600 hover:text-indigo-600">
                      <Mail className="w-4 h-4" />
                    </a>
                  )}
                  {influencer.contact && (
                    <a href={`tel:${influencer.contact}`} className="text-gray-600 hover:text-indigo-600">
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                  {influencer.ig_link && (
                    <a href={influencer.ig_link} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-indigo-600">
                      <Instagram className="w-4 h-4" />
                    </a>
                  )}
                </div>

                <Link
                  to={`/influencers/${influencer.id}`}
                  className="flex items-center justify-center w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  View Profile
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Influencer Modal */}
      {showAddModal && (
        <AddInfluencerModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchInfluencers();
          }}
        />
      )}
    </div>
  );
};

// Add Influencer Modal Component
const AddInfluencerModal = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    contact: '',
    ig_link: '',
    followers: '',
    location: '',
    gender: '',
    genre: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await influencersAPI.create({
        name: formData.name,
        email: formData.email || null,
        contact: formData.contact || null,
        ig_link: formData.ig_link || null,
        followers: parseInt(formData.followers) || 0,
        location: formData.location || null,
        gender: formData.gender || null,
        genre: formData.genre || null,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add influencer');
      console.error('Error adding influencer:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Add New Influencer</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Influencer Name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact
                </label>
                <input
                  type="text"
                  name="contact"
                  value={formData.contact}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="+91 1234567890"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Instagram Link
                </label>
                <input
                  type="url"
                  name="ig_link"
                  value={formData.ig_link}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="https://instagram.com/username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Followers <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="followers"
                  value={formData.followers}
                  onChange={handleChange}
                  required
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="10000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Mumbai, India"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gender
                </label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Couple">Couple</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Genre
                </label>
                <input
                  type="text"
                  name="genre"
                  value={formData.genre}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Fashion | Travel | Food"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Adding...' : 'Add Influencer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default InfluencersList;
