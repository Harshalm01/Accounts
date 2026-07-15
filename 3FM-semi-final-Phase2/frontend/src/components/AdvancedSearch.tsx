import { useState, useCallback, useEffect } from 'react';
import { API_URL } from '../config';

interface SearchFilters {
  query: string;
  entityType: 'campaign' | 'influencer' | 'brand' | '';
  status?: 'Active' | 'Upcoming' | 'Completed' | '';
  budgetMin?: number;
  budgetMax?: number;
  genre?: string;
  tier?: 'Nano' | 'Micro' | 'Mid-tier' | 'Macro' | '';
}

interface SearchResult {
  id: string;
  type: 'campaign' | 'influencer' | 'brand';
  label: string;
  sub: string;
  path: string;
  metadata?: Record<string, any>;
}

export default function AdvancedSearch({ onClose }: { onClose: () => void }) {
  const [filters, setFilters] = useState<SearchFilters>({ query: '', entityType: '', status: '' });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const limit = 20;

  const performSearch = useCallback(async (newFilters: SearchFilters, newPage: number = 1) => {
    if (newFilters.query.trim().length < 2 && !newFilters.entityType) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();

      if (newFilters.query.trim()) params.append('q', newFilters.query.trim());
      if (newFilters.entityType) params.append('type', newFilters.entityType);
      if (newFilters.status) params.append('status', newFilters.status);
      if (newFilters.budgetMin) params.append('budgetMin', String(newFilters.budgetMin));
      if (newFilters.budgetMax) params.append('budgetMax', String(newFilters.budgetMax));
      if (newFilters.genre) params.append('genre', newFilters.genre);
      if (newFilters.tier) params.append('tier', newFilters.tier);
      params.append('page', String(newPage));
      params.append('limit', String(limit));

      // Use the regular search endpoint and filter client-side for now
      // In a full implementation, these filters would be backend endpoints
      const res = await fetch(`${API_URL}/api/search?${new URLSearchParams({ q: newFilters.query.trim() || '*' })}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const filtered = filterResults(data, newFilters);
        setResults(filtered.slice((newPage - 1) * limit, newPage * limit));
        setTotalPages(Math.ceil(filtered.length / limit));
        setPage(newPage);
      }
    } catch (err) {
      console.error('Advanced search error:', err);
    } finally {
      setSearching(false);
    }
  }, []);

  const filterResults = (data: any, f: SearchFilters): SearchResult[] => {
    const results: SearchResult[] = [];

    // Filter campaigns
    if (!f.entityType || f.entityType === 'campaign') {
      for (const c of data.campaigns || []) {
        if (f.status && c.status !== f.status) continue;
        if (f.budgetMin && (c.budget || 0) < f.budgetMin) continue;
        if (f.budgetMax && (c.budget || 0) > f.budgetMax) continue;
        results.push({
          id: c.id,
          type: 'campaign',
          label: c.name,
          sub: `${c.brandName || ''} • ${c.status}`,
          path: '/campaign',
          metadata: c,
        });
      }
    }

    // Filter influencers
    if (!f.entityType || f.entityType === 'influencer') {
      for (const inf of data.influencers || []) {
        if (f.genre && inf.primaryGenre !== f.genre) continue;
        results.push({
          id: inf.id,
          type: 'influencer',
          label: `${inf.firstName} ${inf.lastName}`.trim(),
          sub: inf.igLink || inf.primaryGenre || '',
          path: '/influencers',
          metadata: inf,
        });
      }
    }

    // Filter brands
    if (!f.entityType || f.entityType === 'brand') {
      for (const b of data.brands || []) {
        results.push({
          id: b.id,
          type: 'brand',
          label: b.name,
          sub: '',
          path: '/brands',
          metadata: b,
        });
      }
    }

    return results;
  };

  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    performSearch(newFilters, 1);
  };

  const handleSearch = () => {
    performSearch(filters, 1);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-8 py-6 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Advanced Search</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Filter by type, status, budget, and more</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-8 space-y-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Query */}
            <div className="lg:col-span-3">
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Search Query
              </label>
              <input
                type="text"
                value={filters.query}
                onChange={(e) => handleFilterChange('query', e.target.value)}
                placeholder="Search across all entities..."
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Entity Type */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Type
              </label>
              <select
                value={filters.entityType}
                onChange={(e) => handleFilterChange('entityType', e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Types</option>
                <option value="campaign">Campaign</option>
                <option value="influencer">Influencer</option>
                <option value="brand">Brand</option>
              </select>
            </div>

            {/* Status (for campaigns) */}
            {(!filters.entityType || filters.entityType === 'campaign') && (
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Status
                </label>
                <select
                  value={filters.status || ''}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Upcoming">Upcoming</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            )}

            {/* Budget Min */}
            {(!filters.entityType || filters.entityType === 'campaign') && (
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Min Budget
                </label>
                <input
                  type="number"
                  value={filters.budgetMin || ''}
                  onChange={(e) => handleFilterChange('budgetMin', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Min..."
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Budget Max */}
            {(!filters.entityType || filters.entityType === 'campaign') && (
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Max Budget
                </label>
                <input
                  type="number"
                  value={filters.budgetMax || ''}
                  onChange={(e) => handleFilterChange('budgetMax', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Max..."
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Genre (for influencers) */}
            {(!filters.entityType || filters.entityType === 'influencer') && (
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Genre
                </label>
                <input
                  type="text"
                  value={filters.genre || ''}
                  onChange={(e) => handleFilterChange('genre', e.target.value)}
                  placeholder="e.g., Fashion, Tech..."
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>

          {/* Search Button */}
          <div className="flex gap-3">
            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex-1 px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              {searching ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Close
            </button>
          </div>

          {/* Results */}
          <div className="mt-8">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Results {results.length > 0 && `(${results.length})`}
            </h3>

            {results.length === 0 && !searching && (
              <div className="text-center py-8 text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">No results found. Try adjusting your filters.</p>
              </div>
            )}

            <div className="space-y-3">
              {results.map((result) => (
                <a
                  key={`${result.type}-${result.id}`}
                  href={result.path}
                  className="block p-4 border border-gray-200 dark:border-zinc-800 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{result.label}</p>
                      {result.sub && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{result.sub}</p>}
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {result.type === 'campaign' ? 'Campaign' : result.type === 'influencer' ? 'Influencer' : 'Brand'}
                    </span>
                  </div>
                </a>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => performSearch(filters, Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => performSearch(filters, Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
