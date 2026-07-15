import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { API_URL } from '../config';

interface QRCodeData {
  id: string;
  code: string;
  campaignId: string;
  influencerId: string;
  scanCount: number;
  uniqueScans: number;
  influencer?: { firstName: string; lastName: string };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
}

export default function QRCodePanel({ isOpen, onClose, campaignId, campaignName }: Props) {
  const [qrCodes, setQrCodes] = useState<QRCodeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const getToken = () => localStorage.getItem('token') || '';

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/qr/stats/${campaignId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQrCodes(data);
      }
    } catch (err) {
      console.error('Failed to fetch QR stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchStats();
  }, [isOpen, campaignId]);

  const handleGenerateAll = async () => {
    setGenerating(true);
    try {
      // First get campaign influencers
      const campRes = await fetch(`${API_URL}/api/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!campRes.ok) return;
      const campaign = await campRes.json();
      const influencerIds = (campaign.influencers || []).map((ci: any) => ci.influencerId);

      if (influencerIds.length === 0) return;

      const res = await fetch(`${API_URL}/api/qr/generate-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ campaignId, influencerIds }),
      });
      if (res.ok) {
        await fetchStats();
      }
    } catch (err) {
      console.error('Failed to generate QR codes:', err);
    } finally {
      setGenerating(false);
    }
  };

  const getQrUrl = (code: string) => `${API_URL}/api/qr/scan/${code}`;

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(getQrUrl(code));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">QR Codes</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{campaignName}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateAll}
              disabled={generating}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {generating ? 'Generating...' : 'Generate All QR Codes'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : qrCodes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 mb-4">No QR codes generated yet for this campaign.</p>
              <p className="text-sm text-gray-500">Click "Generate All QR Codes" to create QR codes for each influencer.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {qrCodes.map((qr) => (
                <div key={qr.id} className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4 flex flex-col items-center gap-3 border border-gray-200 dark:border-zinc-700">
                  <div className="bg-white p-2 rounded-lg">
                    <QRCodeSVG value={getQrUrl(qr.code)} size={120} />
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white text-center">
                    {qr.influencer?.firstName} {qr.influencer?.lastName}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span title="Total scans">{qr.scanCount} scans</span>
                    <span className="text-gray-300 dark:text-zinc-600">|</span>
                    <span title="Unique scans">{qr.uniqueScans} unique</span>
                  </div>
                  <button
                    onClick={() => copyLink(qr.code)}
                    className="text-xs text-indigo-500 hover:text-indigo-400 transition-colors"
                  >
                    Copy Link
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer stats */}
        {qrCodes.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>{qrCodes.length} QR codes</span>
            <span>
              Total: {qrCodes.reduce((s, q) => s + q.scanCount, 0)} scans ({qrCodes.reduce((s, q) => s + q.uniqueScans, 0)} unique)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
