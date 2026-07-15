import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';

interface InfluencerTierData {
  tier: string;
  count: number;
  percentage: number;
}

interface ChartProps {
  className?: string;
}

export default function InfluencerTierChart({ className = '' }: ChartProps) {
  const [data, setData] = useState<InfluencerTierData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/analytics`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();

        // Process influencer tier data
        if (result.influencerTierBreakdown) {
          const tiers = result.influencerTierBreakdown;
          const total = tiers.reduce((sum: number, tier: any) => sum + tier.count, 0);
          const processed = tiers.map((tier: any) => ({
            tier: tier.tier,
            count: tier.count,
            percentage: total > 0 ? Math.round((tier.count / total) * 100) : 0,
          }));
          setData(processed);
        }
      } catch (error) {
        console.error('Failed to fetch influencer tier data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="animate-spin text-gray-400">Loading chart...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 text-gray-400 ${className}`}>
        No influencer data available
      </div>
    );
  }

  // Simple bar chart using CSS
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className={`w-full ${className}`}>
      <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Influencer Tier Distribution</h3>
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.tier} className="flex items-center gap-4">
            <div className="w-20 font-medium text-sm text-gray-600 dark:text-gray-400">{item.tier}</div>
            <div className="flex-1">
              <div className="w-full bg-gray-200 dark:bg-zinc-800 rounded-full h-6 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 flex items-center justify-end pr-2"
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                >
                  {item.count > 0 && <span className="text-xs font-bold text-white">{item.count}</span>}
                </div>
              </div>
            </div>
            <div className="w-12 text-right font-medium text-sm text-gray-600 dark:text-gray-400">
              {item.percentage}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
