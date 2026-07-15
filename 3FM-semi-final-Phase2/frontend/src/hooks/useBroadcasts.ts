import { useState, useCallback } from 'react';

export interface BroadcastMessage {
  id: string;
  title: string;
  content: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  createdBy: { id: string; name: string };
  read: boolean;
  createdAt: string;
}

interface UseBroadcastsProps {
  apiBaseUrl?: string;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Hook for managing broadcasts
 * Fetches broadcasts and tracks read status
 */
export function useBroadcasts({ apiBaseUrl = '/api' }: UseBroadcastsProps = {}) {
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBroadcasts = useCallback(
    async (limit: number = 20, unreadOnly: boolean = false) => {
      setLoading(true);
      setError(null);

      try {
        const url = new URL(`${apiBaseUrl}/broadcasts`, window.location.origin);
        url.searchParams.set('limit', limit.toString());
        url.searchParams.set('unreadOnly', unreadOnly.toString());

        const response = await fetch(url.toString(), {
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch broadcasts');
        }

        const data = await response.json();
        setBroadcasts(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch broadcasts');
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl]
  );

  const markAsRead = useCallback(
    async (broadcastId: string) => {
      try {
        const response = await fetch(`${apiBaseUrl}/broadcasts/${broadcastId}/read`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error('Failed to mark as read');
        }

        setBroadcasts((prev) =>
          prev.map((b) =>
            b.id === broadcastId ? { ...b, read: true } : b
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to mark as read');
      }
    },
    [apiBaseUrl]
  );

  const deleteBroadcast = useCallback(
    async (broadcastId: string) => {
      try {
        const response = await fetch(`${apiBaseUrl}/broadcasts/${broadcastId}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error('Failed to delete broadcast');
        }

        setBroadcasts((prev) => prev.filter((b) => b.id !== broadcastId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete broadcast');
      }
    },
    [apiBaseUrl]
  );

  return {
    broadcasts,
    loading,
    error,
    fetchBroadcasts,
    markAsRead,
    deleteBroadcast,
  };
}
