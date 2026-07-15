import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';
import ConfirmModal from '../components/ConfirmModal';

interface ActivityLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  details: any;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  };
}

interface LogResponse {
  logs: ActivityLogEntry[];
  total: number;
  page: number;
  pages: number;
}

const entityTypeColors: Record<string, string> = {
  Campaign: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
  Influencer: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300',
  Brand: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  Authentication: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
};

const actionColors: Record<string, string> = {
  Created: 'text-green-600 dark:text-green-400',
  Updated: 'text-amber-600 dark:text-amber-400',
  Deleted: 'text-red-600 dark:text-red-400',
  Login: 'text-green-600 dark:text-green-400',
  Logout: 'text-blue-600 dark:text-blue-400',
  'Failed Login': 'text-red-600 dark:text-red-400',
};

function getActionColor(action: string) {
  for (const key of Object.keys(actionColors)) {
    if (action.includes(key)) return actionColors[key];
  }
  return 'text-gray-600 dark:text-gray-300';
}

export default function ActivityLog() {
  const [data, setData] = useState<LogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  const fetchLogs = async (p = page, filter = entityTypeFilter, start = startDate, end = endDate) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ page: String(p) });
      if (filter) params.set('entityType', filter);
      if (start) params.set('startDate', start);
      if (end) params.set('endDate', end);
      const res = await fetch(`${API_URL}/api/activity?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch logs: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch activity logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page, entityTypeFilter, startDate, endDate);
  }, [page, entityTypeFilter, startDate, endDate]);

  const handleFilterChange = (value: string) => {
    setEntityTypeFilter(value);
    setPage(1);
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    if (field === 'start') setStartDate(value);
    else setEndDate(value);
    setPage(1);
  };

  const handleDeleteLogs = () => {
    const count = data?.total ?? 0;
    const rangeText = startDate || endDate
      ? ` between ${startDate || '(any)'} and ${endDate || '(any)'}`
      : '';
    const typeText = entityTypeFilter ? ` (${entityTypeFilter})` : '';
    setConfirmState({
      open: true,
      title: 'Delete Activity Logs',
      message: `Delete ${count} log${count !== 1 ? 's' : ''}${typeText}${rangeText}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        setDeleting(true);
        try {
          const token = localStorage.getItem('token');
          const params = new URLSearchParams();
          if (entityTypeFilter) params.set('entityType', entityTypeFilter);
          if (startDate) params.set('startDate', startDate);
          if (endDate) params.set('endDate', endDate);
          await fetch(`${API_URL}/api/activity?${params}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          setPage(1);
          await fetchLogs(1, entityTypeFilter, startDate, endDate);
        } catch (err) {
          console.error('Failed to delete logs', err);
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  // Live sync: prepend new activity entries as they arrive
  useEffect(() => {
    const socket = io(API_URL);
    const handler = (log: ActivityLogEntry) => {
      if (page !== 1) return;
      if (entityTypeFilter && log.entityType !== entityTypeFilter) return;
      if (startDate && new Date(log.createdAt) < new Date(startDate)) return;
      if (endDate && new Date(log.createdAt) > new Date(endDate + 'T23:59:59')) return;
      setData((prev) =>
        prev
          ? { ...prev, logs: [log, ...prev.logs.slice(0, 49)], total: prev.total + 1 }
          : prev
      );
    };
    socket.on('activity:new', handler);
    return () => { socket.off('activity:new', handler); };
  }, [page, entityTypeFilter, startDate, endDate]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-white">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Activity Log</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">All admin-visible actions including login/logout, campaigns, and influencers</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={entityTypeFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Types</option>
          <option value="Campaign">Campaign</option>
          <option value="Influencer">Influencer</option>
          <option value="Brand">Brand</option>
          <option value="Authentication">Login/Logout</option>
        </select>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleDateChange('start', e.target.value)}
            className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => handleDateChange('end', e.target.value)}
            className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              title="Clear dates"
            >
              ✕
            </button>
          )}
        </div>

        {data && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {data.total} {entityTypeFilter ? `${entityTypeFilter} ` : ''}event{data.total !== 1 ? 's' : ''}
          </span>
        )}

        {data && data.total > 0 && (
          <button
            onClick={handleDeleteLogs}
            disabled={deleting}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {deleting ? 'Deleting...' : `Delete ${data.total} log${data.total !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data || data.logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <svg className="w-12 h-12 mb-3 text-gray-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No activity yet</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[1fr_1.5fr_1fr_1fr_120px] gap-4 px-6 py-3 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/80 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              <span>Time</span>
              <span>Action</span>
              <span>Entity</span>
              <span>By</span>
              <span>Role</span>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {data.logs.map((log) => (
                <div
                  key={log.id}
                  className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_1fr_1fr_120px] gap-2 md:gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  {/* Time */}
                  <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    <span className="font-medium text-gray-600 dark:text-gray-300 text-sm block">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>

                  {/* Action */}
                  <div>
                    <span className={`font-semibold text-sm ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </div>

                  {/* Entity */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${entityTypeColors[log.entityType] || 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400'}`}>
                      {log.entityType}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[140px]" title={log.entityName}>
                      {log.entityName}
                    </span>
                  </div>

                  {/* By */}
                  <div className="text-sm">
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {log.user?.name || log.user?.email || 'Unknown'}
                    </span>
                  </div>

                  {/* Role badge */}
                  <div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 font-medium">
                      {log.user?.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {data.page} of {data.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
            disabled={page >= data.pages}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
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
