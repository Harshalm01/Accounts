import { useState, useEffect } from 'react';
import { API_URL } from '../config';

interface Pitch {
  id: string;
  campaignId: string;
  brandId: string;
  status: 'DRAFT' | 'SENT' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED';
  message: string | null;
  proposedBudget: number | null;
  expectedDeliverables: string | null;
  timeline: string | null;
  createdAt: string;
  campaign: {
    id: string;
    name: string;
    brandName: string;
    budget: number;
    externalCost: number | null;
    internalCost: number | null;
  };
  brand: {
    id: string;
    name: string;
    industry: string;
  };
  agency?: {
    name: string | null;
    email: string;
  };
}

interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'BRAND' | 'AGENCY';
}

export default function Enquiries() {
  const [isLoading, setIsLoading] = useState(true);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Get user from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
    
    fetchPitches();
  }, []);

  const fetchPitches = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/pitches`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPitches(data);
      } else {
        setError('Failed to fetch pitches');
      }
    } catch (err) {
      console.error('Error fetching pitches:', err);
      setError('Failed to fetch pitches');
    } finally {
      setIsLoading(false);
    }
  };

  const updatePitchStatus = async (pitchId: string, status: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/pitches/${pitchId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        // Refresh pitches
        fetchPitches();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update pitch status');
      }
    } catch (err) {
      console.error('Error updating pitch:', err);
      setError('Failed to update pitch');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'SENT':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'UNDER_REVIEW':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'ACCEPTED':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getHeaderText = () => {
    if (!user) return { title: 'Enquiries', subtitle: 'Manage all your enquiries' };
    
    switch (user.role) {
      case 'AGENCY':
        return {
          title: 'Pitches',
          subtitle: 'Manage pitches sent to brands'
        };
      case 'BRAND':
        return {
          title: 'Pitch Requests',
          subtitle: 'Review pitches received from agencies'
        };
      case 'ADMIN':
        return {
          title: 'All Pitches',
          subtitle: 'Overview of all pitches in the system'
        };
      default:
        return { title: 'Enquiries', subtitle: 'Manage all your enquiries' };
    }
  };

  const header = getHeaderText(); return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-black rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{header.title}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {header.subtitle}
            </p>
          </div>
          {(user?.role === 'AGENCY' || user?.role === 'ADMIN') && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105"
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Pitch
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Content Area */}
      <div className="bg-white dark:bg-black rounded-lg shadow-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : pitches.length === 0 ? (
          <div className="text-center py-12 p-6">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-full mb-4">
              <svg className="w-12 h-12 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {user?.role === 'BRAND' ? 'No Pitches Received Yet' : 'No Pitches Yet'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {user?.role === 'BRAND' 
                ? 'Agencies will send you campaign pitches here' 
                : (user?.role === 'AGENCY' || user?.role === 'ADMIN')
                ? 'Start by creating your first pitch to a brand'
                : 'No pitches in the system yet'}
            </p>
            {(user?.role === 'AGENCY' || user?.role === 'ADMIN') && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Create First Pitch
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Campaign
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    {user?.role === 'BRAND' ? 'Agency' : 'Brand'}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Budget
                  </th>
                  {user?.role === 'BRAND' && (
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      External Cost
                    </th>
                  )}
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  {user?.role === 'BRAND' && (
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {pitches.map((pitch) => (
                  <tr key={pitch.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {pitch.campaign.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {pitch.campaign.brandName}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        {user?.role === 'BRAND' ? (
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {pitch.agency?.name || 'N/A'}
                            </div>
                            <div className="text-gray-600 dark:text-gray-400">
                              {pitch.agency?.email}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {pitch.brand.name}
                            </div>
                            <div className="text-gray-600 dark:text-gray-400">
                              {pitch.brand.industry}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        ₹{pitch.proposedBudget?.toLocaleString() || pitch.campaign.budget.toLocaleString()}
                      </div>
                    </td>
                    {user?.role === 'BRAND' && (
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                          {pitch.campaign.externalCost ? `₹${pitch.campaign.externalCost.toLocaleString()}` : 'N/A'}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(pitch.status)}`}>
                        {pitch.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {new Date(pitch.createdAt).toLocaleDateString()}
                    </td>
                    {user?.role === 'BRAND' && pitch.status === 'SENT' && (
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => updatePitchStatus(pitch.id, 'UNDER_REVIEW')}
                          className="px-3 py-1 text-sm bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors"
                        >
                          Review
                        </button>
                        <button
                          onClick={() => updatePitchStatus(pitch.id, 'ACCEPTED')}
                          className="px-3 py-1 text-sm bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => updatePitchStatus(pitch.id, 'REJECTED')}
                          className="px-3 py-1 text-sm bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                        >
                          Reject
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Pitch Modal - Placeholder for now */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-black rounded-xl shadow-2xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Create New Pitch
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-center py-8">
              Pitch creation form will be implemented here.
              <br />
              Select a campaign and brand to pitch to.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
