import { useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  liveLink?: string;
  invoices?: any;
  campaignInfluencerId?: string;
}

interface CampaignInfluencersModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  influencers: Influencer[];
  onRemove: (influencerId: string) => void;
}


const formatFollowers = (followers: number, unit: 'K' | 'M'): string => {
  // Backend stores converted values (17K -> 17000), so we need to reverse it for display
  const displayValue = unit === 'K' ? followers / 1000 : followers / 1000000;
  return `${displayValue}${unit}`;
};

export default function CampaignInfluencersModal({
  isOpen,
  onClose,
  campaignId,
  campaignName,
  influencers,
  onRemove,
}: CampaignInfluencersModalProps) {
  const [selectedInfluencers, setSelectedInfluencers] = useState<string[]>([]);
  const [editingInfluencer, setEditingInfluencer] = useState<string | null>(null);
  const [expandedInfluencer, setExpandedInfluencer] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ liveLink: '' });
  const [uploadingInvoice, setUploadingInvoice] = useState<string | null>(null);
  const [showAddInfluencerModal, setShowAddInfluencerModal] = useState(false);
  const [allInfluencers, setAllInfluencers] = useState<Influencer[]>([]);
  const [loadingInfluencers, setLoadingInfluencers] = useState(false);
  const [addingInfluencer, setAddingInfluencer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const fetchAllInfluencers = async () => {
    setLoadingInfluencers(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/influencers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      // Filter out influencers already in the campaign
      const currentInfluencerIds = influencers.map(inf => inf.id);
      const availableInfluencers = data.filter((inf: Influencer) => !currentInfluencerIds.includes(inf.id));
      setAllInfluencers(availableInfluencers);
    } catch (error) {
      console.error('Failed to fetch influencers:', error);
    } finally {
      setLoadingInfluencers(false);
    }
  };

  const handleOpenAddInfluencer = () => {
    setShowAddInfluencerModal(true);
    fetchAllInfluencers();
  };

  const handleAddInfluencer = async (influencerId: string) => {
    setAddingInfluencer(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/campaigns/${campaignId}/influencers/${influencerId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        alert('Influencer added successfully!');
        setShowAddInfluencerModal(false);
        window.location.reload();
      } else {
        alert('Failed to add influencer');
      }
    } catch (error) {
      console.error('Failed to add influencer:', error);
      alert('Failed to add influencer');
    } finally {
      setAddingInfluencer(false);
    }
  };

  const filteredAvailableInfluencers = allInfluencers.filter(inf => {
    const searchLower = searchQuery.toLowerCase();
    return (
      inf.firstName.toLowerCase().includes(searchLower) ||
      inf.lastName.toLowerCase().includes(searchLower) ||
      inf.primaryGenre.toLowerCase().includes(searchLower) ||
      inf.city.toLowerCase().includes(searchLower)
    );
  });

  const handleRemove = async (influencerId: string) => {
    if (!confirm('Remove this influencer from the campaign?')) return;

    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/campaigns/${campaignId}/influencers/${influencerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      onRemove(influencerId);
    } catch (error) {
      console.error('Failed to remove influencer:', error);
    }
  };

  const startEdit = (influencer: Influencer) => {
    setEditingInfluencer(influencer.id);
    setEditForm({
      liveLink: influencer.liveLink || ''
    });
  };

  const cancelEdit = () => {
    setEditingInfluencer(null);
    setEditForm({ liveLink: '' });
  };

  const saveEdit = async (influencerId: string) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/campaigns/${campaignId}/influencers/${influencerId}/details`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          liveLink: editForm.liveLink || null
        })
      });

      // Refresh the influencers list
      window.location.reload();
    } catch (error) {
      console.error('Failed to update influencer details:', error);
      alert('Failed to update details');
    }
  };

  const handleInvoiceUpload = async (influencerId: string, file: File) => {
    setUploadingInvoice(influencerId);
    try {
      const formData = new FormData();
      formData.append('invoice', file);

      const response = await fetch(
        `${API_URL}/api/campaigns/${campaignId}/influencers/${influencerId}/invoice`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (response.ok) {
        alert('Invoice uploaded successfully!');
        window.location.reload();
      } else {
        alert('Failed to upload invoice');
      }
    } catch (error) {
      console.error('Failed to upload invoice:', error);
      alert('Failed to upload invoice');
    } finally {
      setUploadingInvoice(null);
    }
  };

  const handleInvoiceDelete = async (influencerId: string, invoiceId: string) => {
    if (!confirm('Delete this invoice?')) return;

    try {
      const response = await fetch(
        `${API_URL}/api/campaigns/${campaignId}/influencers/${influencerId}/invoice/${invoiceId}`,
        {
          method: 'DELETE'
        }
      );

      if (response.ok) {
        alert('Invoice deleted successfully!');
        window.location.reload();
      } else {
        alert('Failed to delete invoice');
      }
    } catch (error) {
      console.error('Failed to delete invoice:', error);
      alert('Failed to delete invoice');
    }
  };

  const handleInvoiceDownload = (influencerId: string, filename: string, originalName: string) => {
    const url = `${API_URL}/api/campaigns/${campaignId}/influencers/${influencerId}/invoice/${filename}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSelect = (id: string) => {
    setSelectedInfluencers(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedInfluencers.length === influencers.length) {
      setSelectedInfluencers([]);
    } else {
      setSelectedInfluencers(influencers.map(inf => inf.id));
    }
  };

  const exportToCSV = () => {
    const selected = influencers.filter(inf => selectedInfluencers.includes(inf.id));
    const csvContent = [
      ['Name', 'Followers', 'Avg Views', 'Primary Genre', 'Secondary Genre', 'City', 'State', 'Contact', 'Commercials', 'Gender'],
      ...selected.map(inf => [
        `${inf.firstName} ${inf.lastName}`,
        formatFollowers(inf.followers, inf.followersUnit),
        inf.avgViews ? formatFollowers(inf.avgViews, inf.avgViewsUnit) : '',
        inf.primaryGenre,
        inf.secondaryGenre,
        inf.city,
        inf.state,
        `${inf.contact.contactType}: ${inf.contact.contactValue}`,
        inf.commercials.map(c => `${c.platform} (${c.type}: ${c.count.toLocaleString()}${c.monthAdRights > 0 ? `, Ad Rights: ${c.monthAdRights} months` : ''})`).join('; '),
        inf.gender
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campaignName}_influencers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToExcel = () => {
    const selected = influencers.filter(inf => selectedInfluencers.includes(inf.id));
    const data = selected.map(inf => ({
      'Name': `${inf.firstName} ${inf.lastName}`,
      'Followers': formatFollowers(inf.followers, inf.followersUnit),
      'Avg Views': inf.avgViews ? formatFollowers(inf.avgViews, inf.avgViewsUnit) : '',
      'Primary Genre': inf.primaryGenre,
      'Secondary Genre': inf.secondaryGenre,
      'City': inf.city,
      'State': inf.state,
      'Contact Type': inf.contact.contactType,
      'Contact Value': inf.contact.contactValue,
      'Commercials': inf.commercials.map(c => `${c.platform} (${c.type}: ${c.count.toLocaleString()})`).join('; '),
      'Gender': inf.gender
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Influencers');
    XLSX.writeFile(wb, `${campaignName}_influencers_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = () => {
    const selected = influencers.filter(inf => selectedInfluencers.includes(inf.id));
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text(`${campaignName} - Influencers`, 14, 15);

    autoTable(doc, {
      startY: 25,
      head: [['Name', 'Followers', 'Genre', 'Gender', 'Location', 'Contact']],
      body: selected.map(inf => [
        `${inf.firstName} ${inf.lastName}`,
        formatFollowers(inf.followers, inf.followersUnit),
        inf.primaryGenre,
        inf.gender,
        `${inf.city}, ${inf.state}`,
        inf.contact.contactValue
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`${campaignName}_influencers_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-black border border-zinc-800 rounded-lg p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Campaign Influencers</h2>
            <p className="text-gray-400 mt-1">{campaignName}</p>
            <p className="text-sm text-gray-400 mt-2">
              {influencers.length} influencer{influencers.length !== 1 ? 's' : ''}
              {selectedInfluencers.length > 0 && (
                <span className="text-blue-600 font-medium"> · {selectedInfluencers.length} selected</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleOpenAddInfluencer}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Influencer
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {selectedInfluencers.length > 0 && (
          <div className="mb-4 flex gap-2">
            <div className="relative group">
              <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
                Export ({selectedInfluencers.length})
              </button>
              <div className="absolute left-0 mt-2 w-48 bg-zinc-900 rounded-lg shadow-lg border border-zinc-800 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={exportToCSV}
                  className="w-full text-left px-4 py-2 text-white hover:bg-zinc-800 rounded-t-lg"
                >
                  Export as CSV
                </button>
                <button
                  onClick={exportToExcel}
                  className="w-full text-left px-4 py-2 text-white hover:bg-zinc-800"
                >
                  Export as Excel
                </button>
                <button
                  onClick={exportToPDF}
                  className="w-full text-left px-4 py-2 text-white hover:bg-zinc-800 rounded-b-lg"
                >
                  Export as PDF
                </button>
              </div>
            </div>
            <button
              onClick={toggleSelectAll}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              {selectedInfluencers.length === influencers.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        )}

        {influencers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No influencers in this campaign yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {influencers.map((influencer) => (
              <div
                key={influencer.id}
                className="bg-zinc-900 border-2 border-zinc-800 rounded-xl overflow-hidden hover:border-blue-400 transition-all"
              >
                {/* Card Header - Always Visible */}
                <div
                  onClick={() => setExpandedInfluencer(expandedInfluencer === influencer.id ? null : influencer.id)}
                  className="p-5 cursor-pointer hover:bg-zinc-800 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedInfluencers.includes(influencer.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelect(influencer.id);
                        }}
                        className="w-5 h-5 rounded border-gray-300"
                      />
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white">
                          {influencer.firstName} {influencer.lastName}
                        </h3>
                        <div className="flex gap-4 mt-2 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                            </svg>
                            {influencer.followers.toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            {influencer.city}
                          </span>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                            {influencer.primaryGenre}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Status indicators */}
                      <div className="flex gap-2 text-sm">
                        {influencer.liveLink ? (
                          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Link
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full font-medium flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            No Link
                          </span>
                        )}
                        {influencer.invoices && Array.isArray(influencer.invoices) && influencer.invoices.length > 0 ? (
                          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-medium flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            {influencer.invoices.length} Invoice{influencer.invoices.length !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full font-medium flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            No Invoices
                          </span>
                        )}
                      </div>
                      <svg
                        className={`w-6 h-6 text-gray-400 transition-transform ${expandedInfluencer === influencer.id ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedInfluencer === influencer.id && (
                  <div className="border-t-2 border-zinc-800 p-6 bg-black">
                    {editingInfluencer === influencer.id ? (
                      // Edit Mode
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-300 mb-3">
                            Live Link
                          </label>
                          <input
                            type="text"
                            value={editForm.liveLink}
                            onChange={(e) => setEditForm({ liveLink: e.target.value })}
                            className="w-full px-4 py-3 text-base bg-zinc-900 border-2 border-zinc-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="https://instagram.com/p/..."
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => saveEdit(influencer.id)}
                            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                          >
                            Save Changes
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex-1 px-6 py-3 bg-zinc-800 text-gray-300 rounded-lg hover:bg-zinc-700 font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="space-y-6">
                        <div className="bg-zinc-800 p-5 rounded-lg border border-zinc-700">
                          <label className="block text-sm font-semibold text-gray-300 mb-3">
                            Live Link
                          </label>
                          {influencer.liveLink ? (
                            <a
                              href={influencer.liveLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-base break-all underline"
                            >
                              {influencer.liveLink}
                            </a>
                          ) : (
                            <p className="text-gray-400 italic text-base">Not set</p>
                          )}
                        </div>
                        <div className="bg-zinc-800 p-5 rounded-lg border border-zinc-700">
                          <div className="flex justify-between items-center mb-4">
                            <label className="block text-sm font-semibold text-gray-300">
                              Invoices
                            </label>
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept=".pdf,.doc,.docx"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleInvoiceUpload(influencer.id, file);
                                  }
                                }}
                                className="hidden"
                                disabled={uploadingInvoice === influencer.id}
                              />
                              <span className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors inline-flex items-center gap-2 text-sm">
                                {uploadingInvoice === influencer.id ? (
                                  <>
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Uploading...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    Upload Invoice
                                  </>
                                )}
                              </span>
                            </label>
                          </div>
                          {influencer.invoices && Array.isArray(influencer.invoices) && influencer.invoices.length > 0 ? (
                            <div className="space-y-2">
                              {influencer.invoices.map((invoice: any) => (
                                <div
                                  key={invoice.id}
                                  className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-colors"
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <svg className="w-8 h-8 text-purple-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-white truncate">
                                        {invoice.filename}
                                      </p>
                                      <p className="text-xs text-gray-400">
                                        {(invoice.size / 1024).toFixed(1)} KB · {new Date(invoice.uploadedAt).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 ml-3">
                                    <button
                                      onClick={() => handleInvoiceDownload(influencer.id, invoice.filepath, invoice.filename)}
                                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Download"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleInvoiceDelete(influencer.id, invoice.id)}
                                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Delete"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-400 italic text-base text-center py-4">No invoices uploaded</p>
                          )}
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => startEdit(influencer)}
                            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                          >
                            Edit Details
                          </button>
                          <button
                            onClick={() => handleRemove(influencer.id)}
                            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {influencers.length > 0 && selectedInfluencers.length === 0 && (
          <div className="mt-4">
            <button
              onClick={toggleSelectAll}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Select All
            </button>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Add Influencer Modal */}
      {showAddInfluencerModal && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            setShowAddInfluencerModal(false);
          }} 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="bg-black border border-zinc-800 rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold text-white">Add Influencer to Campaign</h3>
              <button
                onClick={() => setShowAddInfluencerModal(false)}
                className="text-gray-400 hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search Bar */}
            <div className="mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search influencers by name, genre, or city..."
                className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Influencers List */}
            <div className="flex-1 overflow-y-auto">
              {loadingInfluencers ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                </div>
              ) : filteredAvailableInfluencers.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400">
                    {searchQuery ? 'No influencers found matching your search.' : 'All influencers are already in this campaign.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAvailableInfluencers.map((influencer) => (
                    <div
                      key={influencer.id}
                      className="flex items-center justify-between p-4 border border-zinc-800 rounded-lg hover:bg-zinc-900 transition-colors"
                    >
                      <div className="flex-1">
                        <h4 className="font-semibold text-white">
                          {influencer.firstName} {influencer.lastName}
                        </h4>
                        <p className="text-sm text-gray-400">
                          {influencer.primaryGenre} · {formatFollowers(influencer.followers, influencer.followersUnit)} followers · {influencer.city}
                        </p>
                        {influencer.igLink && (
                          <a 
                            href={influencer.igLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            View Instagram
                          </a>
                        )}
                      </div>
                      <button
                        onClick={() => handleAddInfluencer(influencer.id)}
                        disabled={addingInfluencer}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingInfluencer ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setShowAddInfluencerModal(false)}
                className="w-full px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
