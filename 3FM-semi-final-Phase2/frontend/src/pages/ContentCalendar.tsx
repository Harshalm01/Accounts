import { useState, useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';

interface CalendarEntry {
  id: string;
  liveDate: string;
  type: 'liveDate' | 'deadline';
  influencer: { id: string; firstName: string; lastName: string; primaryGenre: string } | null;
  campaign: { id: string; name: string; brandName: string; status: string; endDate?: string | null };
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Deterministic color from campaign ID
function campaignColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 48%)`;
}

function campaignBg(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 95%)`;
}

// ── Timeline Scrubber ─────────────────────────────────────────────────────────

interface TimelineScrubberProps {
  year: number;
  month: number;
  densityCache: Record<string, number>;
  onNavigate: (month: number) => void;
}

function TimelineScrubber({ year, month, densityCache, onNavigate }: TimelineScrubberProps) {
  const isDragging = useRef(false);
  const densityValues = MONTHS.map((_, i) => densityCache[`${year}-${i + 1}`] ?? 0);
  const maxDensity = Math.max(...densityValues, 1);

  const seekToPointer = (clientX: number, container: HTMLElement) => {
    const rect = container.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetMonth = Math.max(1, Math.min(12, Math.round(ratio * 11) + 1));
    if (targetMonth !== month) onNavigate(targetMonth);
  };

  return (
    <div
      className="relative w-full h-14 bg-gray-100 dark:bg-zinc-800 rounded-xl mb-4 select-none touch-none cursor-pointer overflow-hidden"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); isDragging.current = true; seekToPointer(e.clientX, e.currentTarget); }}
      onPointerMove={(e) => { if (isDragging.current) seekToPointer(e.clientX, e.currentTarget); }}
      onPointerUp={() => { isDragging.current = false; }}
      onPointerCancel={() => { isDragging.current = false; }}
    >
      {/* Active month highlight thumb */}
      <div
        className="absolute top-0 bottom-0 border-2 border-indigo-500 rounded-xl bg-indigo-500/10 pointer-events-none transition-[left] duration-150"
        style={{ left: `${((month - 1) / 12) * 100}%`, width: `${(1 / 12) * 100}%` }}
      />
      {/* Density bars */}
      <div className="absolute inset-0 flex items-end pb-5">
        {MONTHS.map((_, i) => {
          const m = i + 1;
          const barPx = Math.max(2, (densityValues[i] / maxDensity) * 22);
          return (
            <div key={m} className="flex-1 flex justify-center items-end">
              <div
                className={`w-2/3 rounded-t transition-all duration-300 ${
                  m === month
                    ? 'bg-indigo-500'
                    : densityValues[i] > 0
                      ? 'bg-gray-400 dark:bg-zinc-500'
                      : 'bg-gray-200 dark:bg-zinc-700'
                }`}
                style={{ height: `${barPx}px` }}
              />
            </div>
          );
        })}
      </div>
      {/* Month labels */}
      <div className="absolute bottom-0 left-0 right-0 flex">
        {MONTHS.map((label, i) => (
          <div
            key={i}
            className={`flex-1 text-center text-[10px] font-medium pb-1 transition-colors ${
              i + 1 === month
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ContentCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  // Filters
  const [filterCampaignId, setFilterCampaignId] = useState('');
  const [filterInfluencer, setFilterInfluencer] = useState('');

  // Animation + scrubber state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');
  const [densityCache, setDensityCache] = useState<Record<string, number>>({});

  // Edit state
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [editLiveDate, setEditLiveDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    setLoading(true);
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/analytics/calendar?year=${year}&month=${month}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setEntries(arr);
        setDensityCache(prev => ({
          ...prev,
          [`${year}-${month}`]: arr.filter((e: CalendarEntry) => e.type === 'liveDate').length,
        }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year, month, refetchTick]);

  // Live sync
  useEffect(() => {
    const socket = io(API_URL);
    const refresh = () => setRefetchTick((t) => t + 1);
    socket.on('campaign:created', refresh);
    socket.on('campaign:updated', refresh);
    socket.on('campaign:deleted', refresh);
    socket.on('campaign:influencer:added', refresh);
    socket.on('campaign:influencer:removed', refresh);
    socket.on('campaign:influencers:added', refresh);
    socket.on('campaign:influencer:updated', refresh);
    return () => {
      socket.off('campaign:created', refresh);
      socket.off('campaign:updated', refresh);
      socket.off('campaign:deleted', refresh);
      socket.off('campaign:influencer:added', refresh);
      socket.off('campaign:influencer:removed', refresh);
      socket.off('campaign:influencers:added', refresh);
      socket.off('campaign:influencer:updated', refresh);
    };
  }, []);

  const navigateToMonth = (newMonth: number, newYear: number = year) => {
    const forward = newYear > year || (newYear === year && newMonth > month);
    setSlideDirection(forward ? 'right' : 'left');
    setIsTransitioning(true);
    setTimeout(() => {
      setYear(newYear);
      setMonth(newMonth);
      setSelectedDay(null);
      setIsTransitioning(false);
    }, 150);
  };

  const prevMonth = () => {
    if (month === 1) navigateToMonth(12, year - 1);
    else navigateToMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) navigateToMonth(1, year + 1);
    else navigateToMonth(month + 1);
  };

  // Unique campaigns for filter dropdown
  const uniqueCampaigns = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (!map.has(e.campaign.id)) map.set(e.campaign.id, e.campaign.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [entries]);

  // Filtered live date entries (deadlines always shown)
  const liveDateEntries = useMemo(() =>
    entries.filter((e) => {
      if (e.type !== 'liveDate') return false;
      if (filterCampaignId && e.campaign.id !== filterCampaignId) return false;
      if (filterInfluencer && e.influencer) {
        const name = `${e.influencer.firstName} ${e.influencer.lastName}`.toLowerCase();
        if (!name.includes(filterInfluencer.toLowerCase())) return false;
      }
      return true;
    }),
    [entries, filterCampaignId, filterInfluencer]
  );

  const deadlineEntries = useMemo(() =>
    entries.filter((e) => e.type === 'deadline'),
    [entries]
  );

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // Group by day
  const byDay: Record<number, CalendarEntry[]> = {};
  for (const entry of liveDateEntries) {
    const d = new Date(entry.liveDate).getDate();
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(entry);
  }

  const deadlinesByDay: Record<number, CalendarEntry[]> = {};
  for (const entry of deadlineEntries) {
    const d = new Date(entry.liveDate).getDate();
    if (!deadlinesByDay[d]) deadlinesByDay[d] = [];
    deadlinesByDay[d].push(entry);
  }

  const todayDay = today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : null;

  const selectedLiveEntries = selectedDay ? (byDay[selectedDay] || []) : [];
  const selectedDeadlines = selectedDay ? (deadlinesByDay[selectedDay] || []) : [];

  const handleStartEdit = (entry: CalendarEntry) => {
    setEditingEntry(entry);
    setEditLiveDate(entry.liveDate ? entry.liveDate.slice(0, 10) : '');
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || !editingEntry.influencer) return;
    setSavingEdit(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(
        `${API_URL}/api/campaigns/${editingEntry.campaign.id}/influencers/${editingEntry.influencer.id}/details`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ liveDate: editLiveDate || null }),
        }
      );
      setEditingEntry(null);
      setRefetchTick((t) => t + 1);
    } catch (err) {
      console.error('Failed to update live date:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  const exportToCSV = () => {
    const rows = [
      ['Date', 'Influencer', 'Genre', 'Campaign', 'Brand', 'Status'],
      ...liveDateEntries
        .sort((a, b) => new Date(a.liveDate).getTime() - new Date(b.liveDate).getTime())
        .map((e) => [
          new Date(e.liveDate).toLocaleDateString(),
          e.influencer ? `${e.influencer.firstName} ${e.influencer.lastName}` : '',
          e.influencer?.primaryGenre || '',
          e.campaign.name,
          e.campaign.brandName,
          e.campaign.status,
        ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendar_${MONTHS[month - 1]}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const userRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return null; } })();
  const canEdit = userRole === 'ADMIN' || userRole === 'AGENCY' || userRole === 'EMPLOYEE';

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Content Calendar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Influencer live dates across all campaigns</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* CSV export */}
          <button
            onClick={exportToCSV}
            className="px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          {/* Month navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="p-2 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-base font-semibold text-gray-900 dark:text-white min-w-[130px] text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Timeline Scrubber */}
      <TimelineScrubber
        year={year}
        month={month}
        densityCache={densityCache}
        onNavigate={(m) => navigateToMonth(m)}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterCampaignId}
          onChange={(e) => setFilterCampaignId(e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Campaigns</option>
          {uniqueCampaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter by influencer name..."
          value={filterInfluencer}
          onChange={(e) => setFilterInfluencer(e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[200px]"
        />
        {(filterCampaignId || filterInfluencer) && (
          <button
            onClick={() => { setFilterCampaignId(''); setFilterInfluencer(''); }}
            className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar grid */}
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-zinc-800">
              {DAYS.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div
              key={`${year}-${month}`}
              className={`grid grid-cols-7 transition-all duration-150 ease-out ${
                isTransitioning
                  ? slideDirection === 'right'
                    ? 'opacity-0 translate-x-6'
                    : 'opacity-0 -translate-x-6'
                  : 'opacity-100 translate-x-0'
              }`}
            >
              {/* Empty offset cells */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[80px] border-r border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayEntries = byDay[day] || [];
                const dayDeadlines = deadlinesByDay[day] || [];
                const isToday = day === todayDay;
                const isSelected = day === selectedDay;

                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`min-h-[80px] border-r border-b border-gray-100 dark:border-zinc-800 p-1.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {day}
                    </div>

                    {/* Deadline chips */}
                    {dayDeadlines.map((e) => (
                      <div
                        key={e.id}
                        className="text-[9px] px-1 py-0.5 mb-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 truncate font-semibold"
                        title={`Deadline: ${e.campaign.name}`}
                      >
                        ⚑ {e.campaign.name}
                      </div>
                    ))}

                    {/* Live date chips with campaign color dot */}
                    {dayEntries.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className="text-[10px] px-1 py-0.5 mb-0.5 rounded border truncate flex items-center gap-1"
                        style={{
                          backgroundColor: campaignBg(e.campaign.id),
                          borderColor: campaignColor(e.campaign.id) + '40',
                          color: campaignColor(e.campaign.id),
                        }}
                        title={`${e.influencer?.firstName} ${e.influencer?.lastName} · ${e.campaign.name}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: campaignColor(e.campaign.id) }}
                        />
                        <span className="truncate">
                          {e.influencer?.firstName} · {e.campaign.brandName}
                        </span>
                      </div>
                    ))}
                    {dayEntries.length > 2 && (
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 px-1">
                        +{dayEntries.length - 2} more
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            {selectedDay ? (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {MONTHS[month - 1]} {selectedDay}
                  </h3>
                  <button onClick={() => setSelectedDay(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Deadlines for selected day */}
                {selectedDeadlines.length > 0 && (
                  <div className="mb-3">
                    {selectedDeadlines.map((e) => (
                      <div key={e.id} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5 mb-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">Campaign Deadline</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{e.campaign.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{e.campaign.brandName}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedLiveEntries.length === 0 && selectedDeadlines.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No activity on this day.</p>
                ) : selectedLiveEntries.length === 0 ? null : (
                  <div className="space-y-3">
                    {selectedLiveEntries.map((e) => (
                      <div
                        key={e.id}
                        className="border border-gray-100 dark:border-zinc-800 rounded-lg p-3 relative"
                        style={{ borderLeftWidth: '3px', borderLeftColor: campaignColor(e.campaign.id) }}
                      >
                        {/* Edit live date form */}
                        {editingEntry?.id === e.id ? (
                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {e.influencer?.firstName} {e.influencer?.lastName}
                            </p>
                            <input
                              type="date"
                              value={editLiveDate}
                              onChange={(ev) => setEditLiveDate(ev.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveEdit}
                                disabled={savingEdit}
                                className="flex-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold disabled:opacity-50"
                              >
                                {savingEdit ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingEntry(null)}
                                className="px-3 py-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {e.influencer?.firstName} {e.influencer?.lastName}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{e.influencer?.primaryGenre}</p>
                              </div>
                              {canEdit && (
                                <button
                                  onClick={() => handleStartEdit(e)}
                                  className="p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex-shrink-0"
                                  title="Edit live date"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{e.campaign.name}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{e.campaign.brandName}</p>
                              </div>
                              <span
                                className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: campaignBg(e.campaign.id), color: campaignColor(e.campaign.id) }}
                              >
                                {e.campaign.status}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">This Month</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Total live dates</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{liveDateEntries.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Days with activity</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{Object.keys(byDay).length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Influencers going live</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {new Set(liveDateEntries.map((e) => e.influencer?.id).filter(Boolean)).size}
                      </span>
                    </div>
                    {deadlineEntries.length > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Campaign deadlines</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{deadlineEntries.length}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Campaign color legend */}
                {uniqueCampaigns.length > 0 && (
                  <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Campaigns</h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {uniqueCampaigns.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setFilterCampaignId(filterCampaignId === c.id ? '' : c.id)}
                          className={`w-full flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 transition-colors text-left ${
                            filterCampaignId === c.id
                              ? 'bg-gray-100 dark:bg-zinc-800'
                              : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: campaignColor(c.id) }}
                          />
                          <span className="text-gray-700 dark:text-gray-300 truncate">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {liveDateEntries.length > 0 && (
                  <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Upcoming Live Dates</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {liveDateEntries
                        .sort((a, b) => new Date(a.liveDate).getTime() - new Date(b.liveDate).getTime())
                        .map((e) => (
                          <div key={e.id} className="flex items-start gap-3 text-sm">
                            <span
                              className="flex-shrink-0 text-xs font-semibold rounded px-1.5 py-0.5"
                              style={{ backgroundColor: campaignBg(e.campaign.id), color: campaignColor(e.campaign.id) }}
                            >
                              {new Date(e.liveDate).getDate()} {MONTHS[new Date(e.liveDate).getMonth()]}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 dark:text-gray-200 truncate">
                                {e.influencer?.firstName} {e.influencer?.lastName}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{e.campaign.name}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {liveDateEntries.length === 0 && deadlineEntries.length === 0 && !loading && (
        <div className="mt-4 text-center py-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl lg:hidden">
          <p className="text-gray-400 dark:text-gray-500 text-sm">No live dates scheduled for {MONTHS[month - 1]} {year}.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Set live dates on influencers inside a campaign to see them here.</p>
        </div>
      )}
    </div>
  );
}
