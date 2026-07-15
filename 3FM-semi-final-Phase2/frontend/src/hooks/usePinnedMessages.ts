import { useState, useEffect } from 'react';

export interface PinnedMessageData {
  id: string;
  messageText: string;
  messageAuthorId: string;
  messageAuthorName: string;
  originalMessageId: string;
  pinnedById: string;
  pinnedUser: { id: string; name: string };
  pinReason?: string | null;
  createdAt: string;
}

interface UsePinnedMessagesProps {
  conversationId: string;
  isGroup: boolean;
  apiBaseUrl?: string;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function usePinnedMessages({ conversationId, isGroup, apiBaseUrl = '/api' }: UsePinnedMessagesProps) {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPinnedMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = isGroup
        ? `${apiBaseUrl}/groups/${conversationId}/pinned`
        : `${apiBaseUrl}/dm/conversations/${conversationId}/pinned`;

      const response = await fetch(endpoint, { headers: getAuthHeaders() });

      if (!response.ok) throw new Error('Failed to fetch pinned messages');

      const data = await response.json();
      setPinnedMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPinnedMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const pinMessage = async (
    messageId: string,
    messageText: string,
    messageAuthorId: string,
    messageAuthorName: string,
    reason?: string
  ) => {
    try {
      const endpoint = isGroup
        ? `${apiBaseUrl}/groups/${conversationId}/pin`
        : `${apiBaseUrl}/dm/conversations/${conversationId}/pin`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ messageId, messageText, messageAuthorId, messageAuthorName, reason }),
      });

      if (!response.ok) throw new Error('Failed to pin message');

      const pinnedMessage = await response.json();
      setPinnedMessages((prev) => [pinnedMessage, ...prev]);
      return pinnedMessage;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pin message');
      throw err;
    }
  };

  const unpinMessage = async (pinId: string) => {
    try {
      const endpoint = isGroup
        ? `${apiBaseUrl}/groups/${conversationId}/pin/${pinId}`
        : `${apiBaseUrl}/dm/conversations/${conversationId}/pin/${pinId}`;

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to unpin message');

      setPinnedMessages((prev) => prev.filter((msg) => msg.id !== pinId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpin message');
      throw err;
    }
  };

  // Auto-fetch on mount and when conversation changes
  useEffect(() => {
    if (conversationId) fetchPinnedMessages();
  }, [conversationId, isGroup]);

  return { pinnedMessages, loading, error, fetchPinnedMessages, pinMessage, unpinMessage };
}
