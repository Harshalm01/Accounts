import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';

interface BudgetData {
  campaignName: string;
  budget: number;
  spent: number;
  utilization: number;
}

interface ChartProps {
  className?: string;
  limit?: number;
}

export default function BudgetChart({ className = '', limit = 5 }: ChartProps) {
  const [data, setData] = useState<BudgetData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/campaigns`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const campaigns = await response.json();

        // Calculate budget utilization
        const budgetData = campaigns
          .filter((c: any) => c.budget && c.budget > 0)
          .map((c: any) => ({
            campaignName: c.name,
            budget: c.budget,
            spent: (c.internalCost || 0) + (c.externalCost || 0),
            utilization: Math.round(((c.internalCost + c.externalCost) / c.budget) * 100),
          }))
          .sort((a: BudgetData, b: BudgetData) => b.spent - a.spent)
          .slice(0, limit);

        setData(budgetData);
      } catch (error) {
        console.error('Failed to fetch budget data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [limit]);

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
        No budget data available
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Budget Utilization</h3>
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.campaignName} className="group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{item.campaignName}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                item.utilization > 80
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  : item.utilization > 60
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                    : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              }`}>
                {item.utilization}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  item.utilization > 80
                    ? 'bg-red-500'
                    : item.utilization > 60
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(item.utilization, 100)}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              ₹{item.spent.toLocaleString()} / ₹{item.budget.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
