import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';

interface MonthData {
  month: string;
  count: number;
}

interface ChartProps {
  className?: string;
}

export default function CampaignTrendsChart({ className = '' }: ChartProps) {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/analytics`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();

        // Process monthly campaign data
        if (result.monthlyAdditionRate) {
          const processed = result.monthlyAdditionRate.map((item: any) => ({
            month: item.month,
            count: item.count || 0,
          }));
          setData(processed.slice(-6)); // Last 6 months
        }
      } catch (error) {
        console.error('Failed to fetch campaign trends:', error);
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
        No campaign trend data available
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className={`w-full ${className}`}>
      <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Monthly Campaign Trends</h3>
      <div className="flex items-end gap-2 h-40">
        {data.map((item) => (
          <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 h-4">{item.count}</div>
            <div
              className="w-full bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t-lg transition-all duration-300 hover:from-emerald-600 hover:to-emerald-500 cursor-pointer group relative"
              style={{ height: `${(item.count / maxCount) * 100}%` || '2px' }}
            >
              {/* Tooltip */}
              <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                {item.count} campaigns
              </div>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 text-center">{item.month}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
