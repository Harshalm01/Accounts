import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';
import { Loading3DCube, Empty3DState } from './Loading3D';
import ConfirmModal from './ConfirmModal';

interface AccountEntry {
  id: string;
  influencer: { id: string; firstName: string; lastName: string; igLink: string; primaryGenre: string };
  campaign: { id: string; name: string; brandName: string };
  internalCost: number;
  invoiceFile: string | null;
  invoiceOriginalName: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes: string | null;
  addedBy: { id: string; name: string | null; designation: string | null };
  reviewedBy: { id: string; name: string | null } | null;
  reviewedAt: string | null;
  createdAt: string;
}

type FilterTab = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

interface FinanceRequest {
  id: string;
  message: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  sentBy: { id: string; name: string | null };
  sentTo: { id: string; name: string | null; designation: string | null };
  respondedAt: string | null;
  createdAt: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function AccountsDashboard() {
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Credits management state (finance only)
  const [heads, setHeads] = useState<{id: string; name: string | null; designation: string | null; credits: number; email: string | null}[]>([]);
  const [editingCredits, setEditingCredits] = useState<string | null>(null);
  const [creditsInput, setCreditsInput] = useState('');
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [showCreditsPanel, setShowCreditsPanel] = useState(false);

  // Finance requests state
  const [financeRequests, setFinanceRequests] = useState<FinanceRequest[]>([]);
  const [showRequestModal, setShowRequestModal] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestSending, setRequestSending] = useState(false);
  const [showRequestsPanel, setShowRequestsPanel] = useState(false);
  const [selectedHead, setSelectedHead] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const canApprove = user?.canApprovePayments || user?.role === 'ADMIN';
  const hasAccess = user?.canAccessAccounts || user?.role === 'ADMIN';

