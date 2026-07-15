import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import CampaignModal from './CampaignModal';
import CampaignDetailsModal from './CampaignDetailsModal';
import { API_URL } from '../config';

interface Campaign {
  id: string;
  name: string;
  contact?: string;
  brandName: string;
  campaignId?: string;
  budget?: number;
  internalCost: number;
  externalCost: number;
  status: string;
  startDate: string;
  endDate?: string;
  brief?: string;
  influencers: any[];
  createdAt: string;
  updatedAt: string;
  userId?: string;
}


export default function CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [authCredentials, setAuthCredentials] = useState({ campaignId: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Read current user role from localStorage
  const userRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return null; } })();
  const currentUserId = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; } })();

  // Get current user role for access notifications
  const fetchCampaigns = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/campaigns`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch campaigns');
      }
      
      const data = await response.json();
      setCampaigns(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();

    const socket = io(API_URL);

    socket.on('campaign:created', (campaign: Campaign) => {
      setCampaigns((prev) => [campaign, ...prev]);
    });

    socket.on('campaign:updated', (updatedCampaign: Campaign) => {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === updatedCampaign.id ? updatedCampaign : c))
      );
      setSelectedCampaign((prev) => prev?.id === updatedCampaign.id ? updatedCampaign : prev);
    });

    socket.on('campaign:deleted', (id: string) => {
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    });

    // When current employee is unassigned, remove that campaign from their view
    const userId = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; } })();
    if (userId) {
      socket.on(`assignment:removed:${userId}`, ({ campaignId }: { campaignId: string }) => {
        setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
      });
      // When employee accepts an assignment, refresh their campaign list to show the new campaign
      socket.on(`campaign:accessible:${userId}`, () => {
        fetchCampaigns();
      });
    }

    return () => {
      socket.close();
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign?')) return;

    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/campaigns/${id}`, { 
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error('Failed to delete campaign:', error);
    }
  };

  const handleCampaignClick = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    // ADMIN + EMPLOYEE bypass auth; AGENCY bypasses for own campaigns; others need auth
    if (userRole === 'ADMIN' || userRole === 'EMPLOYEE' || !campaign.campaignId || (userRole === 'AGENCY' && campaign.userId === currentUserId)) {
      setShowDetails(true);
    } else {
      // AGENCY heads must enter Campaign ID + Password for others' campaigns
      setAuthCredentials({ campaignId: '', password: '' });
      setAuthError('');
      setShowAuthModal(true);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;

    setAuthLoading(true);
    setAuthError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/campaigns/${selectedCampaign.id}/verify-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId: authCredentials.campaignId,
          password: authCredentials.password,
        }),
      });
      if (res.ok) {
        setShowAuthModal(false);
        setShowDetails(true);
      } else {
        const data = await res.json();
        setAuthError(data.error || 'Invalid Campaign ID or Password');
      }
    } catch {
      setAuthError('Verification failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800';
      case 'Completed':
        return 'bg-gray-100 text-gray-800';
      case 'Upcoming':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredCampaigns = campaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.brandName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading campaigns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-black min-h-screen">
      <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800 px-8 py-6 shadow-sm mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Campaigns</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Manage your influencer campaigns</p>
          </div>
          {(userRole === 'ADMIN' || userRole === 'AGENCY') && (
          <button
            onClick={() => {
              console.log('Create Campaign button clicked');
              setEditingCampaign(null);
              setShowModal(true);
              console.log('Modal should now be visible, showModal:', true);
            }}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg font-semibold transition-colors shadow-sm"
          >
            + Create Campaign
          </button>
          )}
        </div>
      </div>

      <div className="px-8">
        <div className="mb-6">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search campaigns by name or brand..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-zinc-800 dark:bg-black dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCampaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800 p-6 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500 transition-all cursor-pointer"
              onClick={() => handleCampaignClick(campaign)}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{campaign.name}</h3>
                <div className="flex items-center gap-2">
                  {userRole !== 'ADMIN' && userRole !== 'EMPLOYEE' && campaign.campaignId && (
                    <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(campaign.status)}`}>
                    {campaign.status}
                  </span>
                </div>
              </div>
              <p className="text-gray-600 dark:text-gray-300 font-medium mb-4">{campaign.brandName}</p>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Start: {new Date(campaign.startDate).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>End: {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : '-'}</span>
                </div>
                <div className="flex items-center pt-2 border-t border-gray-100">
                  <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-semibold text-indigo-600">{campaign.influencers?.length || 0} Influencers</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredCampaigns.length === 0 && (
          <div className="text-center py-20 bg-zinc-900 rounded-lg border border-zinc-800 shadow-sm">
            <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-gray-400 text-lg">No campaigns found. Create your first campaign!</p>
          </div>
        )}
      </div>

      <CampaignModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={fetchCampaigns}
        editingCampaign={editingCampaign}
      />

      <CampaignDetailsModal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        campaign={selectedCampaign}
        onEdit={() => {
          setEditingCampaign(selectedCampaign);
          setShowDetails(false);
          setShowModal(true);
        }}
        onDelete={() => {
          if (selectedCampaign) handleDelete(selectedCampaign.id);
          setShowDetails(false);
        }}
      />

      {/* Authentication Modal */}
      {showAuthModal && (
        <div 
          onClick={() => setShowAuthModal(false)} 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="bg-white dark:bg-black rounded-lg p-8 w-full max-w-md"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Campaign Authentication</h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Campaign Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                Accessing: <strong>{selectedCampaign?.name}</strong>
              </p>
            </div>

            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Please enter the Campaign ID and Password to view campaign details.
            </p>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Campaign ID
                </label>
                <input
                  type="text"
                  value={authCredentials.campaignId}
                  onChange={(e) => setAuthCredentials({ ...authCredentials, campaignId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter Campaign ID"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={authCredentials.password}
                  onChange={(e) => setAuthCredentials({ ...authCredentials, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter Password"
                  required
                />
              </div>

              {authError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
                  {authError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg font-semibold transition-colors"
                >
                  {authLoading ? 'Verifying...' : 'Authenticate'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
