import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import CampaignModal from './CampaignModal';
import CampaignDetailsModal from './CampaignDetailsModal';
import CampaignWarRoom from './CampaignWarRoom';
import ConfirmModal from './ConfirmModal';
import { fireCelebration } from '../utils/confetti';
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

interface MyAssignment {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  campaign: { id: string; name?: string; brandName?: string; status?: string; startDate?: string };
  assignedBy?: { id: string; name: string; designation?: string };
}


export default function CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPurpose, setAuthPurpose] = useState<'details' | ''>('');
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [authCredentials, setAuthCredentials] = useState({ campaignId: '', password: '' });
  const [verifiedCredentials, setVerifiedCredentials] = useState({ campaignId: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [view, setView] = useState<'cards' | 'timeline'>('cards');
  const [statusFilter, setStatusFilter] = useState<'active' | 'completed'>('active');
  const [reportCampaignId, setReportCampaignId] = useState<string | null>(null);
  const [myAssignments, setMyAssignments] = useState<MyAssignment[]>([]);
  // Import campaign state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; total: number; errors: { row: number; message: string }[] } | null>(null);
  // Bulk select state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [agencyUsers, setAgencyUsers] = useState<{ id: string; name: string; designation?: string }[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [bulkAssignHeadId, setBulkAssignHeadId] = useState('');
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [sortCampaigns, setSortCampaigns] = useState('default');
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  // Read current user role from localStorage
  const userRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return null; } })();
  const currentUserId = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; } })();

  const getDeadlineWarning = (endDate?: string, status?: string) => {
    if (!endDate || status === 'Completed') return null;
    const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { label: 'Overdue', color: 'bg-red-600' };
    if (days === 0) return { label: 'Ends Today', color: 'bg-red-500' };
    if (days <= 3) return { label: `${days}d left`, color: 'bg-orange-500' };
    return null;
  };

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

    const socket = io(API_URL, { forceNew: true });
    const stored = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
    const userId = stored.id ?? null;
    const userRole = stored.role ?? null;

    // Join personal room so backend can target this user with io.to(userId)
    if (userId) socket.emit('join', userId);

    // Only ADMIN/AGENCY see campaigns live as they're created/updated
    // EMPLOYEE must receive explicit assignment acceptance before seeing a campaign
    if (userRole !== 'EMPLOYEE') {
      socket.on('campaign:created', (campaign: Campaign) => {
        setCampaigns((prev) => [campaign, ...prev]);
      });

      socket.on('campaign:updated', (updatedCampaign: Campaign) => {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === updatedCampaign.id ? updatedCampaign : c))
        );
        setSelectedCampaign((prev) => prev?.id === updatedCampaign.id ? updatedCampaign : prev);
        if (updatedCampaign.status === 'Completed') fireCelebration('campaign-complete');
      });
    }

    // Deleted campaigns should be removed for everyone
    socket.on('campaign:deleted', (id: string) => {
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    });

    if (userId) {
      // When current employee is unassigned, remove that campaign from their view
      socket.on(`assignment:removed:${userId}`, ({ campaignId }: { campaignId: string }) => {
        setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
      });
      // When employee accepts an assignment, refresh their campaign list and assignments
      socket.on(`campaign:accessible:${userId}`, () => {
        fetchCampaigns();
        // Refresh assignments to update the accepted status
        const token = localStorage.getItem('token');
        fetch(`${API_URL}/api/assignments/my`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => r.json())
          .then(data => { if (Array.isArray(data)) setMyAssignments(data); })
          .catch(() => {});
      });
    }

    return () => {
      socket.close();
    };
  }, []);

  // Fetch assignments for EMPLOYEE to show "Assigned by" on cards only
  useEffect(() => {
    if (userRole !== 'EMPLOYEE' && userRole !== 'AGENCY') return;
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/assignments/my`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setMyAssignments(data); })
      .catch(() => {});
  }, [userRole]);

  const handleExport = async (ids?: string[], format: 'xlsx' | 'csv' | 'pdf' = 'xlsx') => {
    try {
      const token = localStorage.getItem('token');
      const params = ids && ids.length ? `?ids=${ids.join(',')}&format=${format}` : `?format=${format}`;
      const res = await fetch(`${API_URL}/api/campaigns/export${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = ids && ids.length
        ? `campaigns_selected_${ids.length}.${format}`
        : `campaigns.${format}`;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const fetchAgencyUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const users = Array.isArray(data) ? data : [];
        setAgencyUsers(users.filter((u: any) => u.role === 'AGENCY'));
      }
    } catch (err) {
      console.error('Failed to fetch agency users:', err);
    }
  };

  const handleBulkDelete = () => {
    setConfirmState({
      open: true,
      title: 'Delete Campaigns',
      message: `Delete ${selectedIds.length} selected campaign(s)? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        setBulkActionLoading(true);
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`${API_URL}/api/campaigns/bulk`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ids: selectedIds }),
          });
          if (!res.ok) throw new Error('Bulk delete failed');
          setSelectedIds([]);
          setBulkMode(false);
        } catch (err) {
          console.error('Bulk delete error:', err);
        } finally {
          setBulkActionLoading(false);
        }
      },
    });
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignHeadId) { alert('Please select a head to assign'); return; }
    setBulkActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      await Promise.all(selectedIds.map(campaignId =>
        fetch(`${API_URL}/api/assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ campaignId, headIds: [bulkAssignHeadId] }),
        })
      ));
      setShowAssignModal(false);
      setBulkAssignHeadId('');
      setSelectedIds([]);
      setBulkMode(false);
      alert('Campaigns assigned successfully');
    } catch (err) {
      console.error('Bulk assign error:', err);
      alert('Failed to assign campaigns');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Campaign',
      message: 'This campaign will be permanently deleted. This action cannot be undone.',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await fetch(`${API_URL}/api/campaigns/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
        } catch (error) {
          console.error('Failed to delete campaign:', error);
        }
      },
    });
  };

  const handleCampaignClick = (campaign: Campaign) => {
    console.log('CAMPAIGN CLICKED - userRole:', userRole, 'currentUserId:', currentUserId);
    setSelectedCampaign(campaign);

    // ADMIN + EMPLOYEE bypass auth; if campaign has no password, bypass auth
    if (userRole === 'ADMIN' || userRole === 'EMPLOYEE' || !campaign.campaignId) {
      console.log('Opening directly - Condition 1');
      setShowDetails(true);
      return;
    }

    // AGENCY head: bypass auth if they own the campaign
    if (userRole === 'AGENCY' && campaign.userId === currentUserId) {
      console.log('Opening directly - Condition 2 (own campaign)');
      setShowDetails(true);
      return;
    }

    // AGENCY heads: bypass auth only if they have an ACCEPTED assignment
    if (userRole === 'AGENCY') {
      const hasAccepted = myAssignments.some(
        a => a.campaign?.id === campaign.id && a.status === 'ACCEPTED'
      );
      if (hasAccepted) {
        console.log('Opening directly - Condition 3 (AGENCY head with accepted assignment)');
        setShowDetails(true);
        return;
      }
      // Fall through to show password modal
    }

    // Show password modal for others
    console.log('Showing password modal');
    setAuthPurpose('details');
    setAuthCredentials({ campaignId: '', password: '' });
    setAuthError('');
    setShowAuthModal(true);
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
        setVerifiedCredentials(authCredentials);
        setReportCampaignId(selectedCampaign?.id || null);
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

  const handleAccessDenied = () => {
    // War Room detected access denied (403)
    // Close War Room and show password modal instead
    setReportCampaignId(null);
    if (selectedCampaign) {
      setAuthPurpose('details');
      setAuthCredentials({ campaignId: '', password: '' });
      setAuthError('');
      setShowAuthModal(true);
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
      case 'Draft':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch(`${API_URL}/api/campaigns/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportResult(data);
      if (data.imported > 0) fetchCampaigns();
    } catch (err: any) {
      setImportResult({ imported: 0, total: 0, errors: [{ row: 0, message: err.message }] });
    } finally {
      setImporting(false);
    }
  };

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.brandName.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    // ADMIN status filter: "active" tab shows Active, Upcoming, Draft; "completed" tab shows Completed
    if (userRole === 'ADMIN') {
      if (statusFilter === 'completed') return c.status === 'Completed';
      return c.status !== 'Completed';
    }
    return true;
  });

  const sortedCampaigns = (() => {
    const list = [...filteredCampaigns];
    switch (sortCampaigns) {
      case 'name_asc': return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'name_desc': return list.sort((a, b) => b.name.localeCompare(a.name));
      case 'date_asc': return list.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      case 'date_desc': return list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
      case 'influencers_asc': return list.sort((a, b) => (a.influencers?.length || 0) - (b.influencers?.length || 0));
      case 'influencers_desc': return list.sort((a, b) => (b.influencers?.length || 0) - (a.influencers?.length || 0));
      default: return list;
    }
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-black">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading campaigns...</p>
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
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-300 dark:border-zinc-700 overflow-hidden">
              <button
                onClick={() => setView('cards')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'cards' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
              >
                Cards
              </button>
              <button
                onClick={() => setView('timeline')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'timeline' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
              >
                Timeline
              </button>
            </div>
            {/* Bulk select toggle */}
            {userRole !== 'EMPLOYEE' && (
            <button
              onClick={() => { setBulkMode(b => !b); setSelectedIds([]); }}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors border ${bulkMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
            >
              {bulkMode ? 'Cancel Select' : 'Select'}
            </button>
            )}
            {/* Export */}
            {userRole !== 'EMPLOYEE' && (
            <div className="relative group">
              <button
                className="px-4 py-2 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={() => handleExport(undefined, 'xlsx')}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 text-sm"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                  </svg>
                  Excel (.xlsx)
                </button>
                <button
                  onClick={() => handleExport(undefined, 'csv')}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 text-sm border-t border-gray-300 dark:border-zinc-700"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-8-6z" />
                  </svg>
                  CSV (.csv)
                </button>
                <button
                  onClick={() => handleExport(undefined, 'pdf')}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 text-sm border-t border-gray-300 dark:border-zinc-700"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-3 0-2-2zm13-5h-8v-2h8v2zm0-4h-8V7h8v2zM7 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                  PDF (.pdf)
                </button>
              </div>
            </div>
            )}
            {(userRole === 'ADMIN' || userRole === 'AGENCY') && (
            <button
              onClick={() => { setShowImportModal(true); setImportFile(null); setImportResult(null); }}
              className="px-4 py-2 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m4-8l-4-4m0 0L16 8m4-4v12" />
              </svg>
              Import
            </button>
            )}
            {(userRole === 'ADMIN' || userRole === 'AGENCY') && (
            <button
              onClick={() => {
                setEditingCampaign(null);
                setShowModal(true);
              }}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg font-semibold transition-colors shadow-sm"
            >
              + Create Campaign
            </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          {userRole === 'ADMIN' && (
            <div className="flex rounded-lg border border-gray-300 dark:border-zinc-700 overflow-hidden flex-shrink-0">
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-4 py-3 text-sm font-medium transition-colors ${statusFilter === 'active' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('completed')}
                className={`px-4 py-3 text-sm font-medium transition-colors ${statusFilter === 'completed' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
              >
                Completed
              </button>
            </div>
          )}
          <div className="relative flex-1">
            <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search campaigns by name or brand..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <select
            value={sortCampaigns}
            onChange={(e) => setSortCampaigns(e.target.value)}
            className="px-3 py-3 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-shrink-0"
          >
            <option value="default">Sort: Default</option>
            <option value="name_asc">Name A → Z</option>
            <option value="name_desc">Name Z → A</option>
            <option value="date_asc">Start Date ↑</option>
            <option value="date_desc">Start Date ↓</option>
            <option value="influencers_asc">Influencers ↑</option>
            <option value="influencers_desc">Influencers ↓</option>
          </select>
        </div>

        {view === 'cards' ? (
          <>
            {/* Bulk mode select all row */}
            {bulkMode && (
              <div className="mb-4 flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === sortedCampaigns.length && sortedCampaigns.length > 0}
                    onChange={() => {
                      if (selectedIds.length === sortedCampaigns.length) {
                        setSelectedIds([]);
                      } else {
                        setSelectedIds(sortedCampaigns.map(c => c.id));
                      }
                    }}
                    className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedIds.length === sortedCampaigns.length ? 'Deselect All' : 'Select All'}
                  </span>
                </label>
                {selectedIds.length > 0 && (
                  <span className="text-sm text-indigo-600 font-semibold">{selectedIds.length} selected</span>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className={`bg-white dark:bg-zinc-900 rounded-lg shadow-sm border p-6 hover:shadow-md transition-all relative ${
                    bulkMode
                      ? selectedIds.includes(campaign.id)
                        ? 'border-indigo-500 ring-2 ring-indigo-400'
                        : 'border-gray-200 dark:border-zinc-800 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-500'
                      : 'border-gray-200 dark:border-zinc-800 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-500'
                  }`}
                  onClick={() => {
                    if (bulkMode) {
                      setSelectedIds(prev =>
                        prev.includes(campaign.id)
                          ? prev.filter(id => id !== campaign.id)
                          : [...prev, campaign.id]
                      );
                    } else {
                      handleCampaignClick(campaign);
                    }
                  }}
                >
                  {/* Bulk checkbox overlay */}
                  {bulkMode && (
                    <div className="absolute top-3 left-3 z-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(campaign.id)}
                        onChange={() => {
                          setSelectedIds(prev =>
                            prev.includes(campaign.id)
                              ? prev.filter(id => id !== campaign.id)
                              : [...prev, campaign.id]
                          );
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{campaign.name}</h3>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {userRole !== 'ADMIN' && userRole !== 'EMPLOYEE' && campaign.campaignId && (
                        <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {(() => { const w = getDeadlineWarning(campaign.endDate, campaign.status); return w ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold text-white ${w.color}`}>{w.label}</span> : null; })()}
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(campaign.status)}`}>
                        {campaign.status}
                      </span>
                      {(userRole === 'ADMIN' || userRole === 'AGENCY') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReportCampaignId(campaign.id);
                          }}
                          title="View Report"
                          className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 font-medium mb-4">{campaign.brandName}</p>
                  {userRole === 'EMPLOYEE' && (() => {
                    const asgn = myAssignments.find(a => a.campaign?.id === campaign.id);
                    return asgn?.assignedBy ? (
                      <p className="text-xs text-indigo-400 dark:text-indigo-400 -mt-2 mb-3 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Assigned by {asgn.assignedBy.name}
                        {asgn.assignedBy.designation && <span className="text-gray-500 dark:text-zinc-500"> · {asgn.assignedBy.designation}</span>}
                      </p>
                    ) : null;
                  })()}
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
                    <div className="flex items-center pt-2 border-t border-gray-200 dark:border-zinc-800">
                      <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-semibold text-indigo-600">{campaign.influencers?.length || 0} Influencers</span>
                    </div>
                  </div>

                  {/* Status Stage Stepper */}
                  {(() => {
                    const stages = ['Draft', 'Upcoming', 'Active', 'Completed'];
                    const currentIndex = Math.max(0, stages.indexOf(campaign.status));
                    return (
                      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                        <div className="flex items-center">
                          {stages.map((stage, i) => (
                            <div key={stage} className="flex items-center flex-1 last:flex-none">
                              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${i <= currentIndex ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-zinc-600'}`} />
                              {i < stages.length - 1 && (
                                <div className={`flex-1 h-0.5 ${i < currentIndex ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-zinc-600'}`} />
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between mt-1.5">
                          {stages.map((stage, i) => (
                            <span key={stage} className={`text-xs ${i === currentIndex ? 'text-indigo-500 font-semibold' : 'text-gray-400 dark:text-zinc-500'}`}>
                              {stage}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>

            {sortedCampaigns.length === 0 && (
              <div className="text-center py-20 bg-gray-100 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 shadow-sm">
                <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="text-gray-400 text-lg">No campaigns found. Create your first campaign!</p>
              </div>
            )}
          </>
        ) : (
          <CampaignTimeline campaigns={sortedCampaigns} onCampaignClick={handleCampaignClick} />
        )}
      </div>

      {/* Floating bulk action bar */}
      {bulkMode && selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-4 min-w-max">
          <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full">
            {selectedIds.length} selected
          </span>
          <div className="relative group">
            <button
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
            <div className="absolute left-0 bottom-full mb-2 w-48 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => handleExport(selectedIds, 'xlsx')}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                </svg>
                Excel (.xlsx)
              </button>
              <button
                onClick={() => handleExport(selectedIds, 'csv')}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 text-sm border-t border-gray-300 dark:border-zinc-700"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-8-6z" />
                </svg>
                CSV (.csv)
              </button>
              <button
                onClick={() => handleExport(selectedIds, 'pdf')}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 text-sm border-t border-gray-300 dark:border-zinc-700"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-3 0-2-2zm13-5h-8v-2h8v2zm0-4h-8V7h8v2zM7 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
                PDF (.pdf)
              </button>
            </div>
          </div>
          {userRole === 'ADMIN' && (
            <button
              onClick={() => { fetchAgencyUsers(); setShowAssignModal(true); }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Assign Head
            </button>
          )}
          {userRole === 'ADMIN' && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkActionLoading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {bulkActionLoading ? 'Deleting...' : 'Delete'}
            </button>
          )}
          <button
            onClick={() => { setBulkMode(false); setSelectedIds([]); }}
            className="px-4 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

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

      {/* Import Campaign Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import Campaigns</h2>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Upload a CSV or Excel file with columns: <span className="font-medium text-gray-700 dark:text-gray-300">name, brandName, contact, contactDetails, campaignId, campaignPassword, internalCost, externalCost, startDate</span>. Optional: budget, status, endDate, brief.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select File</label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
                  className="w-full text-sm text-gray-600 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-900/30 file:text-indigo-600 dark:file:text-indigo-400 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/50 file:cursor-pointer"
                />
              </div>
              {importResult && (
                <div className={`p-3 rounded-lg text-sm ${importResult.imported > 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                  {importResult.imported > 0 && (
                    <p className="text-green-700 dark:text-green-400 font-medium">{importResult.imported} of {importResult.total} campaigns imported successfully.</p>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {importResult.errors.map((err, i) => (
                        <p key={i} className="text-red-600 dark:text-red-400 text-xs">
                          {err.row > 0 ? `Row ${err.row}: ` : ''}{err.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-zinc-700">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700"
              >
                {importResult && importResult.imported > 0 ? 'Done' : 'Cancel'}
              </button>
              <button
                onClick={handleImport}
                disabled={!importFile || importing}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {importing ? 'Importing...' : 'Upload & Import'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  className="w-full px-4 py-3 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="w-full px-4 py-3 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

      {/* Bulk Assign Head Modal */}
      {showAssignModal && (
        <div onClick={() => setShowAssignModal(false)} className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
          <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-200 dark:border-zinc-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Assign Head to Campaigns</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{selectedIds.length} campaign(s) selected</p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Head</label>
            <select
              value={bulkAssignHeadId}
              onChange={e => setBulkAssignHeadId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            >
              <option value="">Select a head...</option>
              {agencyUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name}{u.designation ? ` (${u.designation})` : ''}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={handleBulkAssign}
                disabled={!bulkAssignHeadId || bulkActionLoading}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors"
              >
                {bulkActionLoading ? 'Assigning...' : 'Assign'}
              </button>
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report (War Room) */}
      <CampaignWarRoom
        isOpen={!!reportCampaignId}
        onClose={() => setReportCampaignId(null)}
        campaignId={reportCampaignId || ''}
        onAccessDenied={handleAccessDenied}
        credentials={verifiedCredentials}
      />

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

// ── Campaign Timeline (Gantt) ─────────────────────────────────────────────────
function CampaignTimeline({ campaigns, onCampaignClick }: { campaigns: Campaign[]; onCampaignClick: (c: Campaign) => void }) {
  if (campaigns.length === 0) {
    return (
      <div className="text-center py-20 bg-gray-100 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800">
        <p className="text-gray-400 text-lg">No campaigns to display in timeline.</p>
      </div>
    );
  }

  const statusBarColor: Record<string, string> = {
    Active: 'bg-green-500',
    Completed: 'bg-zinc-400',
    Upcoming: 'bg-indigo-500',
    Draft: 'bg-purple-500',
  };

  const starts = campaigns.map(c => new Date(c.startDate).getTime());
  const ends = campaigns.map(c =>
    c.endDate ? new Date(c.endDate).getTime() : new Date(c.startDate).getTime() + 30 * 86400000
  );

  const rangeStart = new Date(Math.min(...starts));
  rangeStart.setDate(1); // Start of month
  const rangeEnd = new Date(Math.max(...ends));
  rangeEnd.setMonth(rangeEnd.getMonth() + 1);
  rangeEnd.setDate(0); // End of max month

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - rangeStart.getTime()) / totalMs) * 100));

  // Month labels
  const months: { label: string; left: number }[] = [];
  const cursor = new Date(rangeStart);
  cursor.setDate(1);
  while (cursor.getTime() <= rangeEnd.getTime()) {
    months.push({
      label: cursor.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
      left: pct(cursor.getTime()),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const todayPct = pct(Date.now());
  const todayInRange = todayPct > 0 && todayPct < 100;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden mb-6">
      {/* Month axis */}
      <div className="relative h-8 border-b border-gray-200 dark:border-zinc-800 flex">
        <div className="w-48 flex-shrink-0 border-r border-gray-200 dark:border-zinc-800" />
        <div className="flex-1 relative">
          {months.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 h-full flex items-center"
              style={{ left: `${m.left}%` }}
            >
              <span className="text-xs text-gray-400 dark:text-gray-500 pl-1 whitespace-nowrap">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign rows */}
      <div className="divide-y divide-gray-100 dark:divide-zinc-800">
        {campaigns.map((campaign) => {
          const startPct = pct(new Date(campaign.startDate).getTime());
          const endTime = campaign.endDate
            ? new Date(campaign.endDate).getTime()
            : new Date(campaign.startDate).getTime() + 30 * 86400000;
          const widthPct = Math.max(pct(endTime) - startPct, 0.5);
          const barColor = statusBarColor[campaign.status] || 'bg-indigo-500';

          return (
            <div
              key={campaign.id}
              className="flex items-center h-14 hover:bg-gray-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
              onClick={() => onCampaignClick(campaign)}
            >
              {/* Name label */}
              <div className="w-48 flex-shrink-0 px-4 border-r border-gray-100 dark:border-zinc-800 overflow-hidden">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{campaign.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{campaign.brandName}</p>
              </div>
              {/* Bar track */}
              <div className="flex-1 relative h-full flex items-center">
                {/* Month gridlines */}
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 w-px bg-gray-100 dark:bg-zinc-800"
                    style={{ left: `${m.left}%` }}
                  />
                ))}
                {/* Today marker */}
                {todayInRange && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
                    style={{ left: `${todayPct}%` }}
                  />
                )}
                {/* Bar */}
                <div
                  className={`absolute h-7 rounded-full ${barColor} opacity-90 hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden`}
                  style={{ left: `${startPct}%`, width: `${widthPct}%`, minWidth: '8px' }}
                  title={`${campaign.name} · ${campaign.status}`}
                >
                  <span className="text-white text-xs font-medium truncate whitespace-nowrap">{campaign.name}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-zinc-800 flex items-center gap-6 bg-gray-50 dark:bg-zinc-900/60">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-indigo-500" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Upcoming</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-zinc-400" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Completed</span>
        </div>
        {todayInRange && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-red-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Today</span>
          </div>
        )}
      </div>
    </div>
  );
}
