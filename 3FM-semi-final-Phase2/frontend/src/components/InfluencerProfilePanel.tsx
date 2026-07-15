import { useState, useEffect } from 'react';
import { API_URL } from '../config';

interface CommercialItem {
  platform: string;
  type: string;
  count: number;
  countUnit: string;
  monthAdRights: number;
}

interface ContactInfo {
  contactType: string;
  contactSubType?: string;
  contactValue: string;
}

interface CampaignEntry {
  id: string;
  liveLink?: string | null;
  liveDate?: string | null;
  brandApprovalStatus?: string | null;
  brandComment?: string | null;
  invoices?: any;
  createdAt?: string;
  campaign: {
    id: string;
    name: string;
    brandName: string;
    status: string;
    startDate: string;
    endDate?: string;
  };
}

interface InfluencerDetail {
  id: string;
  firstName: string;
  lastName: string;
  igLink: string;
  followers: number;
  followersUnit: string;
  avgViews: number | null;
  avgViewsUnit: string | null;
  primaryGenre: string;
  secondaryGenre?: string;
  city: string;
  state?: string;
  contact: ContactInfo | ContactInfo[];
  commercials: CommercialItem | CommercialItem[];
  gender: string;
  notes?: string;
  blacklisted?: boolean;
  blacklistReason?: string;
  rating?: number | null;
  campaigns?: CampaignEntry[];
}

interface Props {
  influencerId: string | null;
  onClose: () => void;
  onEdit?: (inf: InfluencerDetail) => void;
}

