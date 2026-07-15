import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import AdvancedSearch from './AdvancedSearch';

interface GlobalSearchModalProps {
  onClose: () => void;
}

interface SearchResults {
  influencers: Array<{ id: string; firstName: string; lastName: string; igLink: string; primaryGenre: string | null }>;
  campaigns: Array<{ id: string; name: string; brandName: string | null; status: string }>;
  brands: Array<{ id: string; name: string }>;
  invoices: Array<{ id: string; originalName: string; invoiceNumber: string | null; folder: string; type: string; status: string }>;
}

interface TrendingResults {
  campaigns: Array<{ id: string; name: string; brandName: string | null; status: string }>;
  influencers: Array<{ id: string; firstName: string; lastName: string; igLink: string; primaryGenre: string | null }>;
  brands: Array<{ id: string; name: string }>;
}

interface SearchHistoryItem {
  type: 'influencer' | 'campaign' | 'brand' | 'invoice';
  id: string;
  label: string;
  sub: string;
  path: string;
  timestamp: number;
}

interface FlatItem {
  type: 'influencer' | 'campaign' | 'brand' | 'invoice' | 'recent' | 'trending';
  id: string;
  label: string;
  sub: string;
  path: string;
  isRecent?: boolean;
  isTrending?: boolean;
}

function flattenResults(r: SearchResults): FlatItem[] {
  const items: FlatItem[] = [];
  for (const inf of r.influencers) {
    items.push({ type: 'influencer', id: inf.id, label: `${inf.firstName} ${inf.lastName}`.trim(), sub: inf.igLink || inf.primaryGenre || '', path: '/influencers' });
  }
  for (const c of r.campaigns) {
    items.push({ type: 'campaign', id: c.id, label: c.name, sub: c.brandName || c.status || '', path: '/campaign' });
  }
  for (const b of r.brands) {
    items.push({ type: 'brand', id: b.id, label: b.name, sub: '', path: '/brands' });
  }
  for (const inv of r.invoices) {
    items.push({ type: 'invoice', id: inv.id, label: inv.originalName, sub: inv.invoiceNumber || inv.folder, path: '/invoice' });
  }
  return items;
}

function flattenTrending(r: TrendingResults): FlatItem[] {
  const items: FlatItem[] = [];
  for (const c of r.campaigns) {
    items.push({ type: 'trending', id: c.id, label: c.name, sub: c.brandName || c.status || '', path: '/campaign', isTrending: true });
  }
  for (const inf of r.influencers) {
    items.push({ type: 'trending', id: inf.id, label: `${inf.firstName} ${inf.lastName}`.trim(), sub: inf.igLink || inf.primaryGenre || '', path: '/influencers', isTrending: true });
  }
  for (const b of r.brands) {
    items.push({ type: 'trending', id: b.id, label: b.name, sub: '', path: '/brands', isTrending: true });
  }
  return items.slice(0, 5);
}

