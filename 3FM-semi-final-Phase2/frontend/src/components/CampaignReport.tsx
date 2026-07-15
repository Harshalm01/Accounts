import { useState } from 'react';
import { API_URL } from '../config';

interface Campaign {
  id: string;
  name: string;
  brandName: string;
  status: string;
  startDate: string;
  endDate?: string;
  budget?: number;
  internalCost: number;
  externalCost: number;
  brief?: string;
  influencers: any[];
  userId?: string;
}

interface CampaignReportProps {
  isOpen: boolean;
  onClose: () => void;
  campaigns: Campaign[];
  selectedIds?: string[];
}

export default function CampaignReport({ isOpen, onClose, campaigns, selectedIds }: CampaignReportProps) {
  const [exporting, setExporting] = useState(false);

  if (!isOpen) return null;

  // Calculate statistics
  const activeCount = campaigns.filter(c => c.status === 'Active').length;
  const upcomingCount = campaigns.filter(c => c.status === 'Upcoming').length;
  const completedCount = campaigns.filter(c => c.status === 'Completed').length;
  const totalBudget = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);
  const totalInfluencers = campaigns.reduce((sum, c) => sum + (c.influencers?.length || 0), 0);
  const totalInternalCost = campaigns.reduce((sum, c) => sum + (c.internalCost || 0), 0);
  const totalExternalCost = campaigns.reduce((sum, c) => sum + (c.externalCost || 0), 0);

  const handleExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const ids = selectedIds || campaigns.map(c => c.id);
      const params = ids.length ? `?ids=${ids.join(',')}&format=${format}` : `?format=${format}`;
      const res = await fetch(`${API_URL}/api/campaigns/export${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign_report_${campaigns.length}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-8 py-6 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Campaign Report</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Generated on {new Date().toLocaleString()}</p>
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

        {/* Content */}
        <div className="p-8 space-y-8">
          {/* Summary Statistics */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Summary Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
                <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">Total Campaigns</p>
                <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{campaigns.length}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">Active</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{activeCount}</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Upcoming</p>
                <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{upcomingCount}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Completed</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{completedCount}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Influencers</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{totalInfluencers}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Total Budget</p>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">${totalBudget.toLocaleString()}</p>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="mt-4 bg-gray-50 dark:bg-zinc-800 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Cost Breakdown</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Internal Cost</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">${totalInternalCost.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">External Cost</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">${totalExternalCost.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Total Cost</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">${(totalInternalCost + totalExternalCost).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Campaign List */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Campaigns</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {campaigns.map((campaign, idx) => (
                <div
                  key={campaign.id}
                  className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-4 border border-gray-200 dark:border-zinc-700"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white">{idx + 1}. {campaign.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{campaign.brandName}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      campaign.status === 'Active' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' :
                      campaign.status === 'Upcoming' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' :
                      'bg-gray-100 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300'
                    }`}>
                      {campaign.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Start Date</p>
                      <p className="font-medium text-gray-900 dark:text-white">{new Date(campaign.startDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">End Date</p>
                      <p className="font-medium text-gray-900 dark:text-white">{campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Budget</p>
                      <p className="font-medium text-gray-900 dark:text-white">${(campaign.budget || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Influencers</p>
                      <p className="font-medium text-gray-900 dark:text-white">{campaign.influencers?.length || 0}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer with Export Buttons */}
        <div className="sticky bottom-0 flex justify-end gap-3 px-8 py-4 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800">
          <button
            onClick={() => handleExport('xlsx')}
            disabled={exporting}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
            </svg>
            {exporting ? 'Exporting...' : 'Excel'}
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-8-6z" />
            </svg>
            {exporting ? 'Exporting...' : 'CSV'}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-3 0-2-2zm13-5h-8v-2h8v2zm0-4h-8V7h8v2zM7 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
            {exporting ? 'Exporting...' : 'PDF'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
