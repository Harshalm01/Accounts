import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Influencer {
  id: string;
  srNo: number;
  name: string;
  igLink: string;
  followers: string;
  avgViews: string | null;
  genre: string;
  contact: string;
  commercials: string;
  location: string;
  createdAt: string;
  updatedAt: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function InfluencerDashboard() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingInfluencer, setEditingInfluencer] = useState<Influencer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInfluencers, setSelectedInfluencers] = useState<string[]>([]);
  const [showCampaignModal, setShowCampaignModal] = useState(false);

  // Fetch influencers
  const fetchInfluencers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/influencers`);
      const data = await response.json();
      setInfluencers(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch influencers:', error);
      setLoading(false);
    }
  };

  // Setup Socket.io for real-time updates
  useEffect(() => {
    fetchInfluencers();

    const newSocket = io(API_URL);

    newSocket.on('influencer:created', (influencer: Influencer) => {
      setInfluencers((prev) => [...prev, influencer].sort((a, b) => a.srNo - b.srNo));
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

  // Filter influencers based on search
  const filteredInfluencers = influencers.filter((inf) => 
    inf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inf.genre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inf.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Delete influencer
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

  // Open modal for editing
  const handleEdit = (influencer: Influencer) => {
    setEditingInfluencer(influencer);
    setShowModal(true);
  };

  // Handle select/deselect individual influencer
  const toggleSelect = (id: string) => {
    setSelectedInfluencers(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Handle select all
  const toggleSelectAll = () => {
    if (selectedInfluencers.length === filteredInfluencers.length) {
      setSelectedInfluencers([]);
    } else {
      setSelectedInfluencers(filteredInfluencers.map(inf => inf.id));
    }
  };

  // Export functions
  const exportToCSV = () => {
    const selected = influencers.filter(inf => selectedInfluencers.includes(inf.id));
    const csvContent = [
      ['Sr No', 'Name', 'Instagram', 'Followers', 'Avg Views', 'Genre', 'Contact', 'Commercials', 'Location'],
      ...selected.map(inf => [
        inf.srNo,
        inf.name,
        inf.igLink,
        inf.followers,
        inf.avgViews || '',
        inf.genre,
        inf.contact,
        inf.commercials,
        inf.location
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `influencers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToExcel = () => {
    const selected = influencers.filter(inf => selectedInfluencers.includes(inf.id));
    const data = selected.map(inf => ({
      'Sr No': inf.srNo,
      'Name': inf.name,
      'Instagram': inf.igLink,
      'Followers': inf.followers,
      'Avg Views': inf.avgViews || '',
      'Genre': inf.genre,
      'Contact': inf.contact,
      'Commercials': inf.commercials,
      'Location': inf.location
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Influencers');
    XLSX.writeFile(wb, `influencers_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = () => {
    const selected = influencers.filter(inf => selectedInfluencers.includes(inf.id));
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('Influencers List', 14, 15);

    autoTable(doc, {
      startY: 25,
      head: [['Sr No', 'Name', 'Followers', 'Genre', 'Location', 'Contact']],
      body: selected.map(inf => [
        inf.srNo,
        inf.name,
        inf.followers,
        inf.genre.split(',')[0],
        inf.location,
        inf.contact
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`influencers_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Influencers</h1>
          <p className="text-gray-600">Manage your influencer database</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-600 mb-1">Total Influencers</p>
            <p className="text-2xl font-semibold text-gray-900">{influencers.length}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-600 mb-1">Nano (&lt;10K)</p>
            <p className="text-2xl font-semibold text-gray-900">
              {influencers.filter(inf => {
                const count = parseFloat(inf.followers.replace(/[km,]/gi, '')) * (inf.followers.toLowerCase().includes('k') ? 1000 : inf.followers.toLowerCase().includes('m') ? 1000000 : 1);
                return count < 10000;
              }).length}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-600 mb-1">Micro (10K-100K)</p>
            <p className="text-2xl font-semibold text-gray-900">
              {influencers.filter(inf => {
                const count = parseFloat(inf.followers.replace(/[km,]/gi, '')) * (inf.followers.toLowerCase().includes('k') ? 1000 : inf.followers.toLowerCase().includes('m') ? 1000000 : 1);
                return count >= 10000 && count < 100000;
              }).length}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-600 mb-1">Macro (&gt;100K)</p>
            <p className="text-2xl font-semibold text-gray-900">
              {influencers.filter(inf => {
                const count = parseFloat(inf.followers.replace(/[km,]/gi, '')) * (inf.followers.toLowerCase().includes('k') ? 1000 : inf.followers.toLowerCase().includes('m') ? 1000000 : 1);
                return count >= 100000;
              }).length}
            </p>
          </div>
        </div>

        {/* Search and Add Button */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Search influencers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {selectedInfluencers.length > 0 && (
              <>
                <div className="relative group">
                  <button
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    Export ({selectedInfluencers.length})
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                    <button
                      onClick={exportToCSV}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded-t-lg"
                    >
                      Export as CSV
                    </button>
                    <button
                      onClick={exportToExcel}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100"
                    >
                      Export as Excel
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded-b-lg"
                    >
                      Export as PDF
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setShowCampaignModal(true)}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  Add to Campaign ({selectedInfluencers.length})
                </button>
              </>
            )}
            <button
              onClick={() => {
                setEditingInfluencer(null);
                setShowModal(true);
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Add Influencer
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-3">
            Showing {filteredInfluencers.length} of {influencers.length} influencers
            {selectedInfluencers.length > 0 && ` · ${selectedInfluencers.length} selected`}
          </p>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedInfluencers.length === filteredInfluencers.length && filteredInfluencers.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Followers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Genre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInfluencers.map((influencer) => (
                <tr key={influencer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedInfluencers.includes(influencer.id)}
                      onChange={() => toggleSelect(influencer.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{influencer.srNo}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{influencer.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{influencer.followers}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{influencer.genre.split(',')[0]}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{influencer.location}</td>
                  <td className="px-6 py-4 text-sm text-right space-x-2">
                    <button
                      onClick={() => handleEdit(influencer)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(influencer.id)}
                      className="text-red-600 hover:text-red-800 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <InfluencerModal
          influencer={editingInfluencer}
          onClose={() => {
            setShowModal(false);
            setEditingInfluencer(null);
          }}
        />
      )}

      {/* Campaign Selection Modal */}
      {showCampaignModal && (
        <CampaignSelectionModal
          selectedInfluencers={selectedInfluencers}
          onClose={() => {
            setShowCampaignModal(false);
            setSelectedInfluencers([]);
          }}
        />
      )}
    </div>
  );
}

// Modal Component
function InfluencerModal({
  influencer,
  onClose,
}: {
  influencer: Influencer | null;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    srNo: influencer?.srNo || 0,
    name: influencer?.name || '',
    igLink: influencer?.igLink || '',
    followers: influencer?.followers || '',
    avgViews: influencer?.avgViews || '',
    genre: influencer?.genre || '',
    contact: influencer?.contact || '',
    commercials: influencer?.commercials || '',
    location: influencer?.location || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    try {
      if (influencer) {
        // Update
        await fetch(`${API_URL}/api/influencers/${influencer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      } else {
        // Create
        await fetch(`${API_URL}/api/influencers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      }
      onClose();
    } catch (error) {
      console.error('Failed to save influencer:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {influencer ? 'Edit Influencer' : 'Add New Influencer'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sr No.</label>
              <input
                type="number"
                required
                value={formData.srNo}
                onChange={(e) => setFormData({ ...formData, srNo: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instagram Link</label>
            <input
              type="url"
              required
              value={formData.igLink}
              onChange={(e) => setFormData({ ...formData, igLink: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Followers</label>
              <input
                type="text"
                required
                value={formData.followers}
                onChange={(e) => setFormData({ ...formData, followers: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Avg Views</label>
              <input
                type="text"
                value={formData.avgViews}
                onChange={(e) => setFormData({ ...formData, avgViews: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Genre</label>
              <input
                type="text"
                required
                value={formData.genre}
                onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                required
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
            <input
              type="text"
              required
              value={formData.contact}
              onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Commercials</label>
            <textarea
              required
              rows={3}
              value={formData.commercials}
              onChange={(e) => setFormData({ ...formData, commercials: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              {influencer ? 'Update' : 'Add'} Influencer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
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
  const [selectedCampaign, setSelectedCampaign] = useState('');

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch(`${API_URL}/api/campaigns`);
      const data = await response.json();
      setCampaigns(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
      setLoading(false);
    }
  };

  const handleAddToCampaign = async () => {
    if (!selectedCampaign) {
      alert('Please select a campaign');
      return;
    }

    try {
      await fetch(`${API_URL}/api/campaigns/batch-add-influencers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: selectedCampaign,
          influencerIds: selectedInfluencers,
        }),
      });
      alert('Influencers added to campaign successfully!');
      onClose();
    } catch (error) {
      console.error('Failed to add influencers to campaign:', error);
      alert('Failed to add influencers to campaign');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="border-b border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Add {selectedInfluencers.length} Influencers to Campaign
          </h2>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Campaign
              </label>
              <select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Choose a campaign...</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} - {campaign.brandName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 p-6 flex gap-3">
          <button
            onClick={handleAddToCampaign}
            disabled={!selectedCampaign}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Add to Campaign
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