const statusColors: Record<string, string> = {
  Active: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  Completed: 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400',
  Upcoming: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
};

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function InfluencerProfilePanel({ influencerId, onClose, onEdit }: Props) {
  const [influencer, setInfluencer] = useState<InfluencerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBlacklistInput, setShowBlacklistInput] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState<'All' | 'Active' | 'Completed' | 'Upcoming'>('All');

  useEffect(() => {
    if (!influencerId) return;
    setLoading(true);
    setShowBlacklistInput(false);
    setBlacklistReason('');
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/influencers/${influencerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { setInfluencer(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [influencerId]);

  const patchMeta = async (patch: Record<string, any>) => {
    if (!influencer) return;
    setSavingMeta(true);
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/influencers/${influencer.id}/meta`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setInfluencer(prev => prev ? { ...prev, ...updated } : prev);
    }
    setSavingMeta(false);
  };

  const handleRating = (star: number) => {
    const newRating = influencer?.rating === star ? null : star;
    patchMeta({ rating: newRating });
  };

  const handleBlacklist = () => {
    if (influencer?.blacklisted) {
      patchMeta({ blacklisted: false, blacklistReason: null });
    } else {
      setShowBlacklistInput(true);
    }
  };

  const confirmBlacklist = () => {
    patchMeta({ blacklisted: true, blacklistReason: blacklistReason.trim() || null });
    setShowBlacklistInput(false);
    setBlacklistReason('');
  };

  if (!influencerId) return null;

  const contacts = influencer?.contact
    ? Array.isArray(influencer.contact) ? influencer.contact : [influencer.contact]
    : [];
  const commercials = influencer?.commercials
    ? Array.isArray(influencer.commercials) ? influencer.commercials : [influencer.commercials]
    : [];
  const campaigns = influencer?.campaigns || [];
  const filteredCampaigns = campaignFilter === 'All'
    ? campaigns
    : campaigns.filter((ce) => ce.campaign.status === campaignFilter);

  const userRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return null; } })();
  const canEdit = userRole === 'ADMIN' || userRole === 'AGENCY';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white dark:bg-zinc-950 border-l border-gray-200 dark:border-zinc-800 z-50 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Influencer Profile</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading || !influencer ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Blacklisted banner */}
            {influencer.blacklisted && (
              <div className="px-5 py-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524L13.477 14.89zm1.414-1.414L6.524 5.11A6 6 0 0114.89 13.476zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">Blacklisted</span>
                  {influencer.blacklistReason && (
                    <p className="text-xs text-red-600 dark:text-red-400 truncate">{influencer.blacklistReason}</p>
                  )}
                </div>
              </div>
            )}

            {/* Identity */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {influencer.firstName} {influencer.lastName}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{influencer.gender}</p>
                  {influencer.igLink && (
                    <a
                      href={influencer.igLink.startsWith('http') ? influencer.igLink : `https://instagram.com/${influencer.igLink.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-indigo-600 dark:text-indigo-400 text-sm hover:underline"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                      Instagram
                    </a>
                  )}
                  {/* Star rating */}
                  {canEdit && (
                    <div className="flex items-center gap-0.5 mt-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => handleRating(star)}
                          disabled={savingMeta}
                          className="p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
                          title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                        >
                          <svg className={`w-5 h-5 ${(influencer.rating ?? 0) >= star ? 'text-yellow-400' : 'text-gray-300 dark:text-zinc-600'}`} fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                          </svg>
                        </button>
                      ))}
                      {influencer.rating && (
                        <span className="text-xs text-gray-400 dark:text-zinc-500 ml-1">{influencer.rating}/5</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {formatFollowers(influencer.followers)}
                  </p>
                  <p className="text-xs text-gray-400">followers</p>
                  {influencer.avgViews && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      ~{formatFollowers(influencer.avgViews)} views
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Location</p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {influencer.city}{influencer.state ? `, ${influencer.state}` : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Genre</p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {influencer.primaryGenre}
                  {influencer.secondaryGenre && (
                    <span className="text-gray-400 dark:text-gray-500"> · {influencer.secondaryGenre}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Contact */}
            {contacts.length > 0 && (
              <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Contact</p>
                <div className="space-y-1.5">
                  {contacts.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 capitalize text-xs">
                        {c.contactSubType || c.contactType}
                      </span>
                      <span className="text-gray-700 dark:text-gray-300">{c.contactValue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {influencer.notes && influencer.notes.trim() && (
              <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Internal Notes</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{influencer.notes}</p>
              </div>
            )}

            {/* Commercial Rates */}
            {commercials.length > 0 && (
              <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Commercial Rates</p>
                <div className="space-y-2">
                  {commercials.map((c, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-zinc-900 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{c.platform} · {c.type}</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                          {c.count}{c.countUnit === 'Lacs (L)' ? 'L' : 'K'}
                        </span>
                      </div>
                      {c.monthAdRights > 0 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {c.monthAdRights}mo ad rights
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Collaboration History */}
            <div className="px-5 py-3">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                Collaboration History ({campaigns.length})
              </p>

              {/* Filter Tabs */}
              {campaigns.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {(['All', 'Active', 'Completed', 'Upcoming'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setCampaignFilter(tab)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        campaignFilter === tab
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {tab}
                      {tab !== 'All' && (
                        <span className="ml-1 opacity-70">
                          ({campaigns.filter((ce) => ce.campaign.status === tab).length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {filteredCampaigns.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {campaigns.length === 0 ? 'No campaigns yet' : `No ${campaignFilter.toLowerCase()} campaigns`}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredCampaigns.map((ce) => (
                    <div
                      key={ce.id || ce.campaign.id}
                      className="bg-gray-50 dark:bg-zinc-900 rounded-lg px-3 py-2.5 text-sm border border-gray-100 dark:border-zinc-800"
                    >
                      {/* Name + Status */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{ce.campaign.name}</p>
                        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[ce.campaign.status] || statusColors.Upcoming}`}>
                          {ce.campaign.status}
                        </span>
                      </div>
                      {/* Brand */}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{ce.campaign.brandName}</p>
                      {/* Dates */}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {new Date(ce.campaign.startDate).toLocaleDateString()}
                        {ce.campaign.endDate && ` → ${new Date(ce.campaign.endDate).toLocaleDateString()}`}
                        {ce.liveDate && (
                          <span className="ml-2 text-indigo-500 dark:text-indigo-400">
                            · Live: {new Date(ce.liveDate).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                      {/* Live Link */}
                      {ce.liveLink && (
                        <a
                          href={ce.liveLink.startsWith('http') ? ce.liveLink : `https://${ce.liveLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View Live Content
                        </a>
                      )}
                      {/* Brand Approval */}
                      {ce.brandApprovalStatus && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            ce.brandApprovalStatus === 'APPROVED'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : ce.brandApprovalStatus === 'REJECTED'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          }`}>
                            Brand: {ce.brandApprovalStatus}
                          </span>
                          {ce.brandComment && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 truncate" title={ce.brandComment}>
                              "{ce.brandComment}"
                            </span>
                          )}
                        </div>
                      )}
                      {/* Invoices */}
                      {Array.isArray(ce.invoices) && ce.invoices.length > 0 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {ce.invoices.length} invoice{ce.invoices.length > 1 ? 's' : ''} on record
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer actions */}
        {influencer && (
          <div className="px-5 py-4 border-t border-gray-200 dark:border-zinc-800 flex-shrink-0 bg-white dark:bg-zinc-950 space-y-2">
            {/* Blacklist controls (ADMIN/AGENCY only) */}
            {canEdit && (
              <>
                {showBlacklistInput ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={blacklistReason}
                      onChange={(e) => setBlacklistReason(e.target.value)}
                      placeholder="Reason for blacklisting (optional)"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-white placeholder-gray-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={confirmBlacklist}
                        disabled={savingMeta}
                        className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                      >
                        Confirm Blacklist
                      </button>
                      <button
                        onClick={() => { setShowBlacklistInput(false); setBlacklistReason(''); }}
                        className="px-3 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleBlacklist}
                    disabled={savingMeta}
                    className={`w-full px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ${
                      influencer.blacklisted
                        ? 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
                        : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800'
                    }`}
                  >
                    {influencer.blacklisted ? 'Remove from Blacklist' : 'Blacklist Influencer'}
                  </button>
                )}
              </>
            )}
            {onEdit && (
              <button
                onClick={() => { onEdit(influencer); onClose(); }}
                className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm transition-colors"
              >
                Edit Influencer
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
