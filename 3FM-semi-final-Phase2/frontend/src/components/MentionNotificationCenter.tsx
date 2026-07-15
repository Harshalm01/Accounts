import { useState, useEffect } from 'react';
import { API_URL } from '../config';

interface Mention {
  id: string;
  context: string;
  isRead: boolean;
  createdAt: string;
  mentioner: {
    id: string;
    name: string;
    email: string;
  };
  campaign: {
    id: string;
    name: string;
  };
  statusUpdate?: {
    id: string;
    content: string;
  };
}

interface MentionNotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MentionNotificationCenter({
  isOpen,
  onClose,
}: MentionNotificationCenterProps) {
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const token = localStorage.getItem('token');

    fetch(`${API_URL}/api/mentions?page=${page}&limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { mentions: [], pages: 1 }))
      .then((data) => {
        setMentions(data.mentions || []);
        setTotalPages(data.pages || 1);
      })
      .catch((err) => {
        console.error('Failed to fetch mentions:', err);
        setMentions([]);
      })
      .finally(() => setLoading(false));
  }, [isOpen, page]);

  const handleMarkAsRead = async (mentionId: string) => {
    const token = localStorage.getItem('token');

    try {
      const res = await fetch(`${API_URL}/api/mentions/${mentionId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setMentions((prev) =>
          prev.map((m) => (m.id === mentionId ? { ...m, isRead: true } : m))
        );
      }
    } catch (err) {
      console.error('Failed to mark mention as read:', err);
    }
  };

  const handleDelete = async (mentionId: string) => {
    const token = localStorage.getItem('token');

    try {
      const res = await fetch(`${API_URL}/api/mentions/${mentionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setMentions((prev) => prev.filter((m) => m.id !== mentionId));
      }
    } catch (err) {
      console.error('Failed to delete mention:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mentions</h2>
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
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mentions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <svg className="w-12 h-12 mb-3 text-gray-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No mentions yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-zinc-800">
              {mentions.map((mention) => (
                <div
                  key={mention.id}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors ${
                    !mention.isRead ? 'bg-indigo-50 dark:bg-indigo-900/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">
                        <span className="text-indigo-600 dark:text-indigo-400">@{mention.mentioner.name}</span> mentioned you
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        in <span className="font-medium">{mention.campaign.name}</span>
                      </p>
                    </div>
                    {!mention.isRead && (
                      <div className="w-2 h-2 rounded-full bg-indigo-600 ml-2 mt-1" />
                    )}
                  </div>

                  {mention.context && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 italic">
                      "{mention.context.substring(0, 100)}{mention.context.length > 100 ? '...' : ''}"
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(mention.createdAt).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                      {!mention.isRead && (
                        <button
                          onClick={() => handleMarkAsRead(mention.id)}
                          className="text-xs px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                        >
                          Mark as Read
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(mention.id)}
                        className="text-xs px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-gray-200 dark:border-zinc-800">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
