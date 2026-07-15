import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';

interface CommercialItem {
  platform: 'Instagram' | 'Youtube';
  type: string;
  count: number;
  countUnit: 'Thousand' | 'Lacs (L)';
  monthAdRights: number;
}

interface ContactInfo {
  contactType: 'Number' | 'Email';
  contactSubType?: string;
  contactValue: string;
}

interface Influencer {
  id: string;
  firstName: string;
  lastName: string;
  igLink: string;
  followers: number;
  followersUnit: 'K' | 'M';
  avgViews: number | null;
  avgViewsUnit: 'K' | 'M';
  primaryGenre: string;
  secondaryGenre?: string;
  city: string;
  state?: string;
  contact: ContactInfo;
  commercials: CommercialItem[];
  gender: string;
  createdAt: string;
  updatedAt: string;
}

const convertFollowersToNumber = (followers: number, _unit: 'K' | 'M'): number => {
  return followers;
};

export default function InfluencerDashboard() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingInfluencer, setEditingInfluencer] = useState<Influencer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInfluencers, setSelectedInfluencers] = useState<string[]>([]);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [viewingInfluencer, setViewingInfluencer] = useState<Influencer | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const [duplicateErrorMessage, setDuplicateErrorMessage] = useState('');
  
  // Filter states
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState({
    genres: [] as string[],
    followersRange: 'all' as 'all' | 'nano' | 'micro' | 'macro' | 'mega',
    locations: [] as string[],
    genders: [] as string[]
  });

  const fetchInfluencers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/influencers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setInfluencers(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch influencers:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfluencers();

    const newSocket = io(API_URL);

    newSocket.on('influencer:created', (influencer: Influencer) => {
      setInfluencers((prev) => [...prev, influencer]);
    });

    newSocket.on('influencer:updated', (updatedInfluencer: Influencer) => {
      setInfluencers((prev) =>
        prev.map((inf) => (inf.id === updatedInfluencer.id ? updatedInfluencer : inf))
      );
    });

    newSocket.on('influencer:deleted', (id: string) => {
      setInfluencers((prev) => prev.filter((inf) => inf.id !== id));
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const filteredInfluencers = influencers
    .filter((inf) => {
      const fullName = `${inf.firstName} ${inf.lastName}`.toLowerCase();
      const primaryGenre = inf.primaryGenre.toLowerCase();
      const location = `${inf.city}, ${inf.state}`.toLowerCase();
      const searchLower = searchTerm.toLowerCase();

      // Search filter
      const matchesSearch = (
        fullName.includes(searchLower) ||
        primaryGenre.includes(searchLower) ||
        location.includes(searchLower)
      );

      // Genre filter
      const matchesGenre = filters.genres.length === 0 || 
        filters.genres.some(genre => 
          inf.primaryGenre.toLowerCase().includes(genre.toLowerCase()) ||
          inf.secondaryGenre?.toLowerCase().includes(genre.toLowerCase())
        );

      // Followers range filter
      const followerCount = inf.followersUnit === 'M' 
        ? inf.followers * 1000000 
        : inf.followers * 1000;
      
      let matchesFollowers = true;
      if (filters.followersRange === 'nano') {
        matchesFollowers = followerCount < 10000;
      } else if (filters.followersRange === 'micro') {
        matchesFollowers = followerCount >= 10000 && followerCount < 100000;
      } else if (filters.followersRange === 'macro') {
        matchesFollowers = followerCount >= 100000 && followerCount < 1000000;
      } else if (filters.followersRange === 'mega') {
        matchesFollowers = followerCount >= 1000000;
      }

      // Location filter
      const matchesLocation = filters.locations.length === 0 || 
        filters.locations.some(loc => 
          inf.city.toLowerCase().includes(loc.toLowerCase()) ||
          inf.state?.toLowerCase().includes(loc.toLowerCase())
        );

      // Gender filter
      const matchesGender = filters.genders.length === 0 || 
        filters.genders.some(gender => 
          inf.gender.toLowerCase() === gender.toLowerCase()
        );

      return matchesSearch && matchesGenre && matchesFollowers && matchesLocation && matchesGender;
    })
    .sort((a, b) => {
      // Sort alphabetically by first name, then by last name
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this influencer?')) return;

    try {
      await fetch(`${API_URL}/api/influencers/${id}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Failed to delete influencer:', error);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedInfluencers(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedInfluencers.length === filteredInfluencers.length) {
      setSelectedInfluencers([]);
    } else {
      setSelectedInfluencers(filteredInfluencers.map(inf => inf.id));
    }
  };

  // Get unique genres from all influencers
  const uniqueGenres = Array.from(new Set(
    influencers.flatMap(inf => [
      inf.primaryGenre,
      ...(inf.secondaryGenre ? [inf.secondaryGenre] : [])
    ].filter(Boolean))
  )).sort();

  // Get unique locations from all influencers
  const uniqueLocations = Array.from(new Set(
    influencers.map(inf => inf.city).filter(Boolean)
  )).sort();

  // Get unique genders
  const uniqueGenders = Array.from(new Set(
    influencers.map(inf => inf.gender).filter(Boolean)
  )).sort();

  // Check if any filters are active
  const hasActiveFilters = 
    filters.genres.length > 0 || 
    filters.followersRange !== 'all' || 
    filters.locations.length > 0 || 
    filters.genders.length > 0;

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      genres: [],
      followersRange: 'all',
      locations: [],
      genders: []
    });
  };

  // Toggle filter selection
  const toggleGenreFilter = (genre: string) => {
    setFilters(prev => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter(g => g !== genre)
        : [...prev.genres, genre]
    }));
  };

  const toggleLocationFilter = (location: string) => {
    setFilters(prev => ({
      ...prev,
      locations: prev.locations.includes(location)
        ? prev.locations.filter(l => l !== location)
        : [...prev.locations, location]
    }));
  };

  const toggleGenderFilter = (gender: string) => {
    setFilters(prev => ({
      ...prev,
      genders: prev.genders.includes(gender)
        ? prev.genders.filter(g => g !== gender)
        : [...prev.genders, gender]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading influencers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-black">
      {/* Top Bar */}
      <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800 px-4 md:px-10 py-4 md:py-7 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">Influencers</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1 md:mt-2 text-sm md:text-base">{filteredInfluencers.length} influencers found</p>
          </div>
          <button
            onClick={() => {setEditingInfluencer(null); setShowModal(true);}}
            className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-lg font-semibold shadow-md text-sm md:text-base transition-colors whitespace-nowrap"
          >
            + Add Influencer
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800 px-4 md:px-10 py-4 md:py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total</p>
                <p className="text-2xl font-bold text-gray-900">{influencers.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">T</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Nano</p>
                <p className="text-2xl font-bold text-gray-900">
                  {influencers.filter(inf => convertFollowersToNumber(inf.followers, inf.followersUnit) < 10000).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">N</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Micro</p>
                <p className="text-2xl font-bold text-gray-900">
                  {influencers.filter(inf => {
                    const count = convertFollowersToNumber(inf.followers, inf.followersUnit);
                    return count >= 10000 && count < 100000;
                  }).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">M</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Macro</p>
                <p className="text-2xl font-bold text-gray-900">
                  {influencers.filter(inf => convertFollowersToNumber(inf.followers, inf.followersUnit) >= 100000).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">M</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="px-4 md:px-10 py-4 md:py-6 bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
          <div className="flex-1 relative">
            <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, genre, or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 md:py-3 text-sm md:text-base border border-gray-300 dark:border-zinc-800 dark:bg-black dark:text-white dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          
          {/* Filter Button */}
          <button
            onClick={() => setShowFilterModal(true)}
            className={`px-4 md:px-6 py-2.5 md:py-3 rounded-lg font-semibold whitespace-nowrap text-sm md:text-base transition-colors shadow-sm flex items-center justify-center gap-2 ${
              hasActiveFilters 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                : 'bg-white dark:bg-zinc-900 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="bg-white text-indigo-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {filters.genres.length + (filters.followersRange !== 'all' ? 1 : 0) + filters.locations.length + filters.genders.length}
              </span>
            )}
          </button>
          
          <label className="flex items-center gap-2 md:gap-3 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={selectedInfluencers.length === filteredInfluencers.length && filteredInfluencers.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span className="font-medium text-sm md:text-base text-gray-700 dark:text-gray-300">Select All</span>
          </label>
          {selectedInfluencers.length > 0 && (
            <button
              onClick={() => setShowCampaignModal(true)}
              className="px-4 md:px-6 py-2.5 md:py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold whitespace-nowrap text-sm md:text-base transition-colors shadow-sm"
            >
              Add {selectedInfluencers.length} to Campaign
            </button>
          )}
        </div>
      </div>

      {/* Table View */}
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-black">
        <div className="m-3 md:m-6 bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
                <tr>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-8 md:w-12"></th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Name</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Genre</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Gender</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Location</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Followers</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-32 md:w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredInfluencers.map((influencer) => (
                  <tr
                    key={influencer.id}
                    className="hover:bg-indigo-50 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
                    onClick={() => {
                      setViewingInfluencer(influencer);
                      setShowDetailsModal(true);
                    }}
                  >
                    <td className="px-3 md:px-6 py-3 md:py-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInfluencers.includes(influencer.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelect(influencer.id);
                        }}
                        className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4">
                      <div className="font-semibold text-gray-900 dark:text-white text-sm md:text-base">{influencer.firstName} {influencer.lastName}</div>
                    </td>
                  <td className="px-3 md:px-6 py-3 md:py-4">
                    <span className="inline-flex items-center px-2 md:px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      {influencer.primaryGenre}
                    </span>
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 text-gray-700 dark:text-gray-300 text-xs md:text-sm">{influencer.gender}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 text-gray-700 dark:text-gray-300 text-xs md:text-sm">{influencer.city}, {influencer.state || 'N/A'}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4">
                    <span className="font-semibold text-indigo-600 text-sm md:text-base">{influencer.followers.toLocaleString()}</span>
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4">
                    <div className="flex items-center justify-center gap-2 md:gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingInfluencer(influencer);
                          setShowModal(true);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 text-xs md:text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(influencer.id);
                        }}
                        className="text-red-600 hover:text-red-800 text-xs md:text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showModal && (
        <InfluencerModal
          influencer={editingInfluencer}
          onClose={() => {
            setShowModal(false);
            setEditingInfluencer(null);
          }}
          onDuplicateError={(message) => {
            setDuplicateErrorMessage(message);
            setShowDuplicateError(true);
          }}
        />
      )}

      {showCampaignModal && (
        <CampaignSelectionModal
          selectedInfluencers={selectedInfluencers}
          onClose={() => {
            setShowCampaignModal(false);
            setSelectedInfluencers([]);
          }}
        />
      )}

      {showDetailsModal && viewingInfluencer && (
        <InfluencerDetailsModal
          influencer={viewingInfluencer}
          onClose={() => {
            setShowDetailsModal(false);
            setViewingInfluencer(null);
          }}
          onEdit={(inf) => {
            setShowDetailsModal(false);
            setEditingInfluencer(inf);
            setShowModal(true);
          }}
          onDelete={handleDelete}
        />
      )}

      {/* Duplicate Error Modal */}
      {showDuplicateError && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-black rounded-lg shadow-2xl max-w-md w-full animate-bounce-in">
            {/* Header */}
            <div className="bg-red-600 px-6 py-4 rounded-t-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">Duplicate Instagram Link</h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="mb-4">
                <p className="text-gray-700 dark:text-gray-300 text-base leading-relaxed">
                  {duplicateErrorMessage}
                </p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Note:</strong> Each influencer must have a unique Instagram link. Please use a different Instagram link or update the existing influencer instead.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 dark:bg-black px-6 py-4 rounded-b-lg flex justify-end">
              <button
                onClick={() => setShowDuplicateError(false)}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-sm"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-black rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <h2 className="text-xl font-bold text-white">Filter Influencers</h2>
                {hasActiveFilters && (
                  <span className="bg-white text-indigo-600 rounded-full px-3 py-1 text-sm font-bold">
                    {filters.genres.length + (filters.followersRange !== 'all' ? 1 : 0) + filters.locations.length + filters.genders.length} Active
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowFilterModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-8">
              <div className="grid grid-cols-2 gap-8">
                {/* Genre Filter */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Genre
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {uniqueGenres.map(genre => (
                      <label key={genre} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.genres.includes(genre)}
                          onChange={() => toggleGenreFilter(genre)}
                          className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <span className="text-gray-700 dark:text-gray-300">{genre}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Followers Range Filter */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Followers Range
                  </h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="followersRange"
                        checked={filters.followersRange === 'all'}
                        onChange={() => setFilters(prev => ({ ...prev, followersRange: 'all' }))}
                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">All</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="followersRange"
                        checked={filters.followersRange === 'nano'}
                        onChange={() => setFilters(prev => ({ ...prev, followersRange: 'nano' }))}
                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Nano (&lt; 10K)</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="followersRange"
                        checked={filters.followersRange === 'micro'}
                        onChange={() => setFilters(prev => ({ ...prev, followersRange: 'micro' }))}
                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Micro (10K - 100K)</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="followersRange"
                        checked={filters.followersRange === 'macro'}
                        onChange={() => setFilters(prev => ({ ...prev, followersRange: 'macro' }))}
                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Macro (100K - 1M)</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="followersRange"
                        checked={filters.followersRange === 'mega'}
                        onChange={() => setFilters(prev => ({ ...prev, followersRange: 'mega' }))}
                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Mega (1M+)</span>
                    </label>
                  </div>
                </div>

                {/* Location Filter */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Location
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {uniqueLocations.map(location => (
                      <label key={location} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.locations.includes(location)}
                          onChange={() => toggleLocationFilter(location)}
                          className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <span className="text-gray-700 dark:text-gray-300">{location}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Gender Filter */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Gender
                  </h3>
                  <div className="space-y-2">
                    {uniqueGenders.map(gender => (
                      <label key={gender} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.genders.includes(gender)}
                          onChange={() => toggleGenderFilter(gender)}
                          className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <span className="text-gray-700 dark:text-gray-300">{gender}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 dark:border-zinc-800 px-8 py-4 bg-gray-50 dark:bg-black flex items-center justify-between">
              <button
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="px-6 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors border border-red-200 dark:border-red-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Clear All Filters
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="px-6 py-3 bg-white dark:bg-zinc-900 text-gray-700 dark:text-gray-300 rounded-lg font-semibold hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors border border-gray-300 dark:border-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Modal Component
function InfluencerModal({
  influencer,
  onClose,
  onDuplicateError,
}: {
  influencer: Influencer | null;
  onClose: () => void;
  onDuplicateError: (message: string) => void;
}) {
  const [formData, setFormData] = useState({
    firstName: influencer?.firstName || '',
    lastName: influencer?.lastName || '',
    igLink: influencer?.igLink || '',
    followers: influencer?.followers
      ? (influencer.followersUnit === 'K' ? influencer.followers / 1000 : influencer.followers / 1000000)
      : 0,
    followersUnit: influencer?.followersUnit || 'K',
    avgViews: influencer?.avgViews
      ? (influencer.avgViewsUnit === 'K' ? influencer.avgViews / 1000 : influencer.avgViews / 1000000)
      : null,
    avgViewsUnit: influencer?.avgViewsUnit || 'K',
    primaryGenre: influencer?.primaryGenre || '',
    secondaryGenre: influencer?.secondaryGenre || '',
    city: influencer?.city || '',
    state: influencer?.state || '',
    contact: influencer?.contact || {
      contactType: 'Number' as 'Number' | 'Email',
      contactSubType: '',
      contactValue: ''
    },
    commercials: influencer?.commercials?.map((c: any) => {
      const displayCount = c.countUnit
        ? (c.countUnit === 'Thousand' ? c.count / 1000 : c.countUnit === 'Lacs (L)' ? c.count / 100000 : c.count)
        : c.count;

      return {
        ...c,
        count: displayCount,
        countUnit: c.countUnit || 'Thousand'
      };
    }) || [],
    gender: influencer?.gender || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();


    const commercialsConverted = formData.commercials.map(c => ({
      ...c,
      count: c.countUnit === 'Thousand' ? c.count * 1000 : c.countUnit === 'Lacs (L)' ? c.count * 100000 : c.count
    }));

    const payload = {
      ...formData,
      commercials: commercialsConverted
    };

    try {
      let response;
      if (influencer) {
        response = await fetch(`${API_URL}/api/influencers/${influencer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch(`${API_URL}/api/influencers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === 'Duplicate Instagram Link') {
          // Show custom modal for duplicate Instagram link
          onDuplicateError(errorData.message);
          return;
        }
        throw new Error(errorData.message || 'Failed to save influencer');
      }

      onClose();
    } catch (error) {
      console.error('Failed to save influencer:', error);
      alert('Failed to save influencer. Please try again.');
    }
  };

  const handleAddCommercial = (platform: 'Instagram' | 'Youtube') => {
    setFormData({
      ...formData,
      commercials: [
        ...formData.commercials,
        { platform, type: '', count: 0, countUnit: 'Thousand', monthAdRights: 0 }
      ]
    });
  };

  const handleRemoveCommercial = (index: number) => {
    setFormData({
      ...formData,
      commercials: formData.commercials.filter((_, i) => i !== index)
    });
  };

  const handleUpdateCommercial = (index: number, field: string, value: any) => {
    const updated = [...formData.commercials];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, commercials: updated });
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 md:p-4 z-50">
      <div onClick={(e) => e.stopPropagation()} className="bg-black border border-zinc-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-blue-600 text-white px-4 md:px-8 py-4 md:py-6">
          <h2 className="text-xl md:text-2xl font-bold">
            {influencer ? 'Edit Influencer' : 'Add New Influencer'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-5 md:space-y-8">
          {/* Name Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">First Name *</label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Last Name *</label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-4 md:mt-5">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Gender *</label>
                <select
                  required
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Couple">Couple</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="mt-4 md:mt-5">
              <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Instagram Link *</label>
              <input
                type="url"
                required
                value={formData.igLink}
                onChange={(e) => setFormData({ ...formData, igLink: e.target.value })}
                className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Followers Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Audience Stats</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Followers *</label>
                <div className="flex gap-2 md:gap-3">
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.followers}
                    onChange={(e) => setFormData({ ...formData, followers: parseInt(e.target.value) })}
                    className="flex-1 px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    required
                    value={formData.followersUnit}
                    onChange={(e) => setFormData({ ...formData, followersUnit: e.target.value as 'K' | 'M' })}
                    className="px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="K">K</option>
                    <option value="M">M</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Avg Views</label>
                <div className="flex gap-2 md:gap-3">
                  <input
                    type="number"
                    min="1"
                    value={formData.avgViews || ''}
                    onChange={(e) => setFormData({ ...formData, avgViews: e.target.value ? parseInt(e.target.value) : null })}
                    className="flex-1 px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={formData.avgViewsUnit}
                    onChange={(e) => setFormData({ ...formData, avgViewsUnit: e.target.value as 'K' | 'M' })}
                    className="px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="K">K</option>
                    <option value="M">M</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Genre Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Content Genre</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Primary Genre *</label>
                <input
                  type="text"
                  required
                  value={formData.primaryGenre}
                  onChange={(e) => setFormData({ ...formData, primaryGenre: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Secondary Genre</label>
                <input
                  type="text"
                  value={formData.secondaryGenre}
                  onChange={(e) => setFormData({ ...formData, secondaryGenre: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Location Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Location</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">City *</label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Contact Details</h3>
            <div className="space-y-4 md:space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Contact Type *</label>
                  <select
                    required
                    value={formData.contact.contactType}
                    onChange={(e) => setFormData({
                      ...formData,
                      contact: { ...formData.contact, contactType: e.target.value as 'Number' | 'Email' }
                    })}
                    className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Number">Phone Number</option>
                    <option value="Email">Email</option>
                  </select>
                </div>
                {formData.contact.contactType === 'Number' && (
                  <div>
                    <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Phone Type</label>
                    <select
                      value={formData.contact.contactSubType || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        contact: { ...formData.contact, contactSubType: e.target.value }
                      })}
                      className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Type</option>
                      <option value="Personal Number">Personal</option>
                      <option value="Manager">Manager</option>
                      <option value="Agency">Agency</option>
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-base font-medium text-gray-400 mb-2">
                  {formData.contact.contactType === 'Number' ? 'Phone Number *' : 'Email Address *'}
                </label>
                <input
                  type={formData.contact.contactType === 'Number' ? 'tel' : 'email'}
                  required
                  value={formData.contact.contactValue}
                  onChange={(e) => setFormData({
                    ...formData,
                    contact: { ...formData.contact, contactValue: e.target.value }
                  })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Commercials Section */}
          <div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">
              <h3 className="text-base md:text-lg font-semibold text-white">Commercial Rates</h3>
              <div className="flex gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={() => handleAddCommercial('Instagram')}
                  className="px-3 md:px-4 py-2 text-xs md:text-sm bg-pink-600 text-white rounded hover:bg-pink-700 flex-1 sm:flex-none"
                >
                  + Instagram
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCommercial('Youtube')}
                  className="px-3 md:px-4 py-2 text-xs md:text-sm bg-red-600 text-white rounded hover:bg-red-700 flex-1 sm:flex-none"
                >
                  + YouTube
                </button>
              </div>
            </div>

            {formData.commercials.length > 0 ? (
              <div className="space-y-3 md:space-y-4">
                {formData.commercials.map((commercial, index) => (
                  <div key={index} className="border border-zinc-800 rounded p-3 md:p-4 bg-zinc-900">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Platform</label>
                        <input
                          type="text"
                          disabled
                          value={commercial.platform}
                          className="w-full px-2 md:px-3 py-2 text-sm md:text-base bg-zinc-800 border border-zinc-800 text-gray-500 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-2">Type *</label>
                        <select
                          required
                          value={commercial.type}
                          onChange={(e) => handleUpdateCommercial(index, 'type', e.target.value)}
                          className="w-full px-2 md:px-3 py-2 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select</option>
                          {commercial.platform === 'Instagram' ? (
                            <>
                              <option value="Collab">Collab</option>
                              <option value="Non-Collab">Non-Collab</option>
                              <option value="Song Promotion">Song</option>
                              <option value="Brand Promotion">Brand</option>
                              <option value="Static Post">Static</option>
                              <option value="Story">Story</option>
                              <option value="Repost">Repost</option>
                            </>
                          ) : (
                            <>
                              <option value="Youtube Shorts">Shorts</option>
                              <option value="Youtube Video">Video</option>
                              <option value="Youtube Dedicated">Dedicated</option>
                              <option value="Youtube Integrated">Integrated</option>
                            </>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-2">Amount *</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={commercial.count}
                          onChange={(e) => handleUpdateCommercial(index, 'count', parseInt(e.target.value) || 0)}
                          className="w-full px-2 md:px-3 py-2 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-2">Unit *</label>
                        <select
                          required
                          value={commercial.countUnit}
                          onChange={(e) => handleUpdateCommercial(index, 'countUnit', e.target.value)}
                          className="w-full px-2 md:px-3 py-2 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="Thousand">K</option>
                          <option value="Lacs (L)">L</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-2">Ad Rights</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0"
                            required
                            value={commercial.monthAdRights}
                            onChange={(e) => handleUpdateCommercial(index, 'monthAdRights', parseInt(e.target.value) || 0)}
                            className="flex-1 px-2 md:px-3 py-2 text-sm md:text-base bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveCommercial(index)}
                            className="px-2 md:px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs md:text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm md:text-base text-gray-400 text-center py-4 md:py-6">No commercials added</p>
            )}
          </div>

          <div className="flex flex-col md:flex-row gap-3 md:gap-4 pt-4 md:pt-6 border-t border-zinc-800">
            <button
              type="submit"
              className="flex-1 px-4 md:px-6 py-2.5 md:py-3.5 text-sm md:text-base bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
            >
              {influencer ? 'Update' : 'Add'} Influencer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 md:px-6 py-2.5 md:py-3.5 text-sm md:text-base bg-zinc-900 text-white rounded font-medium hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Campaign Selection Modal
function CampaignSelectionModal({
  selectedInfluencers,
  onClose,
}: {
  selectedInfluencers: string[];
  onClose: () => void;
}) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState('');

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/campaigns`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setCampaigns(Array.isArray(data) ? data : []);
      setError(null);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
      setCampaigns([]);
      setError('Failed to load campaigns. Please try again.');
      setLoading(false);
    }
  };

  const handleAddToCampaign = async () => {
    if (!selectedCampaign) {
      alert('Please select a campaign');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/campaigns/batch-add-influencers`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId: selectedCampaign,
          influencerIds: selectedInfluencers,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      alert('Influencers added successfully!');
      onClose();
    } catch (error) {
      console.error('Failed to add influencers:', error);
      alert('Failed to add influencers');
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div onClick={(e) => e.stopPropagation()} className="bg-black border border-zinc-800 rounded-lg shadow-xl max-w-lg w-full">
        <div className="bg-purple-600 text-white px-8 py-6">
          <h2 className="text-2xl font-bold">Add to Campaign</h2>
          <p className="text-base text-purple-100 mt-2">{selectedInfluencers.length} influencers selected</p>
        </div>

        <div className="p-8">
          {loading ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 border-4 border-zinc-700 border-t-purple-600 rounded-full animate-spin mx-auto"></div>
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="text-red-400 mb-4">{error}</div>
              <button
                onClick={fetchCampaigns}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Retry
              </button>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400">No campaigns available. Create a campaign first.</p>
            </div>
          ) : (
            <div>
              <label className="block text-base font-medium text-gray-300 mb-3">Select Campaign</label>
              <select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                className="w-full px-4 py-3 text-base bg-zinc-900 border border-zinc-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Choose...</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} - {campaign.brandName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 px-8 py-6 flex gap-4">
          <button
            onClick={handleAddToCampaign}
            disabled={!selectedCampaign}
            className="flex-1 px-6 py-3 text-base bg-purple-600 text-white rounded font-medium hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Add
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 text-base bg-zinc-800 text-gray-300 rounded font-medium hover:bg-zinc-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Influencer Details Modal
function InfluencerDetailsModal({
  influencer,
  onClose,
  onEdit,
  onDelete,
}: {
  influencer: Influencer;
  onClose: () => void;
  onEdit: (influencer: Influencer) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 md:p-4 z-50">
      <div onClick={(e) => e.stopPropagation()} className="bg-black border border-zinc-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white px-4 md:px-8 py-4 md:py-6 flex items-center justify-between">
          <div className="flex-1 min-w-0 pr-2">
            <h2 className="text-xl md:text-3xl font-bold truncate">{influencer.firstName} {influencer.lastName}</h2>
            <p className="text-blue-100 text-sm md:text-base mt-1 md:mt-2">{influencer.primaryGenre} • {influencer.gender}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl md:text-3xl leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
            {/* Stats Box */}
            <div className="md:col-span-1 grid grid-cols-2 md:grid-cols-1 gap-4 md:space-y-5 md:gap-0">
              <div className="bg-zinc-900 border border-zinc-800 rounded p-4 md:p-5">
                <div className="text-xs md:text-sm text-gray-400 mb-1 md:mb-2">FOLLOWERS</div>
                <div className="text-xl md:text-3xl font-bold text-blue-500">{influencer.followers.toLocaleString()}</div>
              </div>
              {influencer.avgViews && (
                <div className="bg-zinc-900 border border-zinc-800 rounded p-4 md:p-5">
                  <div className="text-xs md:text-sm text-gray-400 mb-1 md:mb-2">AVG VIEWS</div>
                  <div className="text-xl md:text-3xl font-bold text-green-500">{influencer.avgViews.toLocaleString()}</div>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="md:col-span-2 space-y-5 md:space-y-8">
              {/* Basic Info */}
              <div>
                <h3 className="text-sm md:text-base font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5 text-sm md:text-base">
                  <div className="break-words">
                    <span className="text-gray-400">Instagram:</span>
                    <a href={influencer.igLink} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline break-all">
                      View Profile →
                    </a>
                  </div>
                  <div className="break-words">
                    <span className="text-gray-400">Genre:</span>
                    <span className="ml-2 font-medium text-white">{influencer.primaryGenre}</span>
                    {influencer.secondaryGenre && <span className="text-gray-500"> / {influencer.secondaryGenre}</span>}
                  </div>
                  <div className="break-words">
                    <span className="text-gray-400">Location:</span>
                    <span className="ml-2 font-medium text-white">{influencer.city}, {influencer.state || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div>
                <h3 className="text-sm md:text-base font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Contact</h3>
                <div className="text-sm md:text-base break-words">
                  <span className="text-gray-400">{influencer.contact.contactType}:</span>
                  <span className="ml-2 font-medium text-white break-all">{influencer.contact.contactValue}</span>
                  {influencer.contact.contactSubType && (
                    <span className="ml-2 text-gray-500">({influencer.contact.contactSubType})</span>
                  )}
                </div>
              </div>

              {/* Commercials */}
              {influencer.commercials.length > 0 && (
                <div>
                  <h3 className="text-sm md:text-base font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Commercial Rates</h3>
                  <div className="space-y-2 md:space-y-3">
                    {influencer.commercials.map((commercial, index) => (
                      <div key={index} className="flex items-center justify-between bg-zinc-900 px-3 md:px-4 py-2 md:py-3 rounded text-sm md:text-base gap-2">
                        <span className="font-medium text-white truncate">{commercial.platform} - {commercial.type}</span>
                        <span className="text-blue-500 font-semibold whitespace-nowrap">₹{commercial.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-4 md:px-8 py-4 md:py-6 flex flex-col md:flex-row gap-3 md:gap-4">
          <button
            onClick={() => onEdit(influencer)}
            className="px-6 md:px-8 py-2.5 md:py-3 text-sm md:text-base bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
          >
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this influencer?')) {
                onDelete(influencer.id);
                onClose();
              }
            }}
            className="px-6 md:px-8 py-2.5 md:py-3 text-sm md:text-base bg-red-600 text-white rounded font-medium hover:bg-red-700"
          >
            Delete
          </button>
          <button
            onClick={onClose}
            className="md:ml-auto px-6 md:px-8 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 text-white rounded font-medium hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