function getSearchHistory(): SearchHistoryItem[] {
  try {
    const stored = localStorage.getItem('search_history');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveToSearchHistory(item: Omit<SearchHistoryItem, 'timestamp'>) {
  try {
    const history = getSearchHistory();
    const filtered = history.filter(h => !(h.type === item.type && h.id === item.id));
    filtered.unshift({ ...item, timestamp: Date.now() });
    localStorage.setItem('search_history', JSON.stringify(filtered.slice(0, 20)));
  } catch {
    // Silently fail
  }
}

function clearSearchHistory() {
  try {
    localStorage.removeItem('search_history');
  } catch {
    // Silently fail
  }
}

const typeIcons: Record<string, string> = {
  influencer: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  campaign: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
  brand: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  invoice: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  recent: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  trending: 'M13 10V3L4 14h7v7l9-11h-7z',
};

const typeColors: Record<string, string> = {
  influencer: 'text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30',
  campaign: 'text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
  brand: 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30',
  invoice: 'text-purple-500 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30',
  recent: 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30',
  trending: 'text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30',
};

const typeLabels: Record<string, string> = {
  influencer: 'Influencer',
  campaign: 'Campaign',
  brand: 'Brand',
  invoice: 'Invoice',
  recent: 'Recent Searches',
  trending: 'Trending',
};

export default function GlobalSearchModal({ onClose }: GlobalSearchModalProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [trending, setTrending] = useState<TrendingResults | null>(null);
  const [recentSearches, setRecentSearches] = useState<SearchHistoryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load trending and recent on mount
  useEffect(() => {
    inputRef.current?.focus();
    setRecentSearches(getSearchHistory());

    const loadTrending = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/search/trending`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTrending(data);
        }
      } catch (err) {
        console.error('Trending load error:', err);
      }
    };

    loadTrending();
  }, []);

  // Show recent searches when no query, otherwise show search results
  let displayItems: FlatItem[] = [];
  if (query.trim().length < 2) {
    const recentItems: FlatItem[] = recentSearches.slice(0, 5).map(item => ({
      ...item,
      type: 'recent',
      isRecent: true,
    }));
    const trendingItems = trending ? flattenTrending(trending) : [];
    displayItems = [...recentItems, ...trendingItems];
  } else {
    displayItems = results ? flattenResults(results) : [];
  }

  const totalResults = displayItems.length;

  const doSearch = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(value.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const handleSelect = useCallback((item: FlatItem) => {
    // Save to search history (only for actual results, not recent/trending headers)
    if (item.type !== 'recent' && item.type !== 'trending') {
      saveToSearchHistory({
        type: item.type as 'influencer' | 'campaign' | 'brand' | 'invoice',
        id: item.id,
        label: item.label,
        sub: item.sub,
        path: item.path,
      });
    }
    navigate(item.path);
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, totalResults - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && displayItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(displayItems[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Group items by type for display
  const grouped: Record<string, FlatItem[]> = {};
  let runningIndex = 0;
  const indexMap = new Map<string, number>(); // item id -> flat index
  for (const item of displayItems) {
    if (!grouped[item.type]) grouped[item.type] = [];
    grouped[item.type].push(item);
    indexMap.set(`${item.type}-${item.id}`, runningIndex);
    runningIndex++;
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-start justify-center pt-[15vh] p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-zinc-800">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); doSearch(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder="Search influencers, campaigns, brands, invoices..."
            className="flex-1 bg-transparent text-gray-900 dark:text-white text-sm placeholder-gray-400 outline-none"
          />
          {searching && (
            <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs font-mono text-gray-400 bg-gray-100 dark:bg-zinc-800 rounded border border-gray-200 dark:border-zinc-700">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {!query.trim() && displayItems.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              Type to search across your entire workspace
            </div>
          )}

          {query.trim().length >= 2 && !searching && results && totalResults === 0 && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No results found for "{query}"
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              {/* Category header */}
              <div className="px-5 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-zinc-800/50">
                {typeLabels[type]}
              </div>
              {items.map(item => {
                const flatIdx = indexMap.get(`${item.type}-${item.id}`) ?? -1;
                const isSelected = flatIdx === selectedIndex;
                // Get actual type for badge (influencer, campaign, brand, invoice)
                const actualType = (item.type === 'recent' || item.type === 'trending') ? (results?.invoices?.some(i => i.id === item.id) ? 'invoice' : results?.campaigns?.some(c => c.id === item.id) ? 'campaign' : results?.brands?.some(b => b.id === item.id) ? 'brand' : 'influencer') : item.type;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(flatIdx)}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColors[type]}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={typeIcons[type]} />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.label}</p>
                      {item.sub && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.sub}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeColors[actualType]}`}>
                      {typeLabels[actualType]}
                    </span>
                    {isSelected && (
                      <span className="text-xs text-gray-400">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-zinc-800 rounded border border-gray-200 dark:border-zinc-700 font-mono">Enter</kbd>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-zinc-800 rounded border border-gray-200 dark:border-zinc-700 font-mono text-[10px]">&uarr;&darr;</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-zinc-800 rounded border border-gray-200 dark:border-zinc-700 font-mono text-[10px]">Enter</kbd>
              Open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-zinc-800 rounded border border-gray-200 dark:border-zinc-700 font-mono text-[10px]">Esc</kbd>
              Close
            </span>
          </div>
          <div className="flex items-center gap-3">
            {totalResults > 0 && <span>{totalResults} result{totalResults !== 1 ? 's' : ''}</span>}
            <button
              onClick={() => setShowAdvanced(true)}
              className="px-3 py-1 text-xs rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            >
              Advanced
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Search Modal */}
      {showAdvanced && <AdvancedSearch onClose={() => { setShowAdvanced(false); onClose(); }} />}
    </div>
  );
}
