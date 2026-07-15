import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';
import InfluencerProfilePanel from './InfluencerProfilePanel';
import CompareModal from './CompareModal';
import ConfirmModal from './ConfirmModal';

import { Loading3DCube } from './Loading3D';

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
  followersUnit: 'K' | 'M' | 'None';
  avgViews: number | null;
  avgViewsUnit: 'K' | 'M' | 'None' | null;
  primaryGenre: string;
  secondaryGenre?: string;
  city: string;
  state?: string;
  contact: ContactInfo;
  commercials: CommercialItem[];
  gender: string;
  notes?: string;
  blacklisted?: boolean;
  blacklistReason?: string;
  rating?: number | null;
  createdAt: string;
  updatedAt: string;
  _count?: { campaigns: number };
}


export default function InfluencerDashboard() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [filterOptions, setFilterOptions] = useState<{ genres: string[]; genders: string[] }>({ genres: [], genders: [] });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingInfluencer, setEditingInfluencer] = useState<Influencer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInfluencers, setSelectedInfluencers] = useState<string[]>([]);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [viewingInfluencer, setViewingInfluencer] = useState<Influencer | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const [duplicateErrorMessage, setDuplicateErrorMessage] = useState('');
  const [profileInfluencerId, setProfileInfluencerId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [compareList, setCompareList] = useState<Influencer[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'name' | 'followers' | 'genre' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for non-HTTPS (e.g. http://3fm.local)
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return Promise.resolve();
  };

  const toggleCompare = (inf: Influencer) => {
    setCompareList((prev) => {
      const exists = prev.find((i) => i.id === inf.id);
      if (exists) return prev.filter((i) => i.id !== inf.id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, inf];
    });
  };

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[]; total: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Get current user role
  const userRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return null; } })();
  
  // Filter states
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [genreSearch, setGenreSearch] = useState('');
  const [filters, setFilters] = useState({
    genres: [] as string[],
    followersRange: 'all' as 'all' | 'nano' | 'micro' | 'macro' | 'mega',
    locations: [] as string[],
    genders: [] as string[],
    hideBlacklisted: true,
  });

  const fetchInfluencers = async (
    p = page,
    search = debouncedSearch,
    f = filters,
  ) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) { window.location.href = '/login'; return; }
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (search) params.set('search', search);
      if (f.genres.length) params.set('genres', f.genres.join(','));
      if (f.locations.length) params.set('locations', f.locations.join(','));
      if (f.genders.length) params.set('genders', f.genders.join(','));
      if (f.followersRange !== 'all') params.set('followersRange', f.followersRange);
      const response = await fetch(`${API_URL}/api/influencers?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
      const data = await response.json();
      setInfluencers(data.influencers || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setPage(data.page || 1);
    } catch (error) {
      console.error('Failed to fetch influencers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_URL}/api/influencers/filter-options`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      setFilterOptions(data);
    } catch (err) {
      console.error('Failed to fetch filter options', err);
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = selectedInfluencers.length > 0
        ? `?ids=${selectedInfluencers.join(',')}`
        : '';
      const res = await fetch(`${API_URL}/api/influencers/export${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedInfluencers.length > 0 ? `influencers_selected_${selectedInfluencers.length}.xlsx` : 'influencers.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset file input so same file can be re-selected
    e.target.value = '';
    setImporting(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/api/influencers/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportResult(data);
      // Refresh influencer list
      fetchInfluencers();
    } catch (err: any) {
      setImportResult({ created: 0, skipped: 0, errors: [err.message], total: 0 });
    } finally {
      setImporting(false);
    }
  };

  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    fetchFilterOptions();
    const sock = io(API_URL, { forceNew: true });
    sock.on('influencer:created', () => setRefetchTick(t => t + 1));
    sock.on('influencer:updated', () => setRefetchTick(t => t + 1));
    sock.on('influencer:deleted', () => setRefetchTick(t => t + 1));
    return () => { sock.close(); };
  }, []);

  // Fetch whenever page, debounced search, filters, or socket tick change
  useEffect(() => {
    fetchInfluencers(page, debouncedSearch, filters);
  }, [page, debouncedSearch, filters, refetchTick]);

  const handleDelete = (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Influencer',
      message: 'This influencer will be permanently deleted. This action cannot be undone.',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await fetch(`${API_URL}/api/influencers/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (error) {
          console.error('Failed to delete influencer:', error);
        }
      },
    });
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

  // Get unique genres and genders from server-fetched filter options
  const uniqueGenres = filterOptions.genres;
  const uniqueLocations: string[] = [];
  const uniqueGenders = filterOptions.genders;

  // Check if any filters are active
  const hasActiveFilters =
    filters.genres.length > 0 ||
    filters.followersRange !== 'all' ||
    filters.locations.length > 0 ||
    filters.genders.length > 0 ||
    !filters.hideBlacklisted;

  // Clear all filters
  const clearFilters = () => {
    setPage(1);
    setFilters({
      genres: [],
      followersRange: 'all',
      locations: [],
      genders: [],
      hideBlacklisted: true,
    });
  };

  // Toggle filter selection
  const toggleGenreFilter = (genre: string) => {
    setFilters(prev => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter(g => g !== genre)
        : [...prev.genres, genre]
    }));
  };

  const toggleLocationFilter = (location: string) => {
    setFilters(prev => ({
      ...prev,
      locations: prev.locations.includes(location)
        ? prev.locations.filter(l => l !== location)
        : [...prev.locations, location]
    }));
  };

  const toggleGenderFilter = (gender: string) => {
    setFilters(prev => ({
      ...prev,
      genders: prev.genders.includes(gender)
        ? prev.genders.filter(g => g !== gender)
        : [...prev.genders, gender]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loading3DCube size={48} color="bg-blue-500" label="Loading influencers..." />
      </div>
    );
  }

  const handleSort = (field: 'name' | 'followers' | 'genre') => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortField(null); setSortDir('asc'); }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedInfluencers = (() => {
    const list = filters.hideBlacklisted ? influencers.filter(i => !i.blacklisted) : influencers;
    if (!sortField) return list;
    return [...list].sort((a, b) => {
      let aVal: string | number = '', bVal: string | number = '';
      if (sortField === 'name') { aVal = `${a.firstName} ${a.lastName}`; bVal = `${b.firstName} ${b.lastName}`; }
      else if (sortField === 'followers') { aVal = a.followers; bVal = b.followers; }
      else { aVal = a.primaryGenre || ''; bVal = b.primaryGenre || ''; }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  })();

  const SortIcon = ({ field }: { field: 'name' | 'followers' | 'genre' }) => (
    <span className="ml-1 text-xs opacity-50">{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
  );

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-black">
      {/* Top Bar */}
      <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800 px-4 md:px-10 py-4 md:py-7 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">Influencers</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1 md:mt-2 text-sm md:text-base">{total.toLocaleString()} influencers found</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Hidden file input for import */}
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImport}
            />
            {/* Import button — ADMIN/AGENCY only */}
            {userRole !== 'BRAND' && userRole !== 'EMPLOYEE' && (
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
                className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 px-5 py-2.5 rounded-lg font-semibold shadow-sm text-sm transition-colors whitespace-nowrap flex items-center gap-2 disabled:opacity-60"
              >
                {importing ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
                {importing ? 'Importing...' : 'Import'}
              </button>
            )}
            {/* Export button — ADMIN/AGENCY only */}
            {userRole !== 'BRAND' && userRole !== 'EMPLOYEE' && (
              <button
                onClick={handleExport}
                className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 px-5 py-2.5 rounded-lg font-semibold shadow-sm text-sm transition-colors whitespace-nowrap flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {selectedInfluencers.length > 0 ? `Export (${selectedInfluencers.length})` : 'Export'}
              </button>
            )}
            <button
              onClick={() => {setEditingInfluencer(null); setShowModal(true);}}
              className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-lg font-semibold shadow-md text-sm md:text-base transition-colors whitespace-nowrap"
            >
              + Add Influencer
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800 px-4 md:px-10 py-4 md:py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/40 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{total.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">T</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/40 dark:to-green-900/40 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Page</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{page} / {pages}</p>
              </div>
              <div className="w-12 h-12 bg-green-500 dark:bg-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">P</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-950/40 dark:to-yellow-900/40 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Showing</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{influencers.length}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-500 dark:bg-yellow-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">S</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/40 dark:to-orange-900/40 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Selected</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{selectedInfluencers.length}</p>
              </div>
              <div className="w-12 h-12 bg-orange-500 dark:bg-orange-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">✓</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="px-4 md:px-10 py-4 md:py-6 bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
          <div className="flex-1 relative">
            <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, genre, or location... (press Enter)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  setDebouncedSearch(searchTerm);
                }
              }}
              className="w-full pl-12 pr-4 py-2.5 md:py-3 text-sm md:text-base border border-gray-300 dark:border-zinc-800 dark:bg-black dark:text-white dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          
          {/* Filter Button */}
          <button
            onClick={() => { setGenreSearch(''); setShowFilterModal(true); }}
            className={`px-4 md:px-6 py-2.5 md:py-3 rounded-lg font-semibold whitespace-nowrap text-sm md:text-base transition-colors shadow-sm flex items-center justify-center gap-2 ${
              hasActiveFilters 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                : 'bg-white dark:bg-zinc-900 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="bg-white text-indigo-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {filters.genres.length + (filters.followersRange !== 'all' ? 1 : 0) + filters.locations.length + filters.genders.length}
              </span>
            )}
          </button>

          {/* View Toggle */}
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-2.5 md:py-3 text-sm transition-colors ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
              title="Table View"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-2.5 md:py-3 text-sm transition-colors ${viewMode === 'cards' ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
              title="Cards View"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
            </button>
          </div>

          {userRole !== 'EMPLOYEE' && (
          <label className="flex items-center gap-2 md:gap-3 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={selectedInfluencers.length === influencers.length && influencers.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span className="font-medium text-sm md:text-base text-gray-700 dark:text-gray-300">Select All</span>
          </label>
          )}
          {userRole !== 'EMPLOYEE' && selectedInfluencers.length > 0 && (
            <button
              onClick={() => setShowCampaignModal(true)}
              className="px-4 md:px-6 py-2.5 md:py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold whitespace-nowrap text-sm md:text-base transition-colors shadow-sm"
            >
              Add {selectedInfluencers.length} to Campaign
            </button>
          )}
        </div>
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-black">
        <div className="m-3 md:m-6 bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
                <tr>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-8 md:w-12"></th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    <button onClick={() => handleSort('name')} className="flex items-center hover:text-indigo-600 transition-colors">Name<SortIcon field="name" /></button>
                  </th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    <button onClick={() => handleSort('genre')} className="flex items-center hover:text-indigo-600 transition-colors">Genre<SortIcon field="genre" /></button>
                  </th>
                  <th className="hidden sm:table-cell px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Gender</th>
                  <th className="hidden sm:table-cell px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Location</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    <button onClick={() => handleSort('followers')} className="flex items-center hover:text-indigo-600 transition-colors">Followers<SortIcon field="followers" /></button>
                  </th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-32 md:w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedInfluencers.map((influencer) => (
                  <tr
                    key={influencer.id}
                    className="hover:bg-indigo-50 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
                    onClick={() => { setViewingInfluencer(influencer); setShowDetailsModal(true); }}
                  >
                    <td className="px-3 md:px-6 py-3 md:py-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {userRole !== 'EMPLOYEE' && (
                      <input
                        type="checkbox"
                        checked={selectedInfluencers.includes(influencer.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelect(influencer.id);
                        }}
                        className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      )}
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white text-sm md:text-base">{influencer.firstName} {influencer.lastName}</span>
                        {influencer.blacklisted && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400">
                            Blacklisted
                          </span>
                        )}
                      </div>
                    </td>
                  <td className="px-3 md:px-6 py-3 md:py-4">
                    <span className="inline-flex items-center px-2 md:px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      {influencer.primaryGenre}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell px-3 md:px-6 py-3 md:py-4 text-gray-700 dark:text-gray-300 text-xs md:text-sm">{influencer.gender}</td>
                  <td className="hidden sm:table-cell px-3 md:px-6 py-3 md:py-4 text-gray-700 dark:text-gray-300 text-xs md:text-sm">{influencer.city}, {influencer.state || 'N/A'}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4">
                    <div>
                      <span className="font-semibold text-indigo-600 text-sm md:text-base">{influencer.followers?.toLocaleString()}</span>
                      {influencer.rating && (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {[1,2,3,4,5].map(s => (
                            <svg key={s} className={`w-3 h-3 ${influencer.rating! >= s ? 'text-yellow-400' : 'text-gray-300 dark:text-zinc-600'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                            </svg>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4">
                    <div className="flex items-center justify-center gap-1.5 md:gap-2">
                      {/* Copy IG Link */}
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(influencer.igLink); setCopiedId(influencer.id); setTimeout(() => setCopiedId(null), 1500); }}
                        title="Copy IG Link"
                        className="p-1.5 text-indigo-400 hover:text-indigo-600 transition-colors"
                      >
                        {copiedId === influencer.id
                          ? <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        }
                      </button>
                      {/* WhatsApp */}
                      {influencer.contact?.contactType === 'Number' && influencer.contact?.contactValue && (
                        <a
                          href={`https://wa.me/${influencer.contact.contactValue.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="WhatsApp"
                          className="p-1.5 text-green-500 hover:text-green-600 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.562 4.14 1.541 5.878L0 24l6.335-1.52A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.893 0-3.668-.516-5.19-1.415l-.371-.22-3.762.904.956-3.658-.241-.38A9.946 9.946 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                        </a>
                      )}
                      <span className="text-gray-300 dark:text-zinc-700">|</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingInfluencer(influencer);
                          setShowModal(true);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 text-xs md:text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(influencer.id);
                        }}
                        className="text-red-600 hover:text-red-800 text-xs md:text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCompare(influencer); }}
                        title={compareList.find((i) => i.id === influencer.id) ? 'Remove from compare' : compareList.length >= 3 ? 'Max 3 influencers' : 'Add to compare'}
                        className={`p-1 rounded transition-colors ${
                          compareList.find((i) => i.id === influencer.id)
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
      )}

      {/* Cards View */}
      {viewMode === 'cards' && (
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-black p-3 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedInfluencers.map((influencer) => {
            const isFlipped = flippedCards.has(influencer.id);
            return (
              <div key={influencer.id} className="perspective-800" style={{ height: '280px' }}>
                <div
                  className="w-full h-full preserve-3d"
                  style={{ transition: 'transform 0.15s ease-out' }}
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
                <div
                  className={`flip-card-inner relative w-full h-full cursor-pointer ${isFlipped ? '' : ''}`}
                  style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                  onClick={() => {
                    setFlippedCards(prev => {
                      const next = new Set(prev);
                      if (next.has(influencer.id)) next.delete(influencer.id);
                      else next.add(influencer.id);
                      return next;
                    });
                  }}
                >
                  {/* Front Face */}
                  <div className="absolute inset-0 backface-hidden bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                          {influencer.firstName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {influencer.firstName} {influencer.lastName}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{influencer.igLink}</p>
                        </div>
                      </div>
                      {userRole !== 'EMPLOYEE' && (
                        <input
                          type="checkbox"
                          checked={selectedInfluencers.includes(influencer.id)}
                          onChange={(e) => { e.stopPropagation(); toggleSelect(influencer.id); }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 flex-shrink-0"
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300">
                        {influencer.primaryGenre}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400">
                        {influencer.gender}
                      </span>
                      {influencer.blacklisted && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          Blacklisted
                        </span>
                      )}
                    </div>
                    <div className="mt-auto space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Followers</span>
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{influencer.followers?.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Location</span>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{influencer.city}{influencer.state ? `, ${influencer.state}` : ''}</span>
                      </div>
                      {influencer.rating && (
                        <div className="flex items-center gap-0.5">
                          {[1,2,3,4,5].map(s => (
                            <svg key={s} className={`w-3.5 h-3.5 ${influencer.rating! >= s ? 'text-yellow-400' : 'text-gray-300 dark:text-zinc-600'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                            </svg>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-2 text-center">Click to flip</p>
                  </div>

                  {/* Back Face */}
                  <div
                    className="absolute inset-0 backface-hidden bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 flex flex-col"
                    style={{ transform: 'rotateY(180deg)' }}
                  >
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Details</p>
                    <div className="space-y-2 flex-1 overflow-auto">
                      {influencer.contact && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{influencer.contact.contactType}</span>
                          <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{influencer.contact.contactValue}</span>
                        </div>
                      )}
                      {influencer.avgViews && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Avg Views</span>
                          <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                            {influencer.avgViews}{influencer.avgViewsUnit === 'K' ? 'K' : influencer.avgViewsUnit === 'M' ? 'M' : ''}
                          </span>
                        </div>
                      )}
                      {influencer.secondaryGenre && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Secondary Genre</span>
                          <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{influencer.secondaryGenre}</span>
                        </div>
                      )}
                      {influencer.commercials && influencer.commercials.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Commercials</p>
                          {influencer.commercials.slice(0, 3).map((c, i) => (
                            <div key={i} className="flex items-center justify-between text-xs py-0.5">
                              <span className="text-gray-600 dark:text-gray-400">{c.platform} - {c.type}</span>
                              <span className="font-medium text-gray-800 dark:text-gray-200">{c.count}{c.countUnit === 'Lacs (L)' ? 'L' : 'K'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {influencer.notes && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-400 italic line-clamp-2">{influencer.notes}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                      <button
                        onClick={(e) => { e.stopPropagation(); setViewingInfluencer(influencer); setShowDetailsModal(true); }}
                        className="flex-1 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors"
                      >
                        View
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingInfluencer(influencer); setShowModal(true); }}
                        className="flex-1 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-md transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(influencer.igLink); setCopiedId(influencer.id); setTimeout(() => setCopiedId(null), 1500); }}
                        className="py-1.5 px-2 text-xs text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors"
                      >
                        {copiedId === influencer.id ? 'Copied!' : 'Copy IG'}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-1 text-center">Click to flip back</p>
                  </div>
                </div>
              </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Pagination Controls */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 py-4 bg-white dark:bg-black border-t border-gray-200 dark:border-zinc-800">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <InfluencerModal
          influencer={editingInfluencer}
          onClose={() => {
            setShowModal(false);
            setEditingInfluencer(null);
          }}
          onDuplicateError={(message) => {
            setDuplicateErrorMessage(message);
            setShowDuplicateError(true);
          }}
        />
      )}

      {showCampaignModal && (
        <CampaignSelectionModal
          selectedInfluencers={selectedInfluencers}
          onClose={() => {
            setShowCampaignModal(false);
            setSelectedInfluencers([]);
          }}
        />
      )}

      {showDetailsModal && viewingInfluencer && (
        <InfluencerDetailsModal
          influencer={viewingInfluencer}
          onClose={() => {
            setShowDetailsModal(false);
            setViewingInfluencer(null);
          }}
          onEdit={(inf) => {
            setShowDetailsModal(false);
            setEditingInfluencer(inf);
            setShowModal(true);
          }}
          onDelete={handleDelete}
        />
      )}

      {/* Influencer Profile Panel */}
      <InfluencerProfilePanel
        influencerId={profileInfluencerId}
        onClose={() => setProfileInfluencerId(null)}
        onEdit={(inf) => {
          setEditingInfluencer(inf as unknown as Influencer);
          setShowModal(true);
        }}
      />

      {/* Import Result Modal */}
      {importResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-zinc-700">
            <div className="flex items-center gap-3 mb-4">
              {importResult.errors.length === 0 && importResult.created > 0 ? (
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
              )}
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Import Complete</h3>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center border border-green-200 dark:border-green-800">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importResult.created}</p>
                <p className="text-xs text-green-700 dark:text-green-300 font-medium mt-1">Added</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center border border-amber-200 dark:border-amber-800">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{importResult.skipped}</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mt-1">Skipped (dup)</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center border border-red-200 dark:border-red-800">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importResult.errors.length}</p>
                <p className="text-xs text-red-700 dark:text-red-300 font-medium mt-1">Errors</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/10 rounded-lg p-3 border border-red-200 dark:border-red-800 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Errors:</p>
                {importResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>
                ))}
              </div>
            )}

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Processed {importResult.total} row{importResult.total !== 1 ? 's' : ''} from your file.
            </p>

            <button
              onClick={() => setImportResult(null)}
              className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Duplicate Error Modal */}
      {showDuplicateError && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-black rounded-lg shadow-2xl max-w-md w-full animate-bounce-in">
            {/* Header */}
            <div className="bg-red-600 px-6 py-4 rounded-t-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">Duplicate Instagram Link</h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="mb-4">
                <p className="text-gray-700 dark:text-gray-300 text-base leading-relaxed">
                  {duplicateErrorMessage}
                </p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Note:</strong> Each influencer must have a unique Instagram link. Please use a different Instagram link or update the existing influencer instead.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 dark:bg-black px-6 py-4 rounded-b-lg flex justify-end">
              <button
                onClick={() => setShowDuplicateError(false)}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-sm"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-black rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <h2 className="text-xl font-bold text-white">Filter Influencers</h2>
                {hasActiveFilters && (
                  <span className="bg-white text-indigo-600 rounded-full px-3 py-1 text-sm font-bold">
                    {filters.genres.length + (filters.followersRange !== 'all' ? 1 : 0) + filters.locations.length + filters.genders.length} Active
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowFilterModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-8">
              <div className="grid grid-cols-2 gap-8">
                {/* Genre Filter */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Genre
                  </h3>
                  <div className="relative mb-3">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search genre..."
                      value={genreSearch}
                      onChange={(e) => setGenreSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {genreSearch && (
                      <button onClick={() => setGenreSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">×</button>
                    )}
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {uniqueGenres.filter(g => g.toLowerCase().includes(genreSearch.toLowerCase())).map(genre => (
                      <label key={genre} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.genres.includes(genre)}
                          onChange={() => toggleGenreFilter(genre)}
                          className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <span className="text-gray-700 dark:text-gray-300">{genre}</span>
                      </label>
                    ))}
                    {uniqueGenres.filter(g => g.toLowerCase().includes(genreSearch.toLowerCase())).length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 px-2 py-1">No genres match "{genreSearch}"</p>
                    )}
                  </div>
                </div>

                {/* Followers Range Filter */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Followers Range
                  </h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="followersRange"
                        checked={filters.followersRange === 'all'}
                        onChange={() => setFilters(prev => ({ ...prev, followersRange: 'all' }))}
                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">All</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="followersRange"
                        checked={filters.followersRange === 'nano'}
                        onChange={() => setFilters(prev => ({ ...prev, followersRange: 'nano' }))}
                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Nano (&lt; 10K)</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="followersRange"
                        checked={filters.followersRange === 'micro'}
                        onChange={() => setFilters(prev => ({ ...prev, followersRange: 'micro' }))}
                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Micro (10K - 100K)</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="followersRange"
                        checked={filters.followersRange === 'macro'}
                        onChange={() => setFilters(prev => ({ ...prev, followersRange: 'macro' }))}
                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Macro (100K - 1M)</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="followersRange"
                        checked={filters.followersRange === 'mega'}
                        onChange={() => setFilters(prev => ({ ...prev, followersRange: 'mega' }))}
                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Mega (1M+)</span>
                    </label>
                  </div>
                </div>

                {/* Location Filter */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Location
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {uniqueLocations.map(location => (
                      <label key={location} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.locations.includes(location)}
                          onChange={() => toggleLocationFilter(location)}
                          className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <span className="text-gray-700 dark:text-gray-300">{location}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Gender Filter */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Gender
                  </h3>
                  <div className="space-y-2">
                    {uniqueGenders.map(gender => (
                      <label key={gender} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.genders.includes(gender)}
                          onChange={() => toggleGenderFilter(gender)}
                          className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <span className="text-gray-700 dark:text-gray-300">{gender}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Blacklisted filter */}
              <div className="border-t border-gray-100 dark:border-zinc-800 pt-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!filters.hideBlacklisted}
                    onChange={(e) => setFilters(prev => ({ ...prev, hideBlacklisted: !e.target.checked }))}
                    className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <span className="text-gray-700 dark:text-gray-300 font-medium">Show blacklisted influencers</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500">(hidden by default)</span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 dark:border-zinc-800 px-8 py-4 bg-gray-50 dark:bg-black flex items-center justify-between">
              <button
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="px-6 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors border border-red-200 dark:border-red-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Clear All Filters
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="px-6 py-3 bg-white dark:bg-zinc-900 text-gray-700 dark:text-gray-300 rounded-lg font-semibold hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors border border-gray-300 dark:border-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setPage(1); setShowFilterModal(false); }}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Compare Bar */}
      {compareList.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-white dark:bg-zinc-900 border border-indigo-500/40 rounded-2xl shadow-2xl px-4 py-3">
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">Compare:</span>
          {compareList.map((inf) => (
            <div key={inf.id} className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg px-2.5 py-1">
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                {inf.firstName} {inf.lastName}
              </span>
              <button
                onClick={() => toggleCompare(inf)}
                className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200 ml-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {compareList.length >= 2 && (
            <button
              onClick={() => setShowCompareModal(true)}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Compare {compareList.length}
            </button>
          )}
          <button
            onClick={() => setCompareList([])}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-1"
            title="Clear all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Compare Modal */}
      {showCompareModal && (
        <CompareModal
          influencers={compareList}
          onClose={() => setShowCompareModal(false)}
          onRemove={(id) => setCompareList((prev) => prev.filter((i) => i.id !== id))}
        />
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
function InfluencerModal({
  influencer,
  onClose,
  onDuplicateError,
}: {
  influencer: Influencer | null;
  onClose: () => void;
  onDuplicateError: (message: string) => void;
}) {
  const [formData, setFormData] = useState({
    firstName: influencer?.firstName || '',
    lastName: influencer?.lastName || '',
    igLink: influencer?.igLink || '',
    followers: influencer?.followers != null
      ? (influencer.followersUnit === 'K' ? influencer.followers / 1000
        : influencer.followersUnit === 'M' ? influencer.followers / 1000000
        : influencer.followers)
      : 0,
    followersUnit: influencer?.followersUnit || 'K',
    avgViews: influencer?.avgViews != null
      ? (influencer.avgViewsUnit === 'K' ? influencer.avgViews / 1000
        : influencer.avgViewsUnit === 'M' ? influencer.avgViews / 1000000
        : influencer.avgViews)
      : null,
    avgViewsUnit: influencer?.avgViewsUnit || 'K',
    primaryGenre: influencer?.primaryGenre || '',
    secondaryGenre: influencer?.secondaryGenre || '',
    city: influencer?.city || '',
    state: influencer?.state || '',
    contact: influencer?.contact || {
      contactType: 'Number' as 'Number' | 'Email',
      contactSubType: '',
      contactValue: ''
    },
    commercials: influencer?.commercials?.map((c: any) => {
      const displayCount = c.countUnit
        ? (c.countUnit === 'Thousand' ? c.count / 1000 : c.countUnit === 'Lacs (L)' ? c.count / 100000 : c.count)
        : c.count;

      return {
        ...c,
        count: displayCount,
        countUnit: c.countUnit || 'Thousand'
      };
    }) || [],
    gender: influencer?.gender || '',
    notes: influencer?.notes || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();


    const commercialsConverted = formData.commercials.map(c => ({
      ...c,
      count: c.countUnit === 'Thousand' ? c.count * 1000 : c.countUnit === 'Lacs (L)' ? c.count * 100000 : c.count
    }));

    // Send raw display values; backend applies unit multiplication
    const payload = {
      ...formData,
      commercials: commercialsConverted
    };

    const token = localStorage.getItem('token');
    try {
      let response;
      if (influencer) {
        response = await fetch(`${API_URL}/api/influencers/${influencer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch(`${API_URL}/api/influencers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === 'Duplicate Instagram Link' || errorData.error === 'Duplicate Phone Number') {
          onDuplicateError(errorData.message);
          return;
        }
        throw new Error(errorData.message || 'Failed to save influencer');
      }

      onClose();
    } catch (error) {
      console.error('Failed to save influencer:', error);
      alert('Failed to save influencer. Please try again.');
    }
  };

  const handleAddCommercial = (platform: 'Instagram' | 'Youtube') => {
    setFormData({
      ...formData,
      commercials: [
        ...formData.commercials,
        { platform, type: '', count: 0, countUnit: 'Thousand', monthAdRights: 0 }
      ]
    });
  };

  const handleRemoveCommercial = (index: number) => {
    setFormData({
      ...formData,
      commercials: formData.commercials.filter((_, i) => i !== index)
    });
  };

  const handleUpdateCommercial = (index: number, field: string, value: any) => {
    const updated = [...formData.commercials];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, commercials: updated });
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 md:p-4 z-50">
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-blue-600 text-white px-4 md:px-8 py-4 md:py-6">
          <h2 className="text-xl md:text-2xl font-bold">
            {influencer ? 'Edit Influencer' : 'Add New Influencer'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-5 md:space-y-8">
          {/* Name Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-gray-200 dark:border-zinc-800">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">First Name *</label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Last Name *</label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-4 md:mt-5">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Gender *</label>
                <select
                  required
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Couple">Couple</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="mt-4 md:mt-5">
              <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Instagram Link *</label>
              <input
                type="url"
                required
                value={formData.igLink}
                onChange={(e) => setFormData({ ...formData, igLink: e.target.value })}
                className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Followers Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-gray-200 dark:border-zinc-800">Audience Stats</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Followers *</label>
                <div className="flex gap-2 md:gap-3">
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.followers}
                    onChange={(e) => setFormData({ ...formData, followers: parseFloat(e.target.value) || 0 })}
                    className="flex-1 px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    required
                    value={formData.followersUnit}
                    onChange={(e) => setFormData({ ...formData, followersUnit: e.target.value as 'K' | 'M' | 'None' })}
                    className="px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="K">K</option>
                    <option value="M">M</option>
                    <option value="None">None</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Avg Views</label>
                <div className="flex gap-2 md:gap-3">
                  <input
                    type="number"
                    min="1"
                    value={formData.avgViews || ''}
                    onChange={(e) => setFormData({ ...formData, avgViews: e.target.value ? parseFloat(e.target.value) || 0 : null })}
                    className="flex-1 px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={formData.avgViewsUnit}
                    onChange={(e) => setFormData({ ...formData, avgViewsUnit: e.target.value as 'K' | 'M' | 'None' })}
                    className="px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="K">K</option>
                    <option value="M">M</option>
                    <option value="None">None</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Genre Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-gray-200 dark:border-zinc-800">Content Genre</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Primary Genre *</label>
                <input
                  type="text"
                  required
                  value={formData.primaryGenre}
                  onChange={(e) => setFormData({ ...formData, primaryGenre: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Secondary Genre</label>
                <input
                  type="text"
                  value={formData.secondaryGenre}
                  onChange={(e) => setFormData({ ...formData, secondaryGenre: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Location Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-gray-200 dark:border-zinc-800">Location</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">City *</label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-gray-200 dark:border-zinc-800">Contact Details</h3>
            <div className="space-y-4 md:space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Contact Type *</label>
                  <select
                    required
                    value={formData.contact.contactType}
                    onChange={(e) => setFormData({
                      ...formData,
                      contact: { ...formData.contact, contactType: e.target.value as 'Number' | 'Email' }
                    })}
                    className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Number">Phone Number</option>
                    <option value="Email">Email</option>
                  </select>
                </div>
                {formData.contact.contactType === 'Number' && (
                  <div>
                    <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Phone Type</label>
                    <select
                      value={formData.contact.contactSubType || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        contact: { ...formData.contact, contactSubType: e.target.value }
                      })}
                      className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Type</option>
                      <option value="Personal Number">Personal</option>
                      <option value="Manager">Manager</option>
                      <option value="Agency">Agency</option>
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-base font-medium text-gray-400 mb-2">
                  {formData.contact.contactType === 'Number' ? 'Phone Number *' : 'Email Address *'}
                </label>
                <input
                  type={formData.contact.contactType === 'Number' ? 'tel' : 'email'}
                  required
                  value={formData.contact.contactValue}
                  onChange={(e) => setFormData({
                    ...formData,
                    contact: { ...formData.contact, contactValue: e.target.value }
                  })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Commercials Section */}
          <div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3 md:mb-4 pb-2 md:pb-3 border-b border-gray-200 dark:border-zinc-800">
              <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">Commercial Rates</h3>
              <div className="flex gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={() => handleAddCommercial('Instagram')}
                  className="px-3 md:px-4 py-2 text-xs md:text-sm bg-pink-600 text-white rounded hover:bg-pink-700 flex-1 sm:flex-none"
                >
                  + Instagram
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCommercial('Youtube')}
                  className="px-3 md:px-4 py-2 text-xs md:text-sm bg-red-600 text-white rounded hover:bg-red-700 flex-1 sm:flex-none"
                >
                  + YouTube
                </button>
              </div>
            </div>

            {formData.commercials.length > 0 ? (
              <div className="space-y-3 md:space-y-4">
                {formData.commercials.map((commercial, index) => (
                  <div key={index} className="border border-gray-200 dark:border-zinc-800 rounded p-3 md:p-4 bg-gray-50 dark:bg-zinc-900">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Platform</label>
                        <input
                          type="text"
                          disabled
                          value={commercial.platform}
                          className="w-full px-2 md:px-3 py-2 text-sm md:text-base bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-800 text-gray-500 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-2">Type *</label>
                        <select
                          required
                          value={commercial.type}
                          onChange={(e) => handleUpdateCommercial(index, 'type', e.target.value)}
                          className="w-full px-2 md:px-3 py-2 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select</option>
                          {commercial.platform === 'Instagram' ? (
                            <>
                              <option value="Collab">Collab</option>
                              <option value="Non-Collab">Non-Collab</option>
                              <option value="Song Promotion">Song</option>
                              <option value="Brand Promotion">Brand</option>
                              <option value="Static Post">Static</option>
                              <option value="Story">Story</option>
                              <option value="Repost">Repost</option>
                            </>
                          ) : (
                            <>
                              <option value="Youtube Shorts">Shorts</option>
                              <option value="Youtube Video">Video</option>
                              <option value="Youtube Dedicated">Dedicated</option>
                              <option value="Youtube Integrated">Integrated</option>
                            </>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-2">Amount *</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={commercial.count}
                          onChange={(e) => handleUpdateCommercial(index, 'count', parseInt(e.target.value) || 0)}
                          className="w-full px-2 md:px-3 py-2 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-2">Unit *</label>
                        <select
                          required
                          value={commercial.countUnit}
                          onChange={(e) => handleUpdateCommercial(index, 'countUnit', e.target.value)}
                          className="w-full px-2 md:px-3 py-2 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="Thousand">K</option>
                          <option value="Lacs (L)">L</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-2">Ad Rights</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0"
                            required
                            value={commercial.monthAdRights}
                            onChange={(e) => handleUpdateCommercial(index, 'monthAdRights', parseInt(e.target.value) || 0)}
                            className="flex-1 px-2 md:px-3 py-2 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveCommercial(index)}
                            className="px-2 md:px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs md:text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm md:text-base text-gray-400 text-center py-4 md:py-6">No commercials added</p>
            )}
          </div>

          {/* Notes */}
          <div className="mt-4 md:mt-5">
            <label className="block text-sm md:text-base font-medium text-gray-400 mb-2">Internal Notes</label>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Private notes visible only to your team..."
              className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex flex-col md:flex-row gap-3 md:gap-4 pt-4 md:pt-6 border-t border-gray-200 dark:border-zinc-800">
            <button
              type="submit"
              className="flex-1 px-4 md:px-6 py-2.5 md:py-3.5 text-sm md:text-base bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
            >
              {influencer ? 'Update' : 'Add'} Influencer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 md:px-6 py-2.5 md:py-3.5 text-sm md:text-base bg-gray-100 dark:bg-zinc-900 text-gray-700 dark:text-white rounded font-medium hover:bg-gray-200 dark:hover:bg-zinc-800"
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
  const [error, setError] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [step, setStep] = useState<'select' | 'costs'>('select');
  const [batchCost, setBatchCost] = useState({ internalCost: '', externalCost: '' });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/campaigns`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setCampaigns(Array.isArray(data) ? data : []);
      setError(null);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
      setCampaigns([]);
      setError('Failed to load campaigns. Please try again.');
      setLoading(false);
    }
  };

  const handleAddToCampaign = async () => {
    if (!selectedCampaign) {
      alert('Please select a campaign');
      return;
    }
    if (!batchCost.internalCost || !batchCost.externalCost) {
      alert('Both Internal and External costs are required');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/campaigns/batch-add-influencers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId: selectedCampaign,
          influencers: selectedInfluencers.map(id => ({
            influencerId: id,
            internalCost: parseFloat(batchCost.internalCost),
            externalCost: parseFloat(batchCost.externalCost),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      alert('Influencers added successfully!');
      onClose();
    } catch (error) {
      console.error('Failed to add influencers:', error);
      alert('Failed to add influencers');
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-lg shadow-xl max-w-lg w-full">
        <div className="bg-purple-600 text-white px-8 py-6">
          <h2 className="text-2xl font-bold">Add to Campaign</h2>
          <p className="text-base text-purple-100 mt-2">
            {selectedInfluencers.length} influencers selected
            {step === 'costs' && ' — Step 2: Enter Costs'}
          </p>
        </div>

        <div className="p-8">
          {loading ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 border-4 border-zinc-700 border-t-purple-600 rounded-full animate-spin mx-auto"></div>
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="text-red-400 mb-4">{error}</div>
              <button
                onClick={fetchCampaigns}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Retry
              </button>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400">No campaigns available. Create a campaign first.</p>
            </div>
          ) : step === 'select' ? (
            <div>
              <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-3">Select Campaign</label>
              <select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                className="w-full px-4 py-3 text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Choose...</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} - {campaign.brandName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Enter costs to apply to all {selectedInfluencers.length} influencers. You can edit individual costs later in the campaign view.
              </p>
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">Internal Cost (INR) *</label>
                <input
                  type="number"
                  placeholder="0"
                  value={batchCost.internalCost}
                  onChange={(e) => setBatchCost(prev => ({ ...prev, internalCost: e.target.value }))}
                  className="w-full px-4 py-3 text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">External Cost (INR) *</label>
                <input
                  type="number"
                  placeholder="0"
                  value={batchCost.externalCost}
                  onChange={(e) => setBatchCost(prev => ({ ...prev, externalCost: e.target.value }))}
                  className="w-full px-4 py-3 text-base bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-zinc-800 px-8 py-6 flex gap-4">
          {step === 'select' ? (
            <>
              <button
                onClick={() => {
                  if (!selectedCampaign) { alert('Please select a campaign'); return; }
                  setStep('costs');
                }}
                disabled={!selectedCampaign}
                className="flex-1 px-6 py-3 text-base bg-purple-600 text-white rounded font-medium hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 text-base bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 rounded font-medium hover:bg-gray-200 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('select')}
                className="px-6 py-3 text-base bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 rounded font-medium hover:bg-gray-200 dark:hover:bg-zinc-700"
              >
                Back
              </button>
              <button
                onClick={handleAddToCampaign}
                disabled={!batchCost.internalCost || !batchCost.externalCost}
                className="flex-1 px-6 py-3 text-base bg-purple-600 text-white rounded font-medium hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Add to Campaign
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 text-base bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 rounded font-medium hover:bg-gray-200 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Influencer Details Modal
function InfluencerDetailsModal({
  influencer,
  onClose,
  onEdit,
  onDelete,
}: {
  influencer: Influencer;
  onClose: () => void;
  onEdit: (influencer: Influencer) => void;
  onDelete: (id: string) => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 md:p-4 z-50">
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white px-4 md:px-8 py-4 md:py-6 flex items-center justify-between">
          <div className="flex-1 min-w-0 pr-2">
            <h2 className="text-xl md:text-3xl font-bold truncate">{influencer.firstName} {influencer.lastName}</h2>
            <p className="text-blue-100 text-sm md:text-base mt-1 md:mt-2">{influencer.primaryGenre} • {influencer.gender}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl md:text-3xl leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
            {/* Stats Box */}
            <div className="md:col-span-1 grid grid-cols-2 md:grid-cols-1 gap-4 md:space-y-5 md:gap-0">
              <div className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded p-4 md:p-5">
                <div className="text-xs md:text-sm text-gray-400 mb-1 md:mb-2">FOLLOWERS</div>
                <div className="text-xl md:text-3xl font-bold text-blue-500">{influencer.followers.toLocaleString()}</div>
              </div>
              {influencer.avgViews && (
                <div className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded p-4 md:p-5">
                  <div className="text-xs md:text-sm text-gray-400 mb-1 md:mb-2">AVG VIEWS</div>
                  <div className="text-xl md:text-3xl font-bold text-green-500">{influencer.avgViews.toLocaleString()}</div>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="md:col-span-2 space-y-5 md:space-y-8">
              {/* Basic Info */}
              <div>
                <h3 className="text-sm md:text-base font-semibold text-gray-900 dark:text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-gray-200 dark:border-zinc-800">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5 text-sm md:text-base">
                  <div className="break-words">
                    <span className="text-gray-400">Instagram:</span>
                    <a href={influencer.igLink} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline break-all">
                      View Profile →
                    </a>
                    <button
                      onClick={() => { copyToClipboard(influencer.igLink); setCopiedId(influencer.id); setTimeout(() => setCopiedId(null), 1500); }}
                      title="Copy IG Link"
                      className="ml-2 inline-flex items-center text-indigo-400 hover:text-indigo-600 transition-colors"
                    >
                      {copiedId === influencer.id
                        ? <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      }
                    </button>
                  </div>
                  <div className="break-words">
                    <span className="text-gray-400">Genre:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">{influencer.primaryGenre}</span>
                    {influencer.secondaryGenre && <span className="text-gray-500"> / {influencer.secondaryGenre}</span>}
                  </div>
                  <div className="break-words">
                    <span className="text-gray-400">Location:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">{influencer.city}, {influencer.state || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div>
                <h3 className="text-sm md:text-base font-semibold text-gray-900 dark:text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-gray-200 dark:border-zinc-800">Contact</h3>
                <div className="flex items-center gap-3 text-sm md:text-base">
                  <div className="break-words">
                    <span className="text-gray-400">{influencer.contact.contactType}:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white break-all">{influencer.contact.contactValue}</span>
                    {influencer.contact.contactSubType && (
                      <span className="ml-2 text-gray-500">({influencer.contact.contactSubType})</span>
                    )}
                  </div>
                  {influencer.contact.contactType === 'Number' && influencer.contact.contactValue && (
                    <a
                      href={`https://wa.me/${influencer.contact.contactValue.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="WhatsApp"
                      className="flex-shrink-0 text-green-500 hover:text-green-400 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.562 4.14 1.541 5.878L0 24l6.335-1.52A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.893 0-3.668-.516-5.19-1.415l-.371-.22-3.762.904.956-3.658-.241-.38A9.946 9.946 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                    </a>
                  )}
                </div>
              </div>

              {/* Commercials */}
              {influencer.commercials.length > 0 && (
                <div>
                  <h3 className="text-sm md:text-base font-semibold text-gray-900 dark:text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-gray-200 dark:border-zinc-800">Commercial Rates</h3>
                  <div className="space-y-2 md:space-y-3">
                    {influencer.commercials.map((commercial, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-zinc-900 px-3 md:px-4 py-2 md:py-3 rounded text-sm md:text-base gap-2">
                        <span className="font-medium text-gray-900 dark:text-white truncate">{commercial.platform} - {commercial.type}</span>
                        <span className="text-blue-500 font-semibold whitespace-nowrap">₹{commercial.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-zinc-800 px-4 md:px-8 py-4 md:py-6 flex flex-col md:flex-row gap-3 md:gap-4">
          <button
            onClick={() => onEdit(influencer)}
            className="px-6 md:px-8 py-2.5 md:py-3 text-sm md:text-base bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
          >
            Edit
          </button>
          <button
            onClick={() => {
              onDelete(influencer.id);
              onClose();
            }}
            className="px-6 md:px-8 py-2.5 md:py-3 text-sm md:text-base bg-red-600 text-white rounded font-medium hover:bg-red-700"
          >
            Delete
          </button>
          <button
            onClick={onClose}
            className="md:ml-auto px-6 md:px-8 py-2.5 md:py-3 text-sm md:text-base bg-gray-100 dark:bg-zinc-900 text-gray-700 dark:text-white rounded font-medium hover:bg-gray-200 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
