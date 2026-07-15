import React from 'react';

interface Commercial {
  count?: number;
  unit?: string;
  type?: string;
  [key: string]: any;
}

interface InfluencerForCompare {
  id: string;
  firstName: string;
  lastName: string;
  followers: number;
  followersUnit?: string;
  commercials?: Commercial[] | any;
  primaryGenre: string;
  secondaryGenre?: string | null;
  rating?: number | null;
  city: string;
  state?: string | null;
  gender: string;
  _count?: { campaigns: number };
}

interface CompareModalProps {
  influencers: InfluencerForCompare[];
  onClose: () => void;
  onRemove: (id: string) => void;
}

function formatFollowers(n: number, unit?: string): string {
  if (unit && unit !== '') return `${n}${unit}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getBaseRate(commercials: Commercial[] | any): string {
  if (!commercials) return '—';
  let arr: Commercial[] = [];
  if (Array.isArray(commercials)) arr = commercials;
  else if (typeof commercials === 'object') arr = Object.values(commercials);
  if (arr.length === 0) return '—';
  const first = arr[0];
  if (first?.count) return `₹${Number(first.count).toLocaleString()}`;
  const val = Object.values(first || {})[0];
  if (val) return `₹${Number(val).toLocaleString()}`;
  return '—';
}

function StarRating({ rating }: { rating?: number | null }) {
  if (!rating) return <span className="text-gray-400 dark:text-gray-500 text-xs">Not rated</span>;
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          className={`w-3.5 h-3.5 ${s <= rating ? 'text-yellow-400' : 'text-gray-300 dark:text-zinc-600'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

const ROWS = [
  { label: 'Followers', key: 'followers' as const },
  { label: 'Base Rate', key: 'rate' as const },
  { label: 'Primary Genre', key: 'primaryGenre' as const },
  { label: 'Secondary Genre', key: 'secondaryGenre' as const },
  { label: 'Rating', key: 'rating' as const },
  { label: 'Location', key: 'location' as const },
  { label: 'Gender', key: 'gender' as const },
  { label: 'Campaigns', key: 'campaigns' as const },
];

export default function CompareModal({ influencers, onClose, onRemove }: CompareModalProps) {
  // Find best follower count index for highlighting
  const followerValues = influencers.map((inf) => inf.followers);
  const maxFollowers = Math.max(...followerValues);
  const campaignValues = influencers.map((inf) => inf._count?.campaigns ?? 0);
  const maxCampaigns = Math.max(...campaignValues);

  function getCellValue(inf: InfluencerForCompare, key: string): React.ReactNode {
    switch (key) {
      case 'followers':
        return formatFollowers(inf.followers, inf.followersUnit);
      case 'rate':
        return getBaseRate(inf.commercials);
      case 'primaryGenre':
        return inf.primaryGenre || '—';
      case 'secondaryGenre':
        return inf.secondaryGenre || '—';
      case 'rating':
        return <StarRating rating={inf.rating} />;
      case 'location':
        return [inf.city, inf.state].filter(Boolean).join(', ') || '—';
      case 'gender':
        return inf.gender || '—';
      case 'campaigns':
        return inf._count?.campaigns ?? '—';
      default:
        return '—';
    }
  }

  function isBest(inf: InfluencerForCompare, key: string): boolean {
    if (influencers.length < 2) return false;
    if (key === 'followers') return inf.followers === maxFollowers;
    if (key === 'campaigns') return (inf._count?.campaigns ?? 0) === maxCampaigns && maxCampaigns > 0;
    if (key === 'rating') {
      const maxRating = Math.max(...influencers.map((i) => i.rating ?? 0));
      return (inf.rating ?? 0) === maxRating && maxRating > 0;
    }
    return false;
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Compare Influencers</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-zinc-800/60">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-32">
                  Attribute
                </th>
                {influencers.map((inf) => (
                  <th key={inf.id} className="px-4 py-3 text-center min-w-[180px]">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {inf.firstName} {inf.lastName}
                      </span>
                      <button
                        onClick={() => onRemove(inf.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        title="Remove from comparison"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
              {ROWS.map((row) => (
                <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors">
                  <td className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {row.label}
                  </td>
                  {influencers.map((inf) => {
                    const best = isBest(inf, row.key);
                    return (
                      <td
                        key={inf.id}
                        className={`px-4 py-3 text-center text-sm font-medium transition-colors ${
                          best
                            ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                            : 'text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {getCellValue(inf, row.key)}
                        {best && (
                          <span className="ml-1.5 text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full">
                            Best
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
