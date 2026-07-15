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
}

interface CampaignInfluencer {
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
    const socketId = Math.random().toString(36).substring(7);
    console.log(`🔌 [${socketId}] BrandsDashboard mounting, creating socket connection...`);
    
    fetchBrands();

    const newSocket = io(API_URL);
    
    console.log(`🔌 [${socketId}] Socket connected to:`, API_URL);

    newSocket.on('connect', () => {
      console.log(`✅ [${socketId}] Socket.IO connected successfully`);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
    });

    newSocket.on('brand:created', (brand: Brand) => {
      console.log('Brand created event received:', brand);
      setBrands((prev) => [...prev, brand]);
    });

    newSocket.on('brand:updated', (updatedBrand: Brand) => {
      console.log('Brand updated event received:', updatedBrand);
      setBrands((prev) =>
        prev.map((b) => (b.id === updatedBrand.id ? updatedBrand : b))
      );
    });

    newSocket.on('brand:deleted', (id: string) => {
      console.log('Brand deleted event received:', id);
      setBrands((prev) => prev.filter((b) => b.id !== id));
    });

    newSocket.on('campaign:deleted', async (deletedCampaignId: string) => {
      console.log('🔴 Campaign deleted event received, campaign ID:', deletedCampaignId);
      console.log('🔄 Refreshing brands list after campaign deletion...');
      // Always refresh brands list when campaign is deleted
      await fetchBrands();
      console.log('✅ Brands list refresh completed');
      
      // If viewing a brand's details, also refresh the modal
      if (viewingBrandRef.current && showDetailsModalRef.current) {
        try {
          const timestamp = new Date().getTime();
          const response = await fetch(`${API_URL}/api/brands/${viewingBrandRef.current.id}?_=${timestamp}`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            }
          });
          const refreshedBrand = await response.json();
          console.log('Brand refreshed after campaign delete:', refreshedBrand);
          console.log('Campaigns after delete:', refreshedBrand.campaigns);
          setViewingBrand(refreshedBrand);
        } catch (error) {
          console.error('Failed to refresh brand details:', error);
        }
      }
    });

    // Only refresh brands when campaigns are explicitly added/removed from brand
    // NOT when campaigns are created or updated generally
    newSocket.on('campaign:added-to-brand', async (data) => {
      console.log(`🔔 [${socketId}] Campaign added to brand event received`, data);
      console.log(`🔄 [${socketId}] Refreshing brands list after campaign added to brand...`);
      // Refresh brands list when a campaign is added to brand
      await fetchBrands();
      console.log(`✅ [${socketId}] Brands list refresh completed`);
      
      // If viewing brand details, also refresh the modal
      if (viewingBrandRef.current && showDetailsModalRef.current) {
        try {
          const timestamp = new Date().getTime();
          const response = await fetch(`${API_URL}/api/brands/${viewingBrandRef.current.id}?_=${timestamp}`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            }
          });
          const refreshedBrand = await response.json();
          console.log('Brand refreshed after campaign added to brand:', refreshedBrand);
          setViewingBrand(refreshedBrand);
        } catch (error) {
          console.error('Failed to refresh brand details:', error);
        }
      }
    });

    newSocket.on('campaign:removed-from-brand', async (data) => {
      console.log(`🔔 [${socketId}] Campaign removed from brand event received`, data);
      console.log(`🔄 [${socketId}] Refreshing brands list after campaign removed from brand...`);
      // Refresh brands list when a campaign is removed from brand
      await fetchBrands();
      console.log(`✅ [${socketId}] Brands list refresh completed`);
      
      // If viewing brand details, also refresh the modal
      if (viewingBrandRef.current && showDetailsModalRef.current) {
        try {
          const timestamp = new Date().getTime();
          const response = await fetch(`${API_URL}/api/brands/${viewingBrandRef.current.id}?_=${timestamp}`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            }
          });
          const refreshedBrand = await response.json();
          console.log('Brand refreshed after campaign removed from brand:', refreshedBrand);
          setViewingBrand(refreshedBrand);
        } catch (error) {
          console.error('Failed to refresh brand details:', error);
        }
      }
    });

    return () => {
      console.log(`🔌 [${socketId}] BrandsDashboard unmounting, closing socket connection...`);
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
    .sort((a, b) => a.name.localeCompare(b.name));

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
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Brands</h1>
        <p className="text-gray-400">Manage your brand partnerships</p>
      </div>

      <div className="bg-zinc-900 rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-center justify-between shadow-lg">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search brands by name or contact..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 bg-black border border-zinc-800 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {userRole === 'BRAND' && (
          <div className="px-4 py-2 bg-blue-900 border border-blue-500 rounded-lg text-blue-200 text-sm">
            <span>📖 View Only Mode</span>
          </div>
        )}
      </div>

      {/* Brands Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredBrands.map((brand) => (
          <div
            key={brand.id}
            onClick={() => handleCardClick(brand)}
            className="bg-zinc-900 rounded-lg shadow-lg p-6 cursor-pointer hover:bg-zinc-800 hover:shadow-xl transition-all transform hover:-translate-y-1"
          >
            <div className="flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-full mb-4 mx-auto">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-3xl font-bold text-white text-center">{brand.name}</h3>
            <div className="mt-6 flex justify-center">
              <span className="text-xs text-indigo-400 font-medium">Click to view details</span>
            </div>
          </div>
        ))}
      </div>

      {filteredBrands.length === 0 && (
        <div className="text-center py-12 text-gray-400 bg-zinc-900 rounded-lg">
          No brands found. Brands are automatically created when you add campaigns.
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && viewingBrand && (
        <BrandDetailsModal
          brand={viewingBrand}
          onClose={handleCloseDetails}

        />
      )}
    </div>
  );
}

// Details Modal Component
function BrandDetailsModal({
  brand,
  onClose,
}: {
  brand: Brand;
  onClose: () => void;
}) {
  const campaigns = brand.campaigns || [];
  
  console.log('BrandDetailsModal rendering with brand:', brand.name);
  console.log('Campaigns in modal:', campaigns.length, campaigns);
  
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
      <div className="bg-black border border-zinc-800 rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header - Fixed */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 border-b border-zinc-800 rounded-t-lg">
          <h2 className="text-3xl font-bold text-white">{brand.name}</h2>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-6">
          <div className="space-y-6">
            {/* Contact Person */}
            {brand.contactPerson && (
              <div className="bg-zinc-900 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Contact Person</h3>
                <p className="text-xl font-semibold text-white">{brand.contactPerson}</p>
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
            <div className="bg-zinc-900 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Total External Budget</h3>
              <p className="text-2xl font-bold text-green-400">₹{totalExternalBudget.toLocaleString()}</p>
            </div>

            {/* Campaigns List */}
            {campaigns.length > 0 && (
              <div className="bg-zinc-900 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">Campaigns</h3>
                <div className="space-y-2">
                  {campaigns.map(campaign => (
                    <div key={campaign.id} className="bg-zinc-800 rounded p-3 flex justify-between items-center">
                      <div>
                        <p className="text-white font-medium">{campaign.name}</p>
                        <p className="text-sm text-gray-300">{campaign.influencers.length} influencers</p>
                      </div>
                      {campaign.externalCost && (
                        <p className="text-green-400 font-semibold">₹{campaign.externalCost.toLocaleString()}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Influencers List */}
            {uniqueInfluencers.length > 0 && (
              <div className="bg-zinc-900 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold text-white">Influencers List</h3>
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
                    <div key={influencer.id} className="bg-zinc-800 rounded p-3">
                      <div>
                        <p className="text-white font-medium">{`${influencer.firstName} ${influencer.lastName}`.trim()}</p>
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
        <div className="border-t border-zinc-800 p-6 flex justify-center bg-black">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-zinc-900 hover:bg-zinc-800 rounded-lg font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