  const fetchEntries = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const params = new URLSearchParams();
    if (activeTab !== 'ALL') params.set('status', activeTab);
    if (search.trim()) params.set('search', search.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';
    fetch(`${API_URL}/api/accounts${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setEntries(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTab, search]);

  const fetchHeads = useCallback(() => {
    if (!canApprove) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_URL}/api/accounts/heads`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setHeads(data); })
      .catch(() => {});
  }, [canApprove]);

  const fetchFinanceRequests = useCallback(() => {
    if (!hasAccess) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_URL}/api/accounts/finance-requests`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setFinanceRequests(data); })
      .catch(() => {});
  }, [hasAccess]);

  useEffect(() => { fetchEntries(); fetchHeads(); fetchFinanceRequests(); }, [fetchEntries, fetchHeads, fetchFinanceRequests]);

  // Keep refs to latest fetch functions so socket effect doesn't re-run
  const fetchEntriesRef = useRef(fetchEntries);
  const fetchHeadsRef = useRef(fetchHeads);
  const fetchFinanceRequestsRef = useRef(fetchFinanceRequests);
  useEffect(() => { fetchEntriesRef.current = fetchEntries; }, [fetchEntries]);
  useEffect(() => { fetchHeadsRef.current = fetchHeads; }, [fetchHeads]);
  useEffect(() => { fetchFinanceRequestsRef.current = fetchFinanceRequests; }, [fetchFinanceRequests]);

  // Real-time updates — stable effect, no reconnects on tab/search change
  useEffect(() => {
    const socket = io(API_URL);
    const u = localStorage.getItem('user');
    const userId = u ? JSON.parse(u).id : null;
    if (userId) {
      socket.emit('join', userId);
      socket.on('account:entries:added', () => fetchEntriesRef.current());
      socket.on('account:entry:updated', () => fetchEntriesRef.current());
      socket.on('account:entry:deleted', (payload: { id: string }) => {
        setEntries((prev) => prev.filter((e) => e.id !== payload.id));
      });
      socket.on('credits:updated', () => fetchHeadsRef.current());
      socket.on('finance:request:new', () => fetchFinanceRequestsRef.current());
      socket.on('finance:request:responded', () => fetchFinanceRequestsRef.current());
    }
    return () => { socket.disconnect(); };
  }, []);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/accounts/${id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchEntries();
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/accounts/${id}/reject`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchEntries();
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleSaveNotes = async (id: string) => {
    setActionLoading(id);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/accounts/${id}/notes`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesInput }),
      });
      setEditingNotes(null);
      fetchEntries();
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Account Entry',
      message: 'This account entry will be permanently deleted. This action cannot be undone.',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        setActionLoading(id);
        try {
          const token = localStorage.getItem('token');
          await fetch(`${API_URL}/api/accounts/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          fetchEntries();
        } catch { /* ignore */ }
        setActionLoading(null);
      },
    });
  };

  const handleUpdateCredits = async (headId: string) => {
    const newCredits = parseFloat(creditsInput);
    if (isNaN(newCredits)) return;
    setCreditsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/accounts/heads/${headId}/credits`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: newCredits }),
      });
      if (res.ok) {
        setEditingCredits(null);
        fetchHeads();
      }
    } catch { /* ignore */ }
    setCreditsLoading(false);
  };

  const handleSendRequest = async (headId: string) => {
    if (!requestMessage.trim()) return;
    setRequestSending(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/accounts/finance-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ headId, message: requestMessage.trim() }),
      });
      if (res.ok) {
        setShowRequestModal(null);
        setRequestMessage('');
        fetchFinanceRequests();
      }
    } catch { /* ignore */ }
    setRequestSending(false);
  };

  const handleRespondRequest = async (requestId: string, status: 'ACCEPTED' | 'REJECTED') => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/accounts/finance-requests/${requestId}/respond`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchFinanceRequests();
    } catch { /* ignore */ }
  };

  if (!hasAccess) {
    return (
      <div className="bg-gray-50 dark:bg-black min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="w-16 h-16 text-gray-300 dark:text-zinc-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">Access Denied</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">You don't have permission to view Accounts.</p>
        </div>
      </div>
    );
  }

  // Group entries by head for finance/admin view
  const headGroups = canApprove ? (() => {
    const groups: Record<string, { id: string; name: string | null; designation: string | null; totalCost: number; pending: number; approved: number; rejected: number; total: number }> = {};
    entries.forEach((e) => {
      if (!groups[e.addedBy.id]) {
        groups[e.addedBy.id] = { id: e.addedBy.id, name: e.addedBy.name, designation: e.addedBy.designation, totalCost: 0, pending: 0, approved: 0, rejected: 0, total: 0 };
      }
      const g = groups[e.addedBy.id];
      g.total++;
      g.totalCost += e.internalCost;
      if (e.status === 'PENDING') g.pending++;
      else if (e.status === 'APPROVED') g.approved++;
      else g.rejected++;
    });
    return Object.values(groups).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  })() : [];

  // Filter entries when a head is selected (finance/admin drilldown)
  const displayEntries = canApprove && selectedHead ? entries.filter((e) => e.addedBy.id === selectedHead) : entries;

  // Compute stats from display entries
  const totalCost = displayEntries.reduce((s, e) => s + e.internalCost, 0);
  const pendingCount = displayEntries.filter((e) => e.status === 'PENDING').length;
  const approvedCount = displayEntries.filter((e) => e.status === 'APPROVED').length;
  const rejectedCount = displayEntries.filter((e) => e.status === 'REJECTED').length;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: displayEntries.length },
    { key: 'PENDING', label: 'Pending', count: pendingCount },
    { key: 'APPROVED', label: 'Approved', count: approvedCount },
    { key: 'REJECTED', label: 'Rejected', count: rejectedCount },
  ];

  return (
    <div className="bg-gray-50 dark:bg-black min-h-screen">
      {/* Header */}
      <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800 px-4 md:px-8 py-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">Accounts</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage influencer payment approvals</p>
          </div>
          {/* Search */}
          <div className="relative md:w-72">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search influencer or campaign..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Total Entries</p>
            <p className="text-2xl font-bold text-gray-800 dark:text-white mt-1">{displayEntries.length}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Total Cost</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">₹{totalCost.toLocaleString()}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Pending</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{pendingCount}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Approved</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{approvedCount}</p>
          </div>
          {/* Head's own credits card */}
          {!canApprove && user?.role === 'AGENCY' && (
            <div className="bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-4 col-span-2 md:col-span-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Your Credits</p>
              <p className={`text-2xl font-bold mt-1 ${(user.credits ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                ₹{(user.credits ?? 0).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* Credits Management Panel — finance/admin only */}
        {canApprove && (
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <button
              onClick={() => { setShowCreditsPanel(!showCreditsPanel); if (!showCreditsPanel) fetchHeads(); }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold text-gray-800 dark:text-white">Head Credits</span>
                <span className="text-xs bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                  {heads.length}
                </span>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showCreditsPanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showCreditsPanel && (
              <div className="border-t border-gray-200 dark:border-zinc-800">
                {heads.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 px-4">No heads found</p>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                    {heads.map((head) => (
                      <div key={head.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {head.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{head.name || 'Unknown'}</p>
                            {head.designation && <p className="text-xs text-gray-400">{head.designation}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {editingCredits === head.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                value={creditsInput}
                                onChange={(e) => setCreditsInput(e.target.value)}
                                className="w-28 px-2 py-1 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateCredits(head.id);
                                  if (e.key === 'Escape') setEditingCredits(null);
                                }}
                              />
                              <button
                                onClick={() => handleUpdateCredits(head.id)}
                                disabled={creditsLoading}
                                className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingCredits(null)}
                                className="px-2 py-1 text-gray-400 hover:text-gray-600 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingCredits(head.id); setCreditsInput(String(head.credits)); }}
                              className={`text-sm font-semibold px-3 py-1 rounded-lg transition-colors ${
                                head.credits < 0
                                  ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                  : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                              }`}
                            >
                              ₹{head.credits.toLocaleString()}
                            </button>
                          )}
                          <button
                            onClick={() => { setShowRequestModal(head.id); setRequestMessage(''); }}
                            className="p-1.5 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors"
                            title="Send Request"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sent Finance Requests — finance/admin only */}
        {canApprove && (
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowRequestsPanel(!showRequestsPanel)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-semibold text-gray-800 dark:text-white">Sent Requests</span>
                {financeRequests.filter(r => r.status === 'PENDING').length > 0 && (
                  <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-semibold">
                    {financeRequests.filter(r => r.status === 'PENDING').length} pending
                  </span>
                )}
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showRequestsPanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showRequestsPanel && (
              <div className="border-t border-gray-200 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800">
                {financeRequests.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 px-4">No requests sent yet</p>
                ) : (
                  financeRequests.map((req) => (
                    <div key={req.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{req.sentTo.name}</span>
                          <RequestBadge status={req.status} />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{req.message}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(req.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Incoming Finance Requests — heads only */}
        {!canApprove && user?.role === 'AGENCY' && financeRequests.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-indigo-100 dark:border-indigo-800/30">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-semibold text-gray-800 dark:text-white">Finance Requests</span>
                {financeRequests.filter(r => r.status === 'PENDING').length > 0 && (
                  <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold">
                    {financeRequests.filter(r => r.status === 'PENDING').length} new
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {financeRequests.map((req) => (
                <div key={req.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">From {req.sentBy.name || 'Finance'}</span>
                        <span className="text-[10px] text-gray-400">{formatDate(req.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{req.message}</p>
                    </div>
                    {req.status === 'PENDING' ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleRespondRequest(req.id, 'ACCEPTED')}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleRespondRequest(req.id, 'REJECTED')}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <RequestBadge status={req.status} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back to Heads button — when viewing a specific head's entries */}
        {canApprove && selectedHead && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedHead(null); setActiveTab('ALL'); }}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              All Heads
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                {headGroups.find(h => h.id === selectedHead)?.name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">{headGroups.find(h => h.id === selectedHead)?.name || 'Unknown'}</p>
                {headGroups.find(h => h.id === selectedHead)?.designation && (
                  <p className="text-xs text-gray-400">{headGroups.find(h => h.id === selectedHead)?.designation}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Heads Grid — finance/admin view when no head is selected */}
        {canApprove && !selectedHead && !loading && (
          <>
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Heads ({headGroups.length})</h2>
              {headGroups.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No entries found</p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Entries will appear here once heads add influencers to accounts.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {headGroups.map((head) => (
                    <div key={head.id} className="perspective-800">
                      <button
                        onClick={() => setSelectedHead(head.id)}
                        className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 text-left hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-lg transition-all group preserve-3d"
                        style={{ transition: 'transform 0.15s ease-out, box-shadow 0.3s ease, border-color 0.3s ease' }}
                        onMouseMove={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const y = e.clientY - rect.top;
                          const centerX = rect.width / 2;
                          const centerY = rect.height / 2;
                          const rotateX = ((y - centerY) / centerY) * -8;
                          const rotateY = ((x - centerX) / centerX) * 8;
                          e.currentTarget.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)';
                        }}
                      >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 group-hover:bg-indigo-500 transition-colors">
                          {head.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{head.name || 'Unknown'}</p>
                          {head.designation && <p className="text-xs text-gray-400 truncate">{head.designation}</p>}
                        </div>
                        <svg className="w-4 h-4 text-gray-300 dark:text-zinc-600 ml-auto flex-shrink-0 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-lg py-1.5">
                          <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{head.pending}</p>
                          <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 font-medium">Pending</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/10 rounded-lg py-1.5">
                          <p className="text-lg font-bold text-green-600 dark:text-green-400">{head.approved}</p>
                          <p className="text-[10px] text-green-600/70 dark:text-green-400/70 font-medium">Approved</p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/10 rounded-lg py-1.5">
                          <p className="text-lg font-bold text-red-600 dark:text-red-400">{head.rejected}</p>
                          <p className="text-[10px] text-red-600/70 dark:text-red-400/70 font-medium">Rejected</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{head.total} entries</span>
                        <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">₹{head.totalCost.toLocaleString()}</span>
                      </div>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Filter tabs — show when not in heads grid view */}
        {(!canApprove || selectedHead) && (
        <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        )}

        {/* Table — show when not in heads grid view */}
        {(!canApprove || selectedHead) && (loading ? (
          <div className="flex items-center justify-center py-20">
            <Loading3DCube size={36} color="bg-indigo-500" label="Loading entries..." />
          </div>
        ) : displayEntries.length === 0 ? (
          <Empty3DState
            title="No entries found"
            subtitle={search ? 'Try a different search term.' : 'Entries will appear here once influencers are added from campaigns.'}
            icon={
              <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-200 dark:border-zinc-800">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Influencer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Campaign</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Internal Cost</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Added By</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Invoice</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {displayEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {entry.influencer.firstName} {entry.influencer.lastName}
                          </p>
                          <p className="text-xs text-gray-400">{entry.influencer.primaryGenre}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-gray-800 dark:text-gray-200">{entry.campaign.name}</p>
                          <p className="text-xs text-gray-400">{entry.campaign.brandName}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">₹{entry.internalCost.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                            {entry.addedBy.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <span className="text-sm text-gray-600 dark:text-gray-300">{entry.addedBy.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400">{formatDate(entry.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {entry.invoiceFile ? (
                          <a
                            href={`${API_URL}/uploads/invoices/${entry.invoiceFile}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-medium"
                            title={entry.invoiceOriginalName || 'Download Invoice'}
                          >
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="truncate max-w-[120px]">
                              {entry.invoiceOriginalName || 'Invoice'}
                            </span>
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No invoice</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={entry.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {canApprove && entry.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleApprove(entry.id)}
                                disabled={actionLoading === entry.id}
                                className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors disabled:opacity-50"
                                title="Approve"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleReject(entry.id)}
                                disabled={actionLoading === entry.id}
                                className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
                                title="Reject"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </>
                          )}
                          {canApprove && (
                            <button
                              onClick={() => {
                                setEditingNotes(editingNotes === entry.id ? null : entry.id);
                                setNotesInput(entry.notes || '');
                              }}
                              className={`p-1.5 rounded-md transition-colors ${
                                entry.notes
                                  ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                              }`}
                              title={entry.notes ? 'Edit Notes' : 'Add Notes'}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {(canApprove || (entry.addedBy.id === user?.id && entry.status === 'PENDING')) && (
                            <button
                              onClick={() => handleDelete(entry.id)}
                              disabled={actionLoading === entry.id}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {/* Notes section */}
                        {entry.notes && editingNotes !== entry.id && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic text-right max-w-[200px] ml-auto truncate" title={entry.notes}>
                            {entry.notes}
                          </p>
                        )}
                        {editingNotes === entry.id && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={notesInput}
                              onChange={(e) => setNotesInput(e.target.value)}
                              placeholder="Add a note..."
                              className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNotes(entry.id); if (e.key === 'Escape') setEditingNotes(null); }}
                            />
                            <button
                              onClick={() => handleSaveNotes(entry.id)}
                              disabled={actionLoading === entry.id}
                              className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        )}
                        {entry.reviewedBy && (
                          <p className="text-[10px] text-gray-400 mt-1 text-right">
                            {entry.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {entry.reviewedBy.name}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {displayEntries.map((entry) => (
                <div key={entry.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {entry.influencer.firstName} {entry.influencer.lastName}
                      </p>
                      <p className="text-xs text-gray-400">{entry.influencer.primaryGenre}</p>
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{entry.campaign.name}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">₹{entry.internalCost.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>By {entry.addedBy.name || 'Unknown'}</span>
                    <span>{formatDate(entry.createdAt)}</span>
                  </div>
                  {entry.invoiceFile && (
                    <a
                      href={`${API_URL}/uploads/invoices/${entry.invoiceFile}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-medium"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {entry.invoiceOriginalName || 'Invoice'}
                    </a>
                  )}
                  {entry.notes && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-zinc-800 px-3 py-2 rounded-lg">{entry.notes}</p>
                  )}
                  {entry.reviewedBy && (
                    <p className="text-[10px] text-gray-400">
                      {entry.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {entry.reviewedBy.name}
                    </p>
                  )}
                  {/* Mobile actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                    {canApprove && entry.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleApprove(entry.id)}
                          disabled={actionLoading === entry.id}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(entry.id)}
                          disabled={actionLoading === entry.id}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Reject
                        </button>
                      </>
                    )}
                    {canApprove && (
                      <button
                        onClick={() => {
                          setEditingNotes(editingNotes === entry.id ? null : entry.id);
                          setNotesInput(entry.notes || '');
                        }}
                        className={`p-1.5 rounded-md transition-colors ${
                          entry.notes
                            ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                        }`}
                        title="Notes"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    {(canApprove || (entry.addedBy.id === user?.id && entry.status === 'PENDING')) && (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={actionLoading === entry.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-md transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {editingNotes === entry.id && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={notesInput}
                        onChange={(e) => setNotesInput(e.target.value)}
                        placeholder="Add a note..."
                        className="flex-1 px-2 py-1.5 text-xs bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNotes(entry.id); if (e.key === 'Escape') setEditingNotes(null); }}
                      />
                      <button
                        onClick={() => handleSaveNotes(entry.id)}
                        disabled={actionLoading === entry.id}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ))}
      </div>
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowRequestModal(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700 p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">Send Request</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              To: {heads.find(h => h.id === showRequestModal)?.name || 'Unknown'}
            </p>
            <textarea
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
              placeholder="Enter your message / notes..."
              rows={4}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowRequestModal(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSendRequest(showRequestModal)}
                disabled={!requestMessage.trim() || requestSending}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors"
              >
                {requestSending ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
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

function StatusBadge({ status }: { status: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
  const config = {
    PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${config[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function RequestBadge({ status }: { status: 'PENDING' | 'ACCEPTED' | 'REJECTED' }) {
  const config = {
    PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${config[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
