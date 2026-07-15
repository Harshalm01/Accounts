import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';
import { fireCelebration } from '../utils/confetti';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  onAccessDenied?: () => void;
  credentials?: { campaignId: string; password: string };
}

interface CampaignInfluencer {
  influencer: {
    firstName: string;
    lastName: string;
    city: string;
  };
  internalCost: number;
  externalCost: number;
  brandApproval: string | null;
  liveLink: string | null;
}

interface StatusUpdate {
  id: string;
  note: string;
  createdAt: string;
  user: { name: string };
}

interface Assignment {
  status: string;
}

interface Campaign {
  id: string;
  name: string;
  brandName: string;
  status: string;
  budget: number;
  startDate: string;
  endDate: string;
  internalCost: number;
  externalCost: number;
  brief: string | null;
  influencers: CampaignInfluencer[];
  assignments: Assignment[];
  statusUpdates: StatusUpdate[];
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function CampaignWarRoom({ isOpen, onClose, campaignId, onAccessDenied, credentials }: Props) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: false });
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [exporting, setExporting] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const fetchCampaign = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      let url = `${API_URL}/api/campaigns/${campaignId}`;

      // If credentials are provided, add them as query parameters
      if (credentials && credentials.campaignId && credentials.password) {
        const params = new URLSearchParams({
          campaignId: credentials.campaignId,
          campaignPassword: credentials.password,
        });
        url += `?${params.toString()}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCampaign(data);
      } else if (res.status === 403) {
        console.error('Access denied - need to authenticate with password');
        if (onAccessDenied) {
          onAccessDenied();
        }
      } else {
        console.error(`Failed to load campaign: ${res.status} ${res.statusText}`);
      }
    } catch (error) {
      console.error('Campaign fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [campaignId, credentials, onAccessDenied]);

  const handleExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/campaigns/export?ids=${campaignId}&format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign_${campaignId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // Fetch campaign data when opened
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchCampaign();
  }, [isOpen, fetchCampaign]);

  // Animate in
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  // Live countdown timer
  useEffect(() => {
    if (!isOpen || !campaign?.endDate) return;
    const tick = () => {
      const now = Date.now();
      const end = new Date(campaign.endDate).getTime();
      const diff = end - now;
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: true });
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown({ days, hours, minutes, seconds, ended: false });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isOpen, campaign?.endDate]);

  // ESC key close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Real-time socket connection
  useEffect(() => {
    if (!isOpen || !campaignId) return;
    const socket = io(API_URL);

    // New status update
    const onStatusUpdate = (update: StatusUpdate) => {
      setCampaign((prev) => {
        if (!prev) return prev;
        return { ...prev, statusUpdates: [update, ...prev.statusUpdates] };
      });
      // Check for campaign completion
      if (update.note && /complet/i.test(update.note)) {
        fireCelebration('campaign-complete');
      }
    };
    socket.on(`campaign:status:${campaignId}`, onStatusUpdate);

    // Campaign updated
    const onCampaignUpdated = (updated: any) => {
      if (updated?.id === campaignId) {
        fetchCampaign();
      }
    };
    socket.on('campaign:updated', onCampaignUpdated);

    // Influencer events
    const onInfluencerEvent = (payload: any) => {
      if (payload?.campaign?.id === campaignId || payload?.campaignId === campaignId) {
        fetchCampaign();
      }
    };
    socket.on('campaign:influencer:added', onInfluencerEvent);
    socket.on('campaign:influencer:removed', onInfluencerEvent);
    socket.on('campaign:influencer:updated', onInfluencerEvent);

    return () => {
      socket.off(`campaign:status:${campaignId}`, onStatusUpdate);
      socket.off('campaign:updated', onCampaignUpdated);
      socket.off('campaign:influencer:added', onInfluencerEvent);
      socket.off('campaign:influencer:removed', onInfluencerEvent);
      socket.off('campaign:influencer:updated', onInfluencerEvent);
      socket.disconnect();
    };
  }, [isOpen, campaignId, fetchCampaign]);

  // Auto-scroll status feed to latest
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [campaign?.statusUpdates]);

  if (!isOpen) return null;

  // Derived data
  const influencers = campaign?.influencers || [];
  const assignments = campaign?.assignments || [];
  const statusUpdates = campaign?.statusUpdates || [];
  const totalCost = influencers.reduce((sum, ci) => sum + (ci.internalCost || 0), 0);
  const budget = campaign?.budget || 0;
  const budgetPercent = budget > 0 ? Math.min((totalCost / budget) * 100, 100) : 0;

  const approvedCount = influencers.filter((ci) => ci.brandApproval === 'APPROVED').length;
  const rejectedCount = influencers.filter((ci) => ci.brandApproval === 'REJECTED').length;
  const pendingInfluencerCount = influencers.length - approvedCount - rejectedCount;

  const acceptedAssignments = assignments.filter((a) => a.status === 'ACCEPTED').length;
  const rejectedAssignments = assignments.filter((a) => a.status === 'REJECTED').length;
  const pendingAssignments = assignments.length - acceptedAssignments - rejectedAssignments;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-500/20 text-green-400 border border-green-500/30';
      case 'Upcoming':
        return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
      case 'Completed':
        return 'bg-zinc-600/30 text-zinc-400 border border-zinc-600/40';
      default:
        return 'bg-zinc-600/30 text-zinc-400 border border-zinc-600/40';
    }
  };

  const approvalBadge = (approval: string | null) => {
    switch (approval) {
      case 'APPROVED':
        return 'bg-green-500/20 text-green-400';
      case 'REJECTED':
        return 'bg-red-500/20 text-red-400';
      case 'PENDING':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-zinc-700 text-zinc-400';
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[60] transition-all duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Main container */}
      <div
        className={`relative w-full h-full bg-zinc-950 overflow-y-auto transition-all duration-300 ${
          visible ? 'translate-y-0' : 'translate-y-4'
        }`}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4" />
              <p className="text-zinc-400 text-sm">Loading Report...</p>
            </div>
          </div>
        ) : !campaign ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-zinc-400 text-lg">Campaign not found</p>
              <button onClick={onClose} className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors">
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-[1600px] mx-auto p-6 space-y-6">
            {/* ===== HEADER ===== */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={onClose}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-zinc-400 text-sm">{campaign.brandName}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadge(campaign.status)}`}>
                      {campaign.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Export Buttons */}
                <button
                  onClick={() => handleExport('xlsx')}
                  disabled={exporting}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                  title="Export as Excel"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  disabled={exporting}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                  title="Export as CSV"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-8-6z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exporting}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                  title="Export as PDF"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-3 0-2-2zm13-5h-8v-2h8v2zm0-4h-8V7h8v2zM7 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                </button>
                <button
                  onClick={onClose}
                  className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Close (ESC)"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ===== TOP METRICS ROW ===== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Countdown Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Countdown</p>
                {countdown.ended ? (
                  <p className="text-lg font-bold text-zinc-400">Campaign Ended</p>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white tabular-nums">{countdown.days}</span>
                    <span className="text-xs text-zinc-500 mr-2">d</span>
                    <span className="text-3xl font-bold text-white tabular-nums">{String(countdown.hours).padStart(2, '0')}</span>
                    <span className="text-xs text-zinc-500 mr-2">h</span>
                    <span className="text-3xl font-bold text-white tabular-nums">{String(countdown.minutes).padStart(2, '0')}</span>
                    <span className="text-xs text-zinc-500 mr-2">m</span>
                    <span className="text-2xl font-bold text-indigo-400 tabular-nums">{String(countdown.seconds).padStart(2, '0')}</span>
                    <span className="text-xs text-zinc-500">s</span>
                  </div>
                )}
                <p className="text-xs text-zinc-600 mt-2">
                  {campaign.endDate
                    ? `Ends ${new Date(campaign.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'No end date set'}
                </p>
              </div>

              {/* Budget Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Budget</p>
                <p className="text-lg font-bold text-white">
                  {'\u20B9'}{totalCost.toLocaleString()}{' '}
                  <span className="text-zinc-500 font-normal text-sm">/ {'\u20B9'}{budget.toLocaleString()}</span>
                </p>
                <div className="mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      budgetPercent >= 90 ? 'bg-red-500' : budgetPercent >= 70 ? 'bg-yellow-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${budgetPercent}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-600 mt-2">{budgetPercent.toFixed(1)}% utilized</p>
              </div>

              {/* Influencers Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Influencers</p>
                <p className="text-3xl font-bold text-white">{influencers.length}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="flex items-center gap-1 text-xs">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-zinc-400">{approvedCount} approved</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    <span className="text-zinc-400">{pendingInfluencerCount} pending</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-zinc-400">{rejectedCount} rejected</span>
                  </span>
                </div>
              </div>

              {/* Assignments Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Assignments</p>
                <p className="text-3xl font-bold text-white">{assignments.length}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="flex items-center gap-1 text-xs">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-zinc-400">{acceptedAssignments} accepted</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    <span className="text-zinc-400">{pendingAssignments} pending</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-zinc-400">{rejectedAssignments} rejected</span>
                  </span>
                </div>
              </div>
            </div>

            {/* ===== MAIN GRID ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Influencer Roster (2/3 width) */}
              <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Influencer Roster</h2>
                  <span className="text-xs text-zinc-500">{influencers.length} total</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                        <th className="text-left px-5 py-3 font-medium">Name</th>
                        <th className="text-left px-5 py-3 font-medium">City</th>
                        <th className="text-left px-5 py-3 font-medium">Brand Approval</th>
                        <th className="text-left px-5 py-3 font-medium">Live Link</th>
                        <th className="text-right px-5 py-3 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {influencers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center text-zinc-600 text-sm">
                            No influencers assigned yet
                          </td>
                        </tr>
                      ) : (
                        influencers.map((ci, idx) => (
                          <tr key={idx} className="hover:bg-zinc-800/40 transition-colors">
                            <td className="px-5 py-3">
                              <span className="text-sm font-medium text-white">
                                {ci.influencer.firstName} {ci.influencer.lastName}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span className="text-sm text-zinc-400">{ci.influencer.city}</span>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${approvalBadge(ci.brandApproval)}`}>
                                {ci.brandApproval || 'N/A'}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              {ci.liveLink ? (
                                <a
                                  href={ci.liveLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-400 hover:text-indigo-300 text-sm underline underline-offset-2 truncate block max-w-[200px]"
                                >
                                  View Link
                                </a>
                              ) : (
                                <span className="text-zinc-600 text-sm">--</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-sm font-medium text-white tabular-nums">
                                {'\u20B9'}{(ci.internalCost || 0).toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Column: Live Status Updates */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col overflow-hidden" style={{ maxHeight: '520px' }}>
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Live Status Feed</h2>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                </div>
                <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {statusUpdates.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-zinc-600 text-sm text-center py-8">No status updates yet</p>
                    </div>
                  ) : (
                    [...statusUpdates].reverse().map((update) => (
                      <div key={update.id} className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-indigo-400">{update.user?.name || 'Unknown'}</span>
                          <span className="text-xs text-zinc-600">{relativeTime(update.createdAt)}</span>
                        </div>
                        <p className="text-sm text-zinc-300 leading-relaxed">{update.note}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ===== BOTTOM: CAMPAIGN BRIEF ===== */}
            {campaign.brief && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Campaign Brief</h2>
                  <button
                    onClick={() => setBriefExpanded(!briefExpanded)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    {briefExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                <p
                  className={`text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap transition-all duration-300 ${
                    briefExpanded ? '' : 'line-clamp-3'
                  }`}
                >
                  {campaign.brief}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
