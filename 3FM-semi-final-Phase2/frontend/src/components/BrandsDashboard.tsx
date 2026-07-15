import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';

interface Influencer {
  id: string;
  firstName: string;
  lastName: string;
  igLink: string;
  avgViews?: number;
  avgViewsUnit?: string;
  followers: number;
  followersUnit: string;
  primaryGenre: string;
  secondaryGenre?: string;
  city: string;
  state?: string;
  gender: string;
}

interface CampaignInfluencer {
  id: string;
  influencerId: string;
  brandApprovalStatus?: string | null;
  brandComment?: string | null;
  influencer: Influencer;
}

interface Campaign {
  id: string;
  name: string;
  externalCost?: number;
  influencers: CampaignInfluencer[];
}

interface Brand {
  id: string;
  name: string;
  contactPerson?: string;
  createdAt: string;
  updatedAt: string;
  campaigns?: Campaign[];
}

export default function BrandsDashboard() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingBrand, setViewingBrand] = useState<Brand | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [userRole, setUserRole] = useState<string>('AGENCY');
  const [sortBrands, setSortBrands] = useState<'asc' | 'desc'>('asc');
  const viewingBrandRef = useRef<Brand | null>(null);
  const showDetailsModalRef = useRef<boolean>(false);

  // Keep refs in sync with state
  useEffect(() => {
    viewingBrandRef.current = viewingBrand;
  }, [viewingBrand]);

  useEffect(() => {
    showDetailsModalRef.current = showDetailsModal;
  }, [showDetailsModal]);

  useEffect(() => {
    // Get user role from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role || 'AGENCY');
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
  }, []);

  const fetchBrands = async () => {
    try {
      const timestamp = new Date().getTime();
      console.log('📥 Fetching brands with cache-busting timestamp:', timestamp);
      console.log('📍 Fetching from URL:', `${API_URL}/api/brands?_=${timestamp}`);
      const response = await fetch(`${API_URL}/api/brands?_=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      console.log('📡 Response status:', response.status);
      const data = await response.json();
      console.log('✅ Brands fetched:', data.length, 'brands');
      console.log('📊 Brand details:');
      data.forEach((brand: Brand) => {
        console.log(`  - ${brand.name}: ${brand.campaigns?.length || 0} campaigns`);
      });
      setBrands(data);
      setLoading(false);
    } catch (error) {
      console.error('❌ Failed to fetch brands:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrands();

    const newSocket = io(API_URL, { forceNew: true });

    const refreshViewingBrand = async () => {
      if (viewingBrandRef.current && showDetailsModalRef.current) {
        try {
          const response = await fetch(`${API_URL}/api/brands/${viewingBrandRef.current.id}`, { cache: 'no-store' });
          const refreshedBrand = await response.json();
          setViewingBrand(refreshedBrand);
        } catch {}
      }
    };

    newSocket.on('brand:created', (brand: Brand) => {
      setBrands((prev) => [...prev, brand]);
    });

    newSocket.on('brand:updated', (updatedBrand: Brand) => {
      setBrands((prev) =>
        prev.map((b) => (b.id === updatedBrand.id ? updatedBrand : b))
      );
    });

    newSocket.on('brand:deleted', (id: string) => {
      setBrands((prev) => prev.filter((b) => b.id !== id));
    });

    newSocket.on('campaign:deleted', async () => {
      await fetchBrands();
      await refreshViewingBrand();
    });

    newSocket.on('campaign:updated', async () => {
      await refreshViewingBrand();
    });

    newSocket.on('campaign:added-to-brand', async () => {
      await fetchBrands();
      await refreshViewingBrand();
    });

    newSocket.on('campaign:removed-from-brand', async () => {
      await fetchBrands();
      await refreshViewingBrand();
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const filteredBrands = brands
    .filter((brand) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        brand.name.toLowerCase().includes(searchLower) ||
        brand.contactPerson?.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => sortBrands === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

  const handleCardClick = async (brand: Brand) => {
    try {
      // Fetch detailed brand data with campaigns (with cache busting)
      const timestamp = new Date().getTime();
      const response = await fetch(`${API_URL}/api/brands/${brand.id}?_=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      const detailedBrand = await response.json();
      console.log('Brand details fetched:', detailedBrand);
      console.log('Campaigns count:', detailedBrand.campaigns?.length || 0);
      console.log('Campaigns:', detailedBrand.campaigns);
      setViewingBrand(detailedBrand);
      setShowDetailsModal(true);
    } catch (error) {
      console.error('Failed to fetch brand details:', error);
    }
  };

  const handleCloseDetails = () => {
    setShowDetailsModal(false);
    // Clear the viewing brand to avoid stale data
    setTimeout(() => setViewingBrand(null), 300);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-black">
        <div className="text-gray-900 dark:text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-white p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Brands</h1>
        <p className="text-gray-400">Manage your brand partnerships</p>
      </div>

      <div className="bg-gray-100 dark:bg-zinc-900 rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-center justify-between shadow-lg">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search brands by name or contact..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 bg-white dark:bg-black border border-gray-300 dark:border-zinc-800 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {userRole === 'BRAND' && (
          <div className="px-4 py-2 bg-blue-900 border border-blue-500 rounded-lg text-blue-200 text-sm">
            <span>📖 View Only Mode</span>
          </div>
        )}
        <button
          onClick={() => setSortBrands(prev => prev === 'asc' ? 'desc' : 'asc')}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors flex-shrink-0"
        >
          Name {sortBrands === 'asc' ? 'A → Z ↑' : 'Z → A ↓'}
        </button>
      </div>

      {/* Brands Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredBrands.map((brand) => (
          <div
            key={brand.id}
            onClick={() => handleCardClick(brand)}
            className="bg-gray-100 dark:bg-zinc-900 rounded-lg shadow-lg p-6 cursor-pointer hover:bg-gray-200 dark:hover:bg-zinc-800 hover:shadow-xl transition-all transform hover:-translate-y-1"
          >
            <div className="flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-full mb-4 mx-auto">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-3xl font-bold text-gray-900 dark:text-white text-center">{brand.name}</h3>
            <div className="mt-6 flex justify-center">
              <span className="text-xs text-indigo-400 font-medium">Click to view details</span>
            </div>
          </div>
        ))}
      </div>

      {filteredBrands.length === 0 && (
        <div className="text-center py-12 text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-zinc-900 rounded-lg">
          No brands found. Brands are automatically created when you add campaigns.
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && viewingBrand && (
        <BrandDetailsModal
          brand={viewingBrand}
          onClose={handleCloseDetails}
          userRole={userRole}
        />
      )}
    </div>
  );
}

// Details Modal Component
function BrandDetailsModal({
  brand,
  onClose,
  userRole,
}: {
  brand: Brand;
  onClose: () => void;
  userRole: string;
}) {
  const campaigns = brand.campaigns || [];

  // Local feedback state keyed by `${campaignId}-${influencerId}`
  const [feedbackState, setFeedbackState] = useState<Record<string, { status: string; comment: string }>>(() => {
    const init: Record<string, { status: string; comment: string }> = {};
    for (const c of campaigns) {
      for (const ci of c.influencers) {
        init[`${c.id}-${ci.influencer.id}`] = {
          status: ci.brandApprovalStatus || 'PENDING',
          comment: ci.brandComment || '',
        };
      }
    }
    return init;
  });
  const [savingFeedback, setSavingFeedback] = useState<string | null>(null);
  const [expandedComment, setExpandedComment] = useState<string | null>(null);

  const handleBrandFeedback = async (campaignId: string, influencerId: string) => {
    const key = `${campaignId}-${influencerId}`;
    const fb = feedbackState[key];
    if (!fb) return;
    setSavingFeedback(key);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/campaigns/${campaignId}/influencers/${influencerId}/brand-feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brandApprovalStatus: fb.status, brandComment: fb.comment || null }),
      });
    } catch (err) {
      console.error('Failed to save brand feedback:', err);
    } finally {
      setSavingFeedback(null);
    }
  };

  // Helper function to convert views/followers with units to actual numbers
  const convertToNumber = (value: number | undefined, unit: string | undefined) => {
    if (!value) return 0;
    const multiplier = unit === 'K' ? 1000 : unit === 'M' ? 1000000 : 1;
    return value * multiplier;
  };
  
  // Helper function to calculate engagement rate
  const calculateEngagementRate = (inf: Influencer) => {
    const views = convertToNumber(inf.avgViews, inf.avgViewsUnit);
    const followers = convertToNumber(inf.followers, inf.followersUnit);
    if (followers === 0) return 0;
    return (views / followers) * 100;
  };
  
  // Calculate aggregated metrics
  const allInfluencers = campaigns.flatMap(c => 
    c.influencers.map(ci => ci.influencer)
  );
  
  // Remove duplicates by ID
  const uniqueInfluencers = Array.from(
    new Map(allInfluencers.map(inf => [inf.id, inf])).values()
  );
  
  const totalInfluencers = uniqueInfluencers.length;
  const totalExternalBudget = campaigns.reduce((sum, c) => sum + (c.externalCost || 0), 0);

  const handleDownloadInfluencers = () => {
    // Create CSV content
    const headers = ['Name', 'Instagram Link', 'Avg Views', 'Engagement Rate'];
    const rows = uniqueInfluencers.map(inf => [
      `${inf.firstName} ${inf.lastName}`.trim(),
      inf.igLink || '',
      `${inf.avgViews || 0}${inf.avgViewsUnit || ''}`,
      calculateEngagementRate(inf).toFixed(2) + '%'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brand.name}_influencers.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header - Fixed */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 border-b border-gray-200 dark:border-zinc-800 rounded-t-lg">
          <h2 className="text-3xl font-bold text-white">{brand.name}</h2>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-6">
          <div className="space-y-6">
            {/* Contact Person */}
            {brand.contactPerson && (
              <div className="bg-gray-100 dark:bg-zinc-900 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Contact Person</h3>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{brand.contactPerson}</p>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-200 mb-1">Total Campaigns</h3>
                <p className="text-3xl font-bold text-white">{campaigns.length}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-200 mb-1">Total Influencers</h3>
                <p className="text-3xl font-bold text-white">{totalInfluencers}</p>
              </div>
            </div>

            {/* External Budget */}
            <div className="bg-gray-100 dark:bg-zinc-900 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Total External Budget</h3>
              <p className="text-2xl font-bold text-green-400">₹{totalExternalBudget.toLocaleString()}</p>
            </div>

            {/* Campaigns List with per-influencer brand feedback */}
            {campaigns.length > 0 && (
              <div className="bg-gray-100 dark:bg-zinc-900 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Campaigns</h3>
                <div className="space-y-4">
                  {campaigns.map(campaign => (
                    <div key={campaign.id} className="bg-gray-200 dark:bg-zinc-800 rounded-lg overflow-hidden">
                      {/* Campaign header */}
                      <div className="p-3 flex justify-between items-center border-b border-gray-300 dark:border-zinc-700">
                        <div>
                          <p className="text-gray-900 dark:text-white font-semibold">{campaign.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{campaign.influencers.length} influencer{campaign.influencers.length !== 1 ? 's' : ''}</p>
                        </div>
                        {campaign.externalCost && (
                          <p className="text-green-400 font-semibold">₹{campaign.externalCost.toLocaleString()}</p>
                        )}
                      </div>

                      {/* Influencer rows */}
                      {campaign.influencers.length > 0 && (
                        <div className="divide-y divide-gray-300 dark:divide-zinc-700">
                          {campaign.influencers.map(ci => {
                            const key = `${campaign.id}-${ci.influencer.id}`;
                            const fb = feedbackState[key] || { status: ci.brandApprovalStatus || 'PENDING', comment: ci.brandComment || '' };
                            const saving = savingFeedback === key;
                            return (
                              <div key={ci.id} className="p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                      {ci.influencer.firstName} {ci.influencer.lastName}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                                      {ci.influencer.igLink && (
                                        <a href={ci.influencer.igLink} target="_blank" rel="noopener noreferrer"
                                          className="text-xs text-indigo-400 hover:underline">
                                          Instagram
                                        </a>
                                      )}
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {ci.influencer.followers}{ci.influencer.followersUnit} followers
                                      </span>
                                      {ci.influencer.avgViews != null && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                          {ci.influencer.avgViews}{ci.influencer.avgViewsUnit || ''} avg views
                                        </span>
                                      )}
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {ci.influencer.primaryGenre}{ci.influencer.secondaryGenre ? ` / ${ci.influencer.secondaryGenre}` : ''}
                                      </span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {ci.influencer.city}{ci.influencer.state ? `, ${ci.influencer.state}` : ''}
                                      </span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                                        {ci.influencer.gender}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Status badge (always visible) */}
                                  {fb.status === 'APPROVED' && (
                                    <span className="flex-shrink-0 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-semibold flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                      Approved
                                    </span>
                                  )}
                                  {fb.status === 'REJECTED' && (
                                    <span className="flex-shrink-0 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-semibold flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                      Rejected
                                    </span>
                                  )}
                                  {fb.status === 'PENDING' && (
                                    <span className="flex-shrink-0 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full text-xs font-semibold">
                                      Pending
                                    </span>
                                  )}

                                  {/* Approve/Reject buttons for BRAND users */}
                                  {userRole === 'BRAND' && (
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() => {
                                          const newStatus = fb.status === 'APPROVED' ? 'PENDING' : 'APPROVED';
                                          setFeedbackState(prev => ({ ...prev, [key]: { ...fb, status: newStatus } }));
                                          setTimeout(() => {
                                            setSavingFeedback(key);
                                            const token = localStorage.getItem('token');
                                            fetch(`${API_URL}/api/campaigns/${campaign.id}/influencers/${ci.influencer.id}/brand-feedback`, {
                                              method: 'PATCH',
                                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                              body: JSON.stringify({ brandApprovalStatus: newStatus, brandComment: fb.comment || null }),
                                            }).finally(() => setSavingFeedback(null));
                                          }, 0);
                                        }}
                                        disabled={saving}
                                        className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
                                          fb.status === 'APPROVED'
                                            ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400'
                                            : 'bg-white dark:bg-zinc-700 border-gray-300 dark:border-zinc-600 text-gray-600 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-300 hover:text-green-700'
                                        }`}
                                        title="Approve"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                      </button>
                                      <button
                                        onClick={() => {
                                          const newStatus = fb.status === 'REJECTED' ? 'PENDING' : 'REJECTED';
                                          setFeedbackState(prev => ({ ...prev, [key]: { ...fb, status: newStatus } }));
                                          setTimeout(() => {
                                            setSavingFeedback(key);
                                            const token = localStorage.getItem('token');
                                            fetch(`${API_URL}/api/campaigns/${campaign.id}/influencers/${ci.influencer.id}/brand-feedback`, {
                                              method: 'PATCH',
                                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                              body: JSON.stringify({ brandApprovalStatus: newStatus, brandComment: fb.comment || null }),
                                            }).finally(() => setSavingFeedback(null));
                                          }, 0);
                                        }}
                                        disabled={saving}
                                        className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
                                          fb.status === 'REJECTED'
                                            ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400'
                                            : 'bg-white dark:bg-zinc-700 border-gray-300 dark:border-zinc-600 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 hover:text-red-700'
                                        }`}
                                        title="Reject"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                      <button
                                        onClick={() => setExpandedComment(expandedComment === key ? null : key)}
                                        className="p-1.5 rounded-lg border bg-white dark:bg-zinc-700 border-gray-300 dark:border-zinc-600 text-gray-600 dark:text-gray-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-colors"
                                        title="Add comment"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Comment row for BRAND */}
                                {userRole === 'BRAND' && expandedComment === key && (
                                  <div className="mt-2 flex gap-2">
                                    <input
                                      type="text"
                                      value={fb.comment}
                                      onChange={(e) => setFeedbackState(prev => ({ ...prev, [key]: { ...fb, comment: e.target.value } }))}
                                      placeholder="Add a comment (optional)..."
                                      className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                    <button
                                      onClick={() => handleBrandFeedback(campaign.id, ci.influencer.id)}
                                      disabled={saving}
                                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold disabled:opacity-50"
                                    >
                                      {saving ? '...' : 'Save'}
                                    </button>
                                  </div>
                                )}

                                {/* Show brand comment read-only for all users when set */}
                                {ci.brandComment && userRole !== 'BRAND' && (
                                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">"{ci.brandComment}"</p>
                                )}
                                {fb.comment && userRole === 'BRAND' && expandedComment !== key && (
                                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">"{fb.comment}"</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Influencers List */}
            {uniqueInfluencers.length > 0 && (
              <div className="bg-gray-100 dark:bg-zinc-900 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Influencers List</h3>
                  <button
                    onClick={handleDownloadInfluencers}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-semibold transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download CSV
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {uniqueInfluencers.map(influencer => (
                    <div key={influencer.id} className="bg-gray-200 dark:bg-zinc-800 rounded p-3">
                      <div>
                        <p className="text-gray-900 dark:text-white font-medium">{`${influencer.firstName} ${influencer.lastName}`.trim()}</p>
                        {influencer.igLink && (
                          <a
                            href={influencer.igLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-indigo-400 hover:underline"
                          >
                            Instagram Profile
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {campaigns.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No campaigns found for this brand
              </div>
            )}
          </div>
        </div>

        {/* Footer Buttons - Fixed */}
        <div className="border-t border-gray-200 dark:border-zinc-800 p-6 flex justify-center bg-gray-50 dark:bg-black">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-gray-100 dark:bg-zinc-900 hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-900 dark:text-white rounded-lg font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
