import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';
import { Loading3DCube } from '../components/Loading3D';
import CampaignTrendsChart from '../components/CampaignTrendsChart';

interface AnalyticsData {
  totalInfluencers: number;
  totalCampaigns: number;
  tiers: { nano: number; micro: number; macro: number; mega: number };
  statusCount: Record<string, number>;
  topGenres: { genre: string; count: number }[];
  monthlyData: { month: string; count: number }[];
  monthlyInfluencers: { month: string; count: number }[];
}

interface EmployeeStat {
  id: string;
  name: string | null;
  email: string;
  designation?: string | null;
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
  completed: number;
}

type HeadStat = EmployeeStat;

function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-24 text-right flex-shrink-0 truncate">{d.label}</span>
          <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-5 relative overflow-hidden">
            <div
              className={`h-full rounded-full ${color} bar-3d transition-all duration-700`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-8 flex-shrink-0">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="perspective-800">
      <div className={`${color} rounded-xl p-4 flex flex-col gap-1 transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-lg cursor-default`}>
        <p className="text-xs font-medium text-current opacity-70 uppercase tracking-wide">{label}</p>
        <p className="text-3xl font-bold">{value}</p>
        {sub && <p className="text-xs opacity-60">{sub}</p>}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refetchTick, setRefetchTick] = useState(0);
  const [empStats, setEmpStats] = useState<EmployeeStat[]>([]);
  const [headStats, setHeadStats] = useState<HeadStat[]>([]);
  const [empStatsLoaded, setEmpStatsLoaded] = useState(false);
  const [headStatsLoaded, setHeadStatsLoaded] = useState(false);

  const userRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return null; } })();

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load analytics'); setLoading(false); });
  }, [refetchTick]);

  useEffect(() => {
    if (userRole !== 'ADMIN') { setEmpStatsLoaded(true); return; }
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/assignments/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setEmpStats(d); setEmpStatsLoaded(true); })
      .catch(() => { setEmpStatsLoaded(true); });
  }, [refetchTick, userRole]);

  useEffect(() => {
    if (userRole !== 'ADMIN') { setHeadStatsLoaded(true); return; }
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/assignments/head-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setHeadStats(d); setHeadStatsLoaded(true); })
      .catch(() => { setHeadStatsLoaded(true); });
  }, [refetchTick, userRole]);

  // Live sync: refresh when influencers, campaigns, or brands change
  useEffect(() => {
    const socket = io(API_URL);
    const refresh = () => setRefetchTick((t) => t + 1);
    ['influencer:created', 'influencer:updated', 'influencer:deleted',
     'campaign:created', 'campaign:updated', 'campaign:deleted',
     'brand:created', 'brand:updated', 'brand:deleted'].forEach((e) => socket.on(e, refresh));
    return () => {
      ['influencer:created', 'influencer:updated', 'influencer:deleted',
       'campaign:created', 'campaign:updated', 'campaign:deleted',
       'brand:created', 'brand:updated', 'brand:deleted'].forEach((e) => socket.off(e, refresh));
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading3DCube size={40} color="bg-indigo-500" label="Loading analytics..." />
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-red-500">{error || 'No data'}</div>;
  }

  const tierData = [
    { label: 'Nano (<10K)', value: data.tiers.nano },
    { label: 'Micro (10K–100K)', value: data.tiers.micro },
    { label: 'Macro (100K–1M)', value: data.tiers.macro },
    { label: 'Mega (1M+)', value: data.tiers.mega },
  ];

  const statusData = Object.entries(data.statusCount)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  const statusColors: Record<string, string> = {
    Active: 'text-green-600',
    Upcoming: 'text-yellow-600',
    Completed: 'text-gray-500',
    Draft: 'text-purple-600',
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Analytics</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Platform-wide overview</p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Influencers" value={data.totalInfluencers} color="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100" />
        <StatCard label="Total Campaigns" value={data.totalCampaigns} color="bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100" />
        <StatCard label="Active Campaigns" value={data.statusCount['Active'] || 0} color="bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-100" />
        <StatCard label="Awaiting Approval" value={data.statusCount['Draft'] || 0} sub="Draft campaigns" color="bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Influencer Tier Breakdown */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Influencer Tiers</h2>
          <BarChart data={tierData} color="bg-indigo-500" />
        </div>

        {/* Campaign Status Breakdown */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Campaigns by Status</h2>
          <div className="space-y-3">
            {statusData.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${statusColors[s.label] || 'text-gray-600 dark:text-gray-400'}`}>{s.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-gray-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        s.label === 'Active' ? 'bg-green-500' :
                        s.label === 'Upcoming' ? 'bg-yellow-500' :
                        s.label === 'Draft' ? 'bg-purple-500' : 'bg-gray-400'
                      }`}
                      style={{ width: `${(s.value / (data.totalCampaigns || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-8 text-right">{s.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Genres */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Top Genres</h2>
          <BarChart
            data={data.topGenres.map((g) => ({ label: g.genre, value: g.count }))}
            color="bg-pink-500"
          />
        </div>

        {/* Campaigns Created per Month */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Campaigns Created</h2>
          <p className="text-xs text-gray-400 mb-4">Last 6 months</p>
          <BarChart
            data={data.monthlyData.map((m) => ({ label: m.month, value: m.count }))}
            color="bg-blue-500"
          />
        </div>
      </div>

      {/* Influencers Added per Month */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Influencers Added</h2>
        <p className="text-xs text-gray-400 mb-4">Last 6 months</p>
        <div className="flex items-end gap-3 h-32">
          {data.monthlyInfluencers.map((m) => {
            const max = Math.max(...data.monthlyInfluencers.map((x) => x.count), 1);
            const pct = (m.count / max) * 100;
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{m.count}</span>
                <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-t-md relative overflow-hidden" style={{ height: '80px' }}>
                  <div
                    className="w-full bg-indigo-500 rounded-t-md bar-3d-vertical transition-all duration-700"
                    style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">{m.month}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Employee Performance — ADMIN only */}
      {userRole === 'ADMIN' && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Employee Performance</h2>
          {!empStatsLoaded ? (
            <div className="flex items-center justify-center py-8">
              <Loading3DCube size={24} color="bg-indigo-500" />
            </div>
          ) : empStats.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-6">No employee assignments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-zinc-800">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Employee</th>
                    <th className="text-center py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">Total</th>
                    <th className="text-center py-2 px-3 font-semibold text-green-600">Accepted</th>
                    <th className="text-center py-2 px-3 font-semibold text-red-500">Rejected</th>
                    <th className="text-center py-2 px-3 font-semibold text-yellow-500">Pending</th>
                    <th className="text-center py-2 px-3 font-semibold text-blue-500">Completed</th>
                    <th className="text-left py-2 pl-4 font-semibold text-gray-500 dark:text-gray-400">Acceptance Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {empStats.map((emp) => {
                    const rate = emp.total > 0 ? Math.round((emp.accepted / emp.total) * 100) : 0;
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/40">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-900 dark:text-white">{emp.name || emp.email}</p>
                          {emp.designation && <p className="text-xs text-gray-400">{emp.designation}</p>}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-gray-700 dark:text-gray-300">{emp.total}</td>
                        <td className="py-3 px-3 text-center font-semibold text-green-600">{emp.accepted}</td>
                        <td className="py-3 px-3 text-center font-semibold text-red-500">{emp.rejected}</td>
                        <td className="py-3 px-3 text-center font-semibold text-yellow-500">{emp.pending}</td>
                        <td className="py-3 px-3 text-center font-semibold text-blue-500">{emp.completed}</td>
                        <td className="py-3 pl-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${rate}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-9 text-right">{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Heads Performance — ADMIN only */}
      {userRole === 'ADMIN' && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Heads Performance</h2>
          {!headStatsLoaded ? (
            <div className="flex items-center justify-center py-8">
              <Loading3DCube size={24} color="bg-indigo-500" />
            </div>
          ) : headStats.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-6">No heads assigned to campaigns yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-zinc-800">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Head</th>
                    <th className="text-center py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">Total</th>
                    <th className="text-center py-2 px-3 font-semibold text-green-600">Accepted</th>
                    <th className="text-center py-2 px-3 font-semibold text-red-500">Rejected</th>
                    <th className="text-center py-2 px-3 font-semibold text-yellow-500">Pending</th>
                    <th className="text-center py-2 px-3 font-semibold text-blue-500">Completed</th>
                    <th className="text-left py-2 pl-4 font-semibold text-gray-500 dark:text-gray-400">Acceptance Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {headStats.map((head) => {
                    const rate = head.total > 0 ? Math.round((head.accepted / head.total) * 100) : 0;
                    return (
                      <tr key={head.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/40">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-900 dark:text-white">{head.name || head.email}</p>
                          {head.designation && <p className="text-xs text-gray-400">{head.designation}</p>}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-gray-700 dark:text-gray-300">{head.total}</td>
                        <td className="py-3 px-3 text-center font-semibold text-green-600">{head.accepted}</td>
                        <td className="py-3 px-3 text-center font-semibold text-red-500">{head.rejected}</td>
                        <td className="py-3 px-3 text-center font-semibold text-yellow-500">{head.pending}</td>
                        <td className="py-3 px-3 text-center font-semibold text-blue-500">{head.completed}</td>
                        <td className="py-3 pl-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${rate}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-9 text-right">{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Campaign Trends Chart */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-gray-200 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Campaign Trends</h2>
        <CampaignTrendsChart />
      </div>
    </div>
  );
}
