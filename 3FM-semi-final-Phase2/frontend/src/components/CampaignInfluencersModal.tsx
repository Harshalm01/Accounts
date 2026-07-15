import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { io as socketIO } from 'socket.io-client';
import { API_URL } from '../config';
import ConfirmModal from './ConfirmModal';

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
  liveDate?: string;
  invoices?: any;
  campaignInfluencerId?: string;
  brandApprovalStatus?: string | null;
  brandComment?: string | null;
  internalCost?: number;
  externalCost?: number;
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
  const [editForm, setEditForm] = useState({ liveLink: '', liveDate: '', internalCost: '', externalCost: '' });
  const [uploadingInvoice, setUploadingInvoice] = useState<string | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({ paymentStatus: 'UNPAID', amount: '', dueDate: '', paidDate: '' });
  const [showAddInfluencerModal, setShowAddInfluencerModal] = useState(false);
  const [addResults, setAddResults] = useState<Influencer[]>([]);
  const [addTotal, setAddTotal] = useState(0);
  const [addPage, setAddPage] = useState(1);
  const [addPages, setAddPages] = useState(1);
  const [loadingInfluencers, setLoadingInfluencers] = useState(false);
  const [addingInfluencer, setAddingInfluencer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [addFilters, setAddFilters] = useState<{ genres: string[]; genders: string[]; followersRange: string }>({ genres: [], genders: [], followersRange: 'all' });
  const [filterOptions, setFilterOptions] = useState<{ genres: string[]; genders: string[] }>({ genres: [], genders: [] });
  const [costFormInfluencer, setCostFormInfluencer] = useState<string | null>(null);
  const [costForm, setCostForm] = useState({ internalCost: '', externalCost: '' });
  const [addingToAccounts, setAddingToAccounts] = useState(false);

  const [creatorRequests, setCreatorRequests] = useState<any[]>([]);
  const [requestsOpen, setRequestsOpen] = useState(true);
  const [creatorRejectModal, setCreatorRejectModal] = useState<{ id: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });
  const [creatorRejectComment, setCreatorRejectComment] = useState('');
  const [creatorActionLoading, setCreatorActionLoading] = useState(false);

  const [reviewModal, setReviewModal] = useState<{ invoiceId: string; creatorEmail: string } | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewActionLoading, setReviewActionLoading] = useState(false);
  const [viewDetailsModal, setViewDetailsModal] = useState<any | null>(null);
  const [localInfluencers, setLocalInfluencers] = useState<Influencer[]>(influencers);
  const [scanModal, setScanModal] = useState<{ invoiceId: string; fileName: string; fields: Record<string, { detected: boolean; value: string }>; rawText: string; invoiceType: string; message?: string } | null>(null);
  const [scanLoading, setScanLoading] = useState<string | null>(null);

  const fetchInfluencers = async () => {
    const token = localStorage.getItem('token');
    try {
      const r = await fetch(`${API_URL}/api/campaigns/${campaignId}/influencers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = r.ok ? await r.json() : [];
      console.log('📍 [CampaignInfluencers] Fetched influencers:', data);
      data.forEach((inf: any) => {
        console.log(`   → Influencer ${inf.firstName} ${inf.lastName}: creatorInvoices=${inf.creatorInvoices?.length || 0}`);
      });
      setLocalInfluencers(data);
    } catch (error) {
      console.error('Failed to fetch influencers:', error);
    }
  };

  const fetchRequests = async () => {
    const token = localStorage.getItem('token');
    try {
      console.log(`📍 [CampaignInfluencers] Fetching requests for campaign: ${campaignId}`);
      const url = `${API_URL}/api/creator-portal/requests?campaignId=${campaignId}`;
      console.log(`   → URL: ${url}`);
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(`   → Status: ${r.status} ${r.statusText}`);
      if (!r.ok) {
        console.warn(`⚠️  [CampaignInfluencers] Failed to fetch requests: ${r.status} ${r.statusText}`);
      }
      const d = r.ok ? await r.json() : { requests: [] };
      console.log(`   → Raw API response:`, d);
      console.log(`   → Number of requests in response: ${d.requests?.length || 0}`);

      const filtered = (d.requests || []).filter((r: any) => r.campaignId === campaignId);
      console.log(`   → After filtering by campaignId: ${filtered.length}`);
      console.log(`   → Filtered requests:`, filtered);

      setCreatorRequests(filtered);
      console.log(`📍 [CampaignInfluencers] Requests state updated with ${filtered.length} items`);
    } catch (e) {
      console.error(`❌ [CampaignInfluencers] Error fetching requests:`, e);
    }
  };

  useEffect(() => {
    if (!isOpen || !campaignId) return;
    fetchInfluencers();
    fetchRequests();
  }, [isOpen, campaignId]);

  // Live sync via socket.io
  useEffect(() => {
    if (!isOpen || !campaignId) return;
    const socket = socketIO(API_URL, { forceNew: false });
    console.log('🔌 [CampaignInfluencers] Socket connected, listening for creator events');

    socket.on('creator:request:new', (data: { campaignId: string }) => {
      console.log('📩 [CampaignInfluencers] Received creator:request:new', data);
      if (data.campaignId === campaignId) {
        console.log('   ✅ Event matches current campaign, fetching requests');
        fetchRequests();
      } else {
        console.log(`   ❌ Event is for different campaign: ${data.campaignId} vs ${campaignId}`);
      }
    });
    socket.on('creator:request:updated', (data: { campaignId: string }) => {
      console.log('📩 [CampaignInfluencers] Received creator:request:updated', data);
      if (data.campaignId === campaignId) fetchRequests();
    });
    socket.on('creator:submission:new', (data: { campaignId: string }) => {
      console.log('📩 [CampaignInfluencers] Received creator:submission:new', data);
      if (data.campaignId === campaignId) {
        // Also fetch influencers list to show new invoices
        fetchInfluencers();
      }
    });
    socket.on('creator:submission:updated', (data: { campaignId: string }) => {
      console.log('📩 [CampaignInfluencers] Received creator:submission:updated', data);
      if (data.campaignId === campaignId) {
        // Also fetch influencers list to show updated invoice status
        fetchInfluencers();
      }
    });

    return () => {
      socket.off('creator:request:new');
      socket.off('creator:request:updated');
      socket.off('creator:submission:new');
      socket.off('creator:submission:updated');
      socket.disconnect();
    };
  }, [isOpen, campaignId]);

  const reviewCreatorSubmission = async (invoiceId: string, action: 'APPROVE' | 'REJECT', comment?: string) => {
    setReviewActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/creator-portal/submissions/${invoiceId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, comment }),
      });
      setReviewModal(null);
      setReviewComment('');
      fetchInfluencers();
    } catch (e) {
      console.error('Failed to review submission:', e);
    } finally {
      setReviewActionLoading(false);
    }
  };

  const scanInvoice = async (invoiceId: string, fileName: string) => {
    setScanLoading(invoiceId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/invoices/${invoiceId}/scan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setScanModal({ invoiceId, fileName, fields: data.fields || {}, rawText: data.rawText || '', invoiceType: data.invoiceType || 'NON_GST', message: data.message });
    } catch (e) {
      console.error('Failed to scan invoice:', e);
    } finally {
      setScanLoading(null);
    }
  };

  const respondToCreatorRequest = async (id: string, action: 'ACCEPT' | 'REJECT', comment?: string) => {
    console.log(`🎯 [CampaignInfluencers] Responding to creator request: ${id}, Action: ${action}`);
    setCreatorActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/creator-portal/requests/${id}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, comment }),
      });
      console.log(`   → Response status: ${res.status} ${res.statusText}`);
      const data = await res.json();
      console.log(`   → Response data:`, data);

      if (!res.ok) {
        console.error(`   ❌ Error: ${data.error}`);
        return;
      }

      console.log(`   ✅ ${action === 'ACCEPT' ? 'Accepted' : 'Rejected'} successfully`);
      setCreatorRejectModal(null);
      setCreatorRejectComment('');

      // Refresh
      console.log(`   📍 Fetching updated requests for campaign: ${campaignId}`);
      const r2 = await fetch(`${API_URL}/api/creator-portal/requests?campaignId=${campaignId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d2 = r2.ok ? await r2.json() : { requests: [] };
      console.log(`   → Got ${d2.requests?.length || 0} updated requests`);
      setCreatorRequests((d2.requests || []).filter((r: any) => r.campaignId === campaignId));
    } catch (e) {
      console.error('❌ [CampaignInfluencers] Failed to respond:', e);
    } finally {
      setCreatorActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const searchInfluencers = async (page = 1, filtersOverride?: typeof addFilters, searchOverride?: string) => {
    setLoadingInfluencers(true);
    try {
      const token = localStorage.getItem('token');
      const f = filtersOverride || addFilters;
      const q = searchOverride !== undefined ? searchOverride : searchQuery;
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (q.trim()) params.set('search', q.trim());
      if (f.genres.length > 0) params.set('genres', f.genres.join(','));
      if (f.genders.length > 0) params.set('genders', f.genders.join(','));
      if (f.followersRange !== 'all') params.set('followersRange', f.followersRange);
      const response = await fetch(`${API_URL}/api/influencers?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      const results = data.influencers || [];
      // Filter out influencers already in the campaign
      const currentInfluencerIds = localInfluencers.map(inf => inf.id);
      setAddResults(results.filter((inf: Influencer) => !currentInfluencerIds.includes(inf.id)));
      setAddTotal(data.total || 0);
      setAddPage(data.page || 1);
      setAddPages(data.pages || 1);
    } catch (error) {
      console.error('Failed to fetch influencers:', error);
    } finally {
      setLoadingInfluencers(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/influencers/filter-options`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setFilterOptions({ genres: data.genres || [], genders: data.genders || [] });
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
    }
  };

  const handleOpenAddInfluencer = () => {
    setShowAddInfluencerModal(true);
    setSearchQuery('');
    setAddFilters({ genres: [], genders: [], followersRange: 'all' });
    setAddPage(1);
    searchInfluencers(1);
    fetchFilterOptions();
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
        body: JSON.stringify({
          internalCost: parseFloat(costForm.internalCost),
          externalCost: parseFloat(costForm.externalCost),
        })
      });

      if (response.ok) {
        alert('Influencer added successfully!');
        setCostFormInfluencer(null);
        setCostForm({ internalCost: '', externalCost: '' });
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

  const activeFilterCount = addFilters.genres.length + addFilters.genders.length + (addFilters.followersRange !== 'all' ? 1 : 0);

  const handleAddToAccounts = async () => {
    if (selectedInfluencers.length === 0) return;

    // Validate: every selected influencer must have at least one invoice
    const selectedInfs = localInfluencers.filter((inf) => selectedInfluencers.includes(inf.id));
    const missingInvoice = selectedInfs.filter(
      (inf) => !inf.invoices || !Array.isArray(inf.invoices) || inf.invoices.length === 0
    );
    if (missingInvoice.length > 0) {
      const names = missingInvoice.map((inf: any) => `${inf.firstName} ${inf.lastName}`).join(', ');
      alert(`Cannot add to accounts: the following influencers have no invoices uploaded:\n\n${names}\n\nPlease upload an invoice for each influencer before adding to accounts.`);
      return;
    }

    setAddingToAccounts(true);
    try {
      const token = localStorage.getItem('token');
      const entries = selectedInfs.map((inf) => {
        const invoiceArr = (inf.invoices as any[]) || [];
        const latestInvoice = invoiceArr[invoiceArr.length - 1];
        return {
          influencerId: inf.id,
          campaignId,
          internalCost: inf.internalCost || 0,
          invoiceFile: latestInvoice?.filepath || latestInvoice?.filename,
          invoiceOriginalName: latestInvoice?.filename,
        };
      });
      const res = await fetch(`${API_URL}/api/accounts/add`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (res.ok) {
        const msg = `Added ${data.added} to accounts.${data.skipped > 0 ? ` ${data.skipped} already existed.` : ''}`;
        alert(msg);
        setSelectedInfluencers([]);
      } else {
        alert(data.error || 'Failed to add to accounts');
      }
    } catch {
      alert('Failed to add to accounts');
    } finally {
      setAddingToAccounts(false);
    }
  };

  const handleRemove = (influencerId: string) => {
    setConfirmState({
      open: true,
      title: 'Remove Influencer',
      message: 'Remove this influencer from the campaign? This action cannot be undone.',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await fetch(`${API_URL}/api/campaigns/${campaignId}/influencers/${influencerId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          onRemove(influencerId);
        } catch (error) {
          console.error('Failed to remove influencer:', error);
        }
      },
    });
  };

  const startEdit = (influencer: Influencer) => {
    setEditingInfluencer(influencer.id);
    setEditForm({
      liveLink: influencer.liveLink || '',
      liveDate: influencer.liveDate ? influencer.liveDate.slice(0, 10) : '',
      internalCost: String(influencer.internalCost || 0),
      externalCost: String(influencer.externalCost || 0),
    });
  };

  const cancelEdit = () => {
    setEditingInfluencer(null);
    setEditForm({ liveLink: '', liveDate: '', internalCost: '', externalCost: '' });
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
          liveLink: editForm.liveLink || null,
          liveDate: editForm.liveDate || null,
          internalCost: parseFloat(editForm.internalCost) || 0,
          externalCost: parseFloat(editForm.externalCost) || 0,
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

  const handleInvoiceDelete = (influencerId: string, invoiceId: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Invoice',
      message: 'This invoice will be permanently deleted. This action cannot be undone.',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        try {
          const response = await fetch(
            `${API_URL}/api/campaigns/${campaignId}/influencers/${influencerId}/invoice/${invoiceId}`,
            { method: 'DELETE' }
          );
          if (response.ok) {
            window.location.reload();
          }
        } catch (error) {
          console.error('Failed to delete invoice:', error);
        }
      },
    });
  };

  const handlePaymentUpdate = async (influencerId: string, invoiceId: string) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(
        `${API_URL}/api/campaigns/${campaignId}/influencers/${influencerId}/invoice/${invoiceId}/payment`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(paymentForm),
        }
      );
      setPayingInvoice(null);
      window.location.reload();
    } catch (error) {
      console.error('Failed to update payment:', error);
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
    if (selectedInfluencers.length === localInfluencers.length) {
      setSelectedInfluencers([]);
    } else {
      setSelectedInfluencers(localInfluencers.map(inf => inf.id));
    }
  };

  const exportToCSV = () => {
    const selected = localInfluencers.filter(inf => selectedInfluencers.includes(inf.id));
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
    const selected = localInfluencers.filter(inf => selectedInfluencers.includes(inf.id));
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
    const selected = localInfluencers.filter(inf => selectedInfluencers.includes(inf.id));
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
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-lg p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Campaign Influencers</h2>
            <p className="text-gray-400 mt-1">{campaignName}</p>
            <p className="text-sm text-gray-400 mt-2">
              {localInfluencers.length} influencer{localInfluencers.length !== 1 ? 's' : ''}
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
              <div className="absolute left-0 mt-2 w-48 bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-gray-200 dark:border-zinc-800 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={exportToCSV}
                  className="w-full text-left px-4 py-2 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-t-lg"
                >
                  Export as CSV
                </button>
                <button
                  onClick={exportToExcel}
                  className="w-full text-left px-4 py-2 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
                >
                  Export as Excel
                </button>
                <button
                  onClick={exportToPDF}
                  className="w-full text-left px-4 py-2 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-b-lg"
                >
                  Export as PDF
                </button>
              </div>
            </div>
            <button
              onClick={toggleSelectAll}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              {selectedInfluencers.length === localInfluencers.length ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={handleAddToAccounts}
              disabled={addingToAccounts}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {addingToAccounts ? 'Adding...' : `Add to Accounts (${selectedInfluencers.length})`}
            </button>
          </div>
        )}

        {localInfluencers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No influencers in this campaign yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Cost Totals Banner */}
            <div className="p-4 bg-gradient-to-r from-green-50 to-orange-50 dark:from-green-900/20 dark:to-orange-900/20 border border-gray-200 dark:border-zinc-700 rounded-lg">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Internal Cost</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    ₹{localInfluencers.reduce((sum, inf) => sum + (inf.internalCost || 0), 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total External Cost</p>
                  <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                    ₹{localInfluencers.reduce((sum, inf) => sum + (inf.externalCost || 0), 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Grand Total</p>
                  <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                    ₹{localInfluencers.reduce((sum, inf) => sum + (inf.internalCost || 0) + (inf.externalCost || 0), 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Creator Invoice Requests */}
            {creatorRequests.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-indigo-200 dark:border-indigo-800 overflow-hidden">
                <button
                  onClick={() => setRequestsOpen(o => !o)}
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-800 dark:text-white">Creator Invoice Requests</span>
                    <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {creatorRequests.filter(r => r.status === 'PENDING').length} pending
                    </span>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${requestsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {requestsOpen && (
                  <div className="border-t border-indigo-100 dark:border-indigo-900 divide-y divide-gray-100 dark:divide-zinc-800">
                    {creatorRequests.map((req: any) => (
                      <div key={req.id} className="flex items-center justify-between px-5 py-2.5">
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {req.creatorName ? `${req.creatorName} · ` : ''}
                            <span className="font-normal text-gray-500 dark:text-gray-400">{req.creatorEmail}</span>
                          </p>
                          <p className="text-xs text-gray-400 dark:text-zinc-500">{new Date(req.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {req.status === 'PENDING' ? (
                            <>
                              <button
                                onClick={() => respondToCreatorRequest(req.id, 'ACCEPT')}
                                disabled={creatorActionLoading}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                              >Accept</button>
                              <button
                                onClick={() => setCreatorRejectModal({ id: req.id })}
                                disabled={creatorActionLoading}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                              >Reject</button>
                            </>
                          ) : (
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${req.status === 'ACCEPTED' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                              {req.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}


            {localInfluencers.map((influencer) => (
              <div
                key={influencer.id}
                className="bg-white dark:bg-zinc-900 border-2 border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden hover:border-blue-400 transition-all"
              >
                {/* Card Header - Always Visible */}
                <div
                  onClick={() => setExpandedInfluencer(expandedInfluencer === influencer.id ? null : influencer.id)}
                  className="p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
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
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
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
                        {(() => {
                          const creatorLiveLink = influencer.creatorInvoices?.find((inv: any) => inv.liveLink);
                          const adminLiveLink = influencer.liveLink;
                          const hasApprovedLiveLink = creatorLiveLink?.status === 'APPROVED' || adminLiveLink;
                          const hasPendingLiveLink = creatorLiveLink?.status === 'UPLOADED' || (creatorLiveLink && !creatorLiveLink.status);

                          if (hasApprovedLiveLink) {
                            return (
                              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium flex items-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Link
                              </span>
                            );
                          } else if (hasPendingLiveLink) {
                            return (
                              <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium flex items-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                                </svg>
                                Link Pending
                              </span>
                            );
                          } else {
                            return (
                              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full font-medium flex items-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                No Link
                              </span>
                            );
                          }
                        })()}
                        {(() => {
                          const totalInvoices = (influencer.invoices?.length || 0) + (influencer.creatorInvoices?.length || 0);
                          const approvedCreatorInvoices = influencer.creatorInvoices?.filter((inv: any) => inv.status === 'APPROVED') || [];
                          const pendingCreatorInvoices = influencer.creatorInvoices?.filter((inv: any) => inv.status === 'UPLOADED' || !inv.status) || [];
                          const hasApprovedInvoices = (influencer.invoices?.length || 0) > 0 || approvedCreatorInvoices.length > 0;
                          const hasPendingInvoices = pendingCreatorInvoices.length > 0;

                          if (hasApprovedInvoices) {
                            return (
                              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium flex items-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                {totalInvoices} Invoice{totalInvoices !== 1 ? 's' : ''}
                              </span>
                            );
                          } else if (hasPendingInvoices) {
                            return (
                              <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium flex items-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                                </svg>
                                {pendingCreatorInvoices.length} Invoice{pendingCreatorInvoices.length !== 1 ? 's' : ''} Pending
                              </span>
                            );
                          } else {
                            return (
                              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full font-medium flex items-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                No Invoices
                              </span>
                            );
                          }
                        })()}
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
                  <div className="border-t-2 border-gray-200 dark:border-zinc-800 p-6 bg-gray-50 dark:bg-black">
                    {editingInfluencer === influencer.id ? (
                      // Edit Mode
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
                            Live Link
                          </label>
                          <input
                            type="text"
                            value={editForm.liveLink}
                            onChange={(e) => setEditForm({ ...editForm, liveLink: e.target.value })}
                            className="w-full px-4 py-3 text-base bg-white dark:bg-zinc-900 border-2 border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="https://instagram.com/p/..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
                            Live Date
                          </label>
                          <input
                            type="date"
                            value={editForm.liveDate}
                            onChange={(e) => setEditForm({ ...editForm, liveDate: e.target.value })}
                            className="w-full px-4 py-3 text-base bg-white dark:bg-zinc-900 border-2 border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
                              Internal Cost (INR)
                            </label>
                            <input
                              type="number"
                              value={editForm.internalCost}
                              onChange={(e) => setEditForm({ ...editForm, internalCost: e.target.value })}
                              className="w-full px-4 py-3 text-base bg-white dark:bg-zinc-900 border-2 border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
                              External Cost (INR)
                            </label>
                            <input
                              type="number"
                              value={editForm.externalCost}
                              onChange={(e) => setEditForm({ ...editForm, externalCost: e.target.value })}
                              className="w-full px-4 py-3 text-base bg-white dark:bg-zinc-900 border-2 border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="0"
                            />
                          </div>
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
                            className="flex-1 px-6 py-3 bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-zinc-700 font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="space-y-6">
                        <div className="bg-gray-100 dark:bg-zinc-800 p-5 rounded-lg border border-gray-200 dark:border-zinc-700">
                          <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
                            Live Link
                          </label>
                          {(() => {
                            const creatorLiveLink = influencer.creatorInvoices?.find((inv: any) => inv.liveLink)?.liveLink;
                            const displayLink = creatorLiveLink || influencer.liveLink;
                            return displayLink ? (
                              <div className="space-y-2">
                                <a
                                  href={displayLink.startsWith('http') ? displayLink : `https://${displayLink}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 text-base break-all underline block"
                                >
                                  {displayLink}
                                </a>
                                {creatorLiveLink && <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Submitted by creator</p>}
                                {influencer.liveLink && !creatorLiveLink && <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Added by admin</p>}
                              </div>
                            ) : (
                              <p className="text-gray-400 italic text-base">Not set</p>
                            );
                          })()}
                        </div>
                        <div className="bg-gray-100 dark:bg-zinc-800 p-5 rounded-lg border border-gray-200 dark:border-zinc-700">
                          <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
                            Live Date
                          </label>
                          {(() => {
                            const creatorLiveData = influencer.creatorInvoices?.find((inv: any) => inv.liveLink || inv.liveDate);
                            const displayDate = creatorLiveData?.liveDate || influencer.liveDate;
                            return displayDate ? (
                              <div className="space-y-2">
                                <p className="text-gray-800 dark:text-gray-200 text-base font-medium">
                                  {new Date(displayDate).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                                {creatorLiveData?.liveDate && <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Submitted by creator</p>}
                                {influencer.liveDate && !creatorLiveData?.liveDate && <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Added by admin</p>}
                              </div>
                            ) : (
                              <p className="text-gray-400 italic text-base">Not set</p>
                            );
                          })()}
                        </div>
                        <div className="bg-gray-100 dark:bg-zinc-800 p-5 rounded-lg border border-gray-200 dark:border-zinc-700">
                          <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
                            Costs
                          </label>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-gray-400 mb-1">Internal Cost</p>
                              <p className="text-lg font-bold text-green-500">
                                ₹{(influencer.internalCost || 0).toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 mb-1">External Cost</p>
                              <p className="text-lg font-bold text-orange-500">
                                ₹{(influencer.externalCost || 0).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-gray-100 dark:bg-zinc-800 p-5 rounded-lg border border-gray-200 dark:border-zinc-700">
                          <div className="flex justify-between items-center mb-4">
                            <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300">
                              Campaign Invoices
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
                              <span className="px-4 py-2 bg-purple-600 dark:bg-purple-700 text-white rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 font-medium transition-colors inline-flex items-center gap-2 text-sm">
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
                          {(influencer.invoices && Array.isArray(influencer.invoices) && influencer.invoices.length > 0) || (influencer.creatorInvoices && Array.isArray(influencer.creatorInvoices) && influencer.creatorInvoices.length > 0) ? (
                            <div className="space-y-2">
                              {/* Payment summary */}
                              {(() => {
                                const allInvoices = [
                                  ...(influencer.invoices as any[] || []),
                                  ...(influencer.creatorInvoices as any[] || [])
                                ];
                                const total = allInvoices.reduce((s: number, inv: any) => s + (Number(inv.amount) || 0), 0);
                                const paid = allInvoices.filter((inv: any) => inv.paymentStatus === 'PAID').reduce((s: number, inv: any) => s + (Number(inv.amount) || 0), 0);
                                const outstanding = total - paid;
                                if (total === 0) return null;
                                return (
                                  <div className="flex items-center gap-3 text-xs px-3 py-2 bg-gray-50 dark:bg-zinc-800/60 rounded-lg border border-gray-200 dark:border-zinc-700">
                                    <span className="text-gray-500">Total: <span className="font-semibold text-gray-800 dark:text-gray-200">₹{total.toLocaleString()}</span></span>
                                    <span className="text-green-600">Paid: <span className="font-semibold">₹{paid.toLocaleString()}</span></span>
                                    <span className={outstanding > 0 ? 'text-orange-500' : 'text-gray-400'}>
                                      Outstanding: <span className="font-semibold">₹{outstanding.toLocaleString()}</span>
                                    </span>
                                  </div>
                                );
                              })()}

                              {/* Creator Invoices */}
                              {influencer.creatorInvoices && Array.isArray(influencer.creatorInvoices) && influencer.creatorInvoices.length > 0 && (
                                <div className="space-y-2 pb-2 border-b border-gray-200 dark:border-zinc-700">
                                  {influencer.creatorInvoices.map((inv: any) => (
                                    <div key={inv.id} className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/10 overflow-hidden">
                                      <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                          <svg className="w-8 h-8 text-purple-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                          </svg>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">Creator: {inv.creatorRequest?.creatorName || 'Unknown'}</p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                              <p className="text-xs text-gray-500 dark:text-gray-400">File: {inv.fileName || inv.originalName || 'Submission'}</p>
                                              <p className="text-xs text-gray-500 dark:text-gray-400">Submitted: {new Date(inv.createdAt).toLocaleDateString()}</p>
                                              {inv.campaignAmount && <span className="text-xs text-gray-600 dark:text-gray-300">· ₹{Number(inv.campaignAmount).toLocaleString('en-IN')}</span>}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-3">
                                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                            inv.status === 'APPROVED' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                            inv.status === 'REJECTED' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                            'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                          }`}>
                                            {inv.status === 'UPLOADED' ? 'Pending' : inv.status}
                                          </span>
                                          {inv.filePath && (
                                            <a
                                              href={`${API_URL}/api/invoices/${inv.id}/view?token=${localStorage.getItem('token')}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-700 text-xs font-semibold underline"
                                            >
                                              View
                                            </a>
                                          )}
                                          {inv.filePath && (
                                            <button
                                              onClick={() => scanInvoice(inv.id, inv.fileName || inv.originalName || 'Invoice')}
                                              disabled={scanLoading === inv.id}
                                              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors flex items-center gap-1"
                                            >
                                              {scanLoading === inv.id ? (
                                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                </svg>
                                              ) : (
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                                </svg>
                                              )}
                                              Scan
                                            </button>
                                          )}
                                          {inv.status !== 'APPROVED' && (
                                            <button
                                              onClick={() => reviewCreatorSubmission(inv.id, 'APPROVE')}
                                              disabled={reviewActionLoading}
                                              className="px-2 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                                            >
                                              Approve
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Manual Invoices */}
                              {influencer.invoices && Array.isArray(influencer.invoices) && influencer.invoices.length > 0 && (
                                influencer.invoices.map((invoice: any) => (
                                  <div key={invoice.id} className="rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden">
                                    <div className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <svg className="w-8 h-8 text-purple-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                        </svg>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{invoice.filename}</p>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            <p className="text-xs text-gray-400">{(invoice.size / 1024).toFixed(1)} KB · {new Date(invoice.uploadedAt).toLocaleDateString()}</p>
                                            {invoice.amount && <span className="text-xs text-gray-500">· ₹{Number(invoice.amount).toLocaleString()}</span>}
                                            {invoice.dueDate && <span className="text-xs text-gray-400">· Due {new Date(invoice.dueDate).toLocaleDateString()}</span>}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 ml-3">
                                        <button
                                          onClick={() => {
                                            setPayingInvoice(payingInvoice === invoice.id ? null : invoice.id);
                                            setPaymentForm({
                                              paymentStatus: invoice.paymentStatus || 'UNPAID',
                                              amount: invoice.amount ? String(invoice.amount) : '',
                                              dueDate: invoice.dueDate ? invoice.dueDate.split('T')[0] : '',
                                              paidDate: invoice.paidDate ? invoice.paidDate.split('T')[0] : '',
                                            });
                                          }}
                                          className={`px-2 py-1 rounded text-xs font-semibold ${
                                            invoice.paymentStatus === 'PAID'
                                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                              : invoice.paymentStatus === 'PARTIAL'
                                              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                          }`}
                                        >
                                          {invoice.paymentStatus || 'UNPAID'}
                                        </button>
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
                                    {/* Inline payment edit form */}
                                    {payingInvoice === invoice.id && (
                                      <div className="px-3 py-3 bg-gray-50 dark:bg-zinc-800/60 border-t border-gray-200 dark:border-zinc-700 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <select
                                            value={paymentForm.paymentStatus}
                                            onChange={(e) => setPaymentForm(p => ({ ...p, paymentStatus: e.target.value }))}
                                            className="px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                                          >
                                            <option value="UNPAID">Unpaid</option>
                                            <option value="PARTIAL">Partial</option>
                                            <option value="PAID">Paid</option>
                                          </select>
                                          <input
                                            type="number"
                                            placeholder="Amount (₹)"
                                            value={paymentForm.amount}
                                            onChange={(e) => setPaymentForm(p => ({ ...p, amount: e.target.value }))}
                                            className="px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-gray-900 dark:text-white w-28"
                                          />
                                          <input
                                            type="date"
                                            title="Due date"
                                            value={paymentForm.dueDate}
                                            onChange={(e) => setPaymentForm(p => ({ ...p, dueDate: e.target.value }))}
                                            className="px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                                          />
                                          <input
                                            type="date"
                                            title="Paid date"
                                            value={paymentForm.paidDate}
                                            onChange={(e) => setPaymentForm(p => ({ ...p, paidDate: e.target.value }))}
                                            className="px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                                          />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => handlePaymentUpdate(influencer.id, invoice.id)}
                                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => setPayingInvoice(null)}
                                            className="px-3 py-1.5 bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded text-xs"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          ) : (
                            <p className="text-gray-400 italic text-base text-center py-4">No invoices uploaded</p>
                          )}
                        </div>
                        {/* Brand Approval Status */}
                        {(influencer.brandApprovalStatus || influencer.brandComment) && (
                          <div className="bg-gray-100 dark:bg-zinc-800 p-4 rounded-lg border border-gray-200 dark:border-zinc-700">
                            <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">Brand Feedback</label>
                            <div className="flex items-center gap-2 flex-wrap">
                              {influencer.brandApprovalStatus === 'APPROVED' && (
                                <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-semibold flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  Approved
                                </span>
                              )}
                              {influencer.brandApprovalStatus === 'REJECTED' && (
                                <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-semibold flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  Rejected
                                </span>
                              )}
                              {influencer.brandApprovalStatus === 'PENDING' && (
                                <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full text-xs font-semibold">
                                  Awaiting Brand
                                </span>
                              )}
                              {!influencer.brandApprovalStatus && (
                                <span className="px-3 py-1 bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-gray-400 rounded-full text-xs font-semibold">
                                  No Brand Response
                                </span>
                              )}
                            </div>
                            {influencer.brandComment && (
                              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 italic">"{influencer.brandComment}"</p>
                            )}
                          </div>
                        )}

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

        {localInfluencers.length > 0 && selectedInfluencers.length === 0 && (
          <div className="mt-4">
            <button
              onClick={toggleSelectAll}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Select All
            </button>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-100 dark:bg-zinc-900 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* View Form Invoice Details Modal */}
      {viewDetailsModal && (() => {
        const inv = viewDetailsModal;
        const sr = (inv.scanResults || {}) as Record<string, { value: string }>;
        const get = (k: string) => sr[k]?.value || '';
        const isGST = inv.type === 'GST';
        const Row = ({ label, value }: { label: string; value?: string | null }) =>
          value ? (
            <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-zinc-800 last:border-0">
              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
              <span className="text-xs font-medium text-gray-800 dark:text-gray-200 text-right max-w-[60%]">{value}</span>
            </div>
          ) : null;
        return (
          <div onClick={() => setViewDetailsModal(null)} className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
            <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-zinc-700 max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-xl px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-indigo-200 text-xs font-medium">Creator Invoice</p>
                    <p className="text-white font-bold text-base">{inv.campaign?.name || campaignName}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-bold rounded-full ${isGST ? 'bg-purple-200 text-purple-800' : 'bg-blue-200 text-blue-800'}`}>
                    {isGST ? 'GST' : 'Non-GST'}
                  </span>
                </div>
                <p className="text-indigo-200 text-xs mt-1">{inv.creatorEmail}</p>
              </div>
              {/* Body */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                {/* Invoice Info */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Invoice Details</p>
                  <Row label="Invoice Number" value={inv.invoiceNumber} />
                  <Row label="Invoice Date" value={inv.invoiceDate} />
                  <Row label="Campaign Details" value={inv.campaignDetails} />
                </div>
                {/* Amount */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Amount</p>
                  <Row label="Total Amount" value={inv.campaignAmount ? `₹${Number(inv.campaignAmount).toLocaleString('en-IN')}` : null} />
                  {isGST && <>
                    <Row label="Taxable Amount" value={get('taxableAmount') ? `₹${get('taxableAmount')}` : null} />
                    <Row label="CGST" value={get('cgst') ? `₹${get('cgst')}` : null} />
                    <Row label="SGST" value={get('sgst') ? `₹${get('sgst')}` : null} />
                    <Row label="IGST" value={get('igst') ? `₹${get('igst')}` : null} />
                  </>}
                  <Row label="TDS" value={get('tds') ? `₹${get('tds')}` : null} />
                  <Row label="Net Payable" value={get('netPayable') ? `₹${get('netPayable')}` : null} />
                </div>
                {/* Tax / PAN */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{isGST ? 'GST Details' : 'PAN Details'}</p>
                  {isGST ? <>
                    <Row label="GSTIN" value={inv.creatorGstin} />
                    <Row label="Place of Supply" value={get('placeOfSupply')} />
                  </> : <Row label="PAN Card" value={inv.panCard} />}
                </div>
                {/* Bank */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Bank Details</p>
                  <Row label="Account Holder" value={inv.accountHolderName} />
                  <Row label="Bank Name" value={inv.bankName} />
                  <Row label="Account Number" value={inv.accountNumber} />
                  <Row label="IFSC Code" value={inv.ifscCode} />
                  <Row label="Branch" value={inv.branchName} />
                  <Row label="UPI ID" value={inv.upiId} />
                </div>
              </div>
              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 dark:border-zinc-800">
                <button
                  onClick={() => setViewDetailsModal(null)}
                  className="w-full py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-sm"
                >Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Submission Review Reject Modal */}
      {reviewModal && (
        <div onClick={() => { setReviewModal(null); setReviewComment(''); }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-200 dark:border-zinc-700">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Reject Submission</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{reviewModal.creatorEmail}</p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Reason <span className="text-gray-400 font-normal">(optional — emailed to creator)</span>
            </label>
            <textarea
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              placeholder="e.g. Invoice amount doesn't match the agreed rate."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => reviewCreatorSubmission(reviewModal.invoiceId, 'REJECT', reviewComment || undefined)}
                disabled={reviewActionLoading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm"
              >
                {reviewActionLoading ? 'Rejecting...' : 'Confirm Reject'}
              </button>
              <button
                onClick={() => { setReviewModal(null); setReviewComment(''); }}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-sm"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Creator Reject Modal */}
      {creatorRejectModal && (
        <div onClick={() => { setCreatorRejectModal(null); setCreatorRejectComment(''); }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-200 dark:border-zinc-700">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">Reject Creator Request</h3>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Reason <span className="text-gray-400 font-normal">(optional — emailed to creator)</span>
            </label>
            <textarea
              value={creatorRejectComment}
              onChange={e => setCreatorRejectComment(e.target.value)}
              placeholder="e.g. Please resubmit with correct campaign name."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => respondToCreatorRequest(creatorRejectModal.id, 'REJECT', creatorRejectComment || undefined)}
                disabled={creatorActionLoading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm"
              >
                {creatorActionLoading ? 'Rejecting...' : 'Confirm Reject'}
              </button>
              <button
                onClick={() => { setCreatorRejectModal(null); setCreatorRejectComment(''); }}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-sm"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

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
            className="bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Add Influencer to Campaign</h3>
              <button
                onClick={() => setShowAddInfluencerModal(false)}
                className="text-gray-400 hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search Bar + Filter Toggle */}
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchInfluencers(1); }}
                placeholder="Search influencers by name, genre, or city..."
                className="flex-1 px-4 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                onClick={() => searchInfluencers(1)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
              >
                Search
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium flex items-center gap-1.5 transition-colors ${showFilters || activeFilterCount > 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 dark:bg-zinc-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-800'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
              </button>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <div className="mb-3 p-4 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Filters</span>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { setAddFilters({ genres: [], genders: [], followersRange: 'all' }); searchInfluencers(1, { genres: [], genders: [], followersRange: 'all' }); }}
                      className="text-xs text-red-500 hover:text-red-400"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {/* Genre */}
                {filterOptions.genres.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Genre</label>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {filterOptions.genres.map(genre => (
                        <button
                          key={genre}
                          onClick={() => {
                            const newGenres = addFilters.genres.includes(genre) ? addFilters.genres.filter(g => g !== genre) : [...addFilters.genres, genre];
                            const newFilters = { ...addFilters, genres: newGenres };
                            setAddFilters(newFilters);
                            searchInfluencers(1, newFilters);
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${addFilters.genres.includes(genre) ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-zinc-700'}`}
                        >
                          {genre}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gender */}
                {filterOptions.genders.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Gender</label>
                    <div className="flex flex-wrap gap-1.5">
                      {filterOptions.genders.map(gender => (
                        <button
                          key={gender}
                          onClick={() => {
                            const newGenders = addFilters.genders.includes(gender) ? addFilters.genders.filter(g => g !== gender) : [...addFilters.genders, gender];
                            const newFilters = { ...addFilters, genders: newGenders };
                            setAddFilters(newFilters);
                            searchInfluencers(1, newFilters);
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${addFilters.genders.includes(gender) ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-zinc-700'}`}
                        >
                          {gender}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Followers Range */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Followers</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'nano', label: 'Nano (<10K)' },
                      { key: 'micro', label: 'Micro (10K-100K)' },
                      { key: 'macro', label: 'Macro (100K-1M)' },
                      { key: 'mega', label: 'Mega (1M+)' },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => { const newFilters = { ...addFilters, followersRange: opt.key }; setAddFilters(newFilters); searchInfluencers(1, newFilters); }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${addFilters.followersRange === opt.key ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-zinc-700'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Results count */}
            <div className="mb-2 text-xs text-gray-400">
              Showing {addResults.length} of {addTotal.toLocaleString()} influencer{addTotal !== 1 ? 's' : ''} (Page {addPage} of {addPages})
            </div>

            {/* Influencers List */}
            <div className="flex-1 overflow-y-auto">
              {loadingInfluencers ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                </div>
              ) : addResults.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400">
                    {searchQuery || activeFilterCount > 0 ? 'No influencers found matching your filters.' : 'No influencers available.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {addResults.map((influencer) => (
                    <div
                      key={influencer.id}
                      className="p-4 border border-gray-200 dark:border-zinc-800 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
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
                        {costFormInfluencer !== influencer.id && (
                          <button
                            onClick={() => {
                              setCostFormInfluencer(influencer.id);
                              setCostForm({ internalCost: '', externalCost: '' });
                            }}
                            disabled={addingInfluencer}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Add
                          </button>
                        )}
                      </div>
                      {costFormInfluencer === influencer.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-zinc-700">
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Internal Cost (INR) *</label>
                              <input
                                type="number"
                                placeholder="0"
                                value={costForm.internalCost}
                                onChange={(e) => setCostForm(prev => ({ ...prev, internalCost: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                autoFocus
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">External Cost (INR) *</label>
                              <input
                                type="number"
                                placeholder="0"
                                value={costForm.externalCost}
                                onChange={(e) => setCostForm(prev => ({ ...prev, externalCost: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                            <button
                              onClick={() => {
                                if (!costForm.internalCost || !costForm.externalCost) {
                                  alert('Both Internal and External costs are required');
                                  return;
                                }
                                handleAddInfluencer(influencer.id);
                              }}
                              disabled={addingInfluencer}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
                            >
                              {addingInfluencer ? 'Adding...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setCostFormInfluencer(null)}
                              className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {addPages > 1 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-center gap-2">
                <button
                  onClick={() => searchInfluencers(addPage - 1)}
                  disabled={addPage <= 1 || loadingInfluencers}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-zinc-700"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Page {addPage} of {addPages}
                </span>
                <button
                  onClick={() => searchInfluencers(addPage + 1)}
                  disabled={addPage >= addPages || loadingInfluencers}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-zinc-700"
                >
                  Next
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-zinc-800">
              <button
                onClick={() => setShowAddInfluencerModal(false)}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-zinc-900 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animated scanning overlay (while scan is in progress) */}
      {scanLoading && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div
            className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden border border-white/20 shadow-2xl"
            style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(24px)' }}
          >
            <div className="px-6 pt-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-400/30 flex items-center justify-center scan-pulse">
                  <span className="text-xl">🔍</span>
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">AI Extracting Fields…</h3>
                  <p className="text-white/50 text-xs mt-0.5">Processing invoice document</p>
                </div>
              </div>
            </div>
            <div className="relative mx-6 mt-4 h-32 rounded-xl overflow-hidden border border-white/10" style={{ background: 'rgba(0,0,0,0.3)' }}>
              {[...Array(7)].map((_, i) => (
                <div key={i} className="absolute left-4 right-4 h-2 rounded-full bg-white/10" style={{ top: `${12 + i * 13}%` }} />
              ))}
              <div className="scanner-laser absolute left-0 right-0 h-0.5 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, #22c55e 20%, #86efac 50%, #22c55e 80%, transparent 100%)', boxShadow: '0 0 12px 3px rgba(34,197,94,0.6)' }} />
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-green-400/60 rounded-tl" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-green-400/60 rounded-tr" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-green-400/60 rounded-bl" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-green-400/60 rounded-br" />
            </div>
            <div className="px-6 py-4 space-y-2">
              {['Invoice Date', 'Bank Name', 'Account Number', 'IFSC Code', 'PAN Card', 'Campaign Amount'].map((field, i) => (
                <div key={field} className="scanner-field flex items-center gap-2.5" style={{ animationDelay: `${i * 220}ms` }}>
                  <div className="w-4 h-4 rounded-full bg-green-500/20 border border-green-400/40 flex items-center justify-center flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  </div>
                  <span className="text-white/60 text-xs">{field}</span>
                  <div className="flex-1 h-px bg-white/10 rounded" />
                  <span className="text-green-400/60 text-[10px]">scanning…</span>
                </div>
              ))}
            </div>
            <div className="px-6 pb-5">
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full" style={{ animation: 'progress-fill 3s ease-out forwards' }} />
              </div>
              <p className="text-white/30 text-[10px] mt-1.5 text-center">OCR processing in progress</p>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Scan Results Modal */}
      {scanModal && (() => {
        const NON_GST_FIELDS: Record<string, string> = { bankName: 'Bank Name', accountHolderName: 'Account Holder Name', accountNumber: 'Account Number', ifscCode: 'IFSC Code', branchName: 'Branch Name', branchAddress: 'Branch Address', panCard: 'PAN Card', upiId: 'UPI ID', signature: 'Signature', invoiceDate: 'Invoice Date', campaignDetails: 'Campaign Details', campaignAmount: 'Amount', tds: 'TDS Deduction', netPayable: 'Net Payable' };
        const GST_FIELDS: Record<string, string> = { creatorAddress: "Creator's Address", creatorGstin: "Creator's GSTIN", folksAddress: '3Folks Address', folksGstin: '3Folks GSTIN', invoiceNumber: 'Invoice Number', invoiceDate: 'Invoice Date', placeOfSupply: 'Place of Supply', hsnCode: 'HSN / SAC Code', campaignDetails: 'Campaign Details', taxableAmount: 'Taxable Amount', cgst: 'CGST', sgst: 'SGST', igst: 'IGST', campaignAmount: 'Total Amount', tds: 'TDS Deduction', netPayable: 'Net Payable', bankName: 'Bank Name', branchName: 'Branch Name', branchAddress: 'Branch Address', accountHolderName: 'Account Holder Name', accountNumber: 'Account Number', ifscCode: 'IFSC Code', panCard: 'PAN Card', upiId: 'UPI ID', signature: 'Signature' };
        const fieldMap = scanModal.invoiceType === 'GST' ? GST_FIELDS : NON_GST_FIELDS;
        const camelToTitle = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
        const results = scanModal.fields;
        const predefinedKeys = Object.keys(fieldMap).filter(k => results[k] !== undefined && k !== 'signature');
        const extraKeys = Object.keys(results).filter(k => !fieldMap[k] && k !== 'signature');
        const allKeys = [...predefinedKeys, ...extraKeys];
        const detectedCount = allKeys.filter(k => results[k]?.detected).length;

        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={() => setScanModal(null)}>
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-700">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔍</span>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Scan Results</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{scanModal.fileName} · {scanModal.invoiceType === 'GST' ? 'GST Invoice' : 'Non-GST Invoice'}</p>
                  </div>
                </div>
                <button onClick={() => setScanModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1 px-5 py-4">
                {scanModal.message ? (
                  <div className="text-center py-10">
                    <div className="text-4xl mb-3">🔍</div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{scanModal.message}</p>
                  </div>
                ) : allKeys.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Detected Fields ({detectedCount}/{allKeys.length})
                    </h4>
                    <div className="grid gap-2">
                      {allKeys.map((key) => {
                        const label = fieldMap[key] ?? camelToTitle(key);
                        const result = results[key];
                        const detected = result?.detected || false;
                        const value = result?.value || '';
                        return (
                          <div key={key} className={`flex items-start gap-3 p-3 rounded-lg border ${detected ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
                            <span className="mt-0.5 text-base flex-shrink-0">{detected ? '✅' : '❌'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
                              <div className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 break-words">
                                {value || <span className="italic text-gray-400 dark:text-gray-500 text-xs">Not detected</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {scanModal.rawText && (
                      <details className="mt-3">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">Show raw extracted text</summary>
                        <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-gray-50 dark:bg-zinc-800 rounded-lg p-3 max-h-48 overflow-y-auto font-mono">{scanModal.rawText}</pre>
                      </details>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <div className="text-4xl mb-3">📄</div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">No data could be extracted from this invoice.</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-200 dark:border-zinc-700">
                <button onClick={() => setScanModal(null)} className="w-full px-4 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-700 text-sm font-medium transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}
