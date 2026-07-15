import { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { io } from 'socket.io-client';

interface BroadcastMessage {
  id: string;
  title: string;
  content: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  createdBy: { id: string; name: string | null };
  read: boolean;
  createdAt: string;
  isPinned?: boolean;
  pinnedAt?: string;
}

interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean;
  users: string[];
}

const cardColors: Record<string, string> = {
  CRITICAL: 'border-l-4 border-red-500 bg-zinc-800/50 hover:bg-zinc-700/50',
  HIGH: 'border-l-4 border-orange-500 bg-zinc-800/50 hover:bg-zinc-700/50',
  NORMAL: 'border-l-4 border-blue-500 bg-zinc-800/50 hover:bg-zinc-700/50',
  LOW: 'border-l-4 border-gray-500 bg-zinc-800/50 hover:bg-zinc-700/50',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AnnouncementsFeed() {
  const [announcements, setAnnouncements] = useState<BroadcastMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [token] = useState(localStorage.getItem('token'));

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  // Setup Socket.IO listeners for real-time sync
  useEffect(() => {
    const socket = io(API_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });

    // Join personal room for user-specific broadcasts
    const userStr = localStorage.getItem('user');
    const userId = userStr ? JSON.parse(userStr).id : null;
    if (userId) socket.emit('join', userId);

    // Listen for new broadcasts
    socket.on('broadcast:new', (broadcast: BroadcastMessage) => {
      setAnnouncements((prev) => [broadcast, ...prev]);
    });

    // Listen for deleted broadcasts
    socket.on('broadcast:deleted', ({ broadcastId }: { broadcastId: string }) => {
      setAnnouncements((prev) => prev.filter((a) => a.id !== broadcastId));
    });

    // Listen for pinned/unpinned broadcasts
    socket.on('broadcast:pinned', ({ broadcastId }: { broadcastId: string }) => {
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === broadcastId ? { ...a, isPinned: true, pinnedAt: new Date().toISOString() } : a))
      );
    });

    socket.on('broadcast:unpinned', ({ broadcastId }: { broadcastId: string }) => {
      setAnnouncements((prev) => prev.map((a) => (a.id === broadcastId ? { ...a, isPinned: false, pinnedAt: undefined } : a)));
    });

    // Listen for reactions
    socket.on('broadcast:reaction-added', ({ broadcastId, reactions: updatedReactions }: any) => {
      setReactions((prev) => ({ ...prev, [broadcastId]: updatedReactions }));
    });

    socket.on('broadcast:reaction-removed', ({ broadcastId, reactions: updatedReactions }: any) => {
      setReactions((prev) => ({ ...prev, [broadcastId]: updatedReactions }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/broadcasts?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch announcements');
      const data = await response.json();
      setAnnouncements(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch announcements');
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (announcementId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/broadcasts/${announcementId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === announcementId ? { ...a, read: true } : a))
        );
      }
    } catch (err) {
      console.error('Failed to mark announcement as read:', err);
    }
  };

  const fetchReactions = async (broadcastId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/broadcasts/${broadcastId}/reactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setReactions((prev) => ({ ...prev, [broadcastId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch reactions:', err);
    }
  };

  const handleReaction = async (broadcastId: string, emoji: string) => {
    try {
      const response = await fetch(`${API_URL}/api/broadcasts/${broadcastId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emoji }),
      });

      if (response.ok) {
        const data = await response.json();
        setReactions((prev) => ({ ...prev, [broadcastId]: data.reactions || [] }));
      }
    } catch (err) {
      console.error('Failed to add reaction:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-zinc-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-zinc-400 font-medium">Loading announcements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto p-8">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-4xl">📢</div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Announcements
              </h1>
              <p className="text-zinc-400 mt-1">Stay informed with the latest updates</p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 flex items-start gap-3">
            <span className="text-xl mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold">Error</p>
              <p className="text-sm text-red-300/80">{error}</p>
            </div>
          </div>
        )}

        {/* Announcements List */}
        {announcements.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4 opacity-50">📭</div>
            <p className="text-zinc-400 text-xl">No announcements at the moment</p>
            <p className="text-zinc-600 text-sm mt-2">Check back later for updates</p>
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                onClick={() => {
                  setSelectedId(selectedId === announcement.id ? null : announcement.id);
                  if (selectedId !== announcement.id) {
                    fetchReactions(announcement.id);
                  }
                }}
                className={`group cursor-pointer transition-all duration-200 ${cardColors[announcement.priority]} p-6 rounded-xl ${
                  selectedId === announcement.id
                    ? 'ring-2 ring-blue-500 shadow-xl shadow-blue-500/20'
                    : 'hover:shadow-lg hover:shadow-zinc-900/50'
                }`}
              >
                {/* Announcement Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition">
                        {announcement.title}
                      </h3>
                      {announcement.isPinned && (
                        <span className="px-2.5 py-1 bg-yellow-600 text-white text-xs rounded-full font-semibold inline-block">
                          📌 Pinned
                        </span>
                      )}
                      {!announcement.read && (
                        <span className="px-2.5 py-1 bg-blue-600 text-white text-xs rounded-full font-semibold inline-block">
                          New
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-zinc-400 text-sm ml-4">
                    {selectedId === announcement.id ? '▼' : '▶'}
                  </div>
                </div>

                {/* Announcement Meta */}
                <div className="flex items-center justify-between text-sm text-zinc-400 mb-3 ml-8">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="font-medium text-zinc-300">
                        {announcement.createdBy.name || 'Unknown'}
                      </span>
                      <span className="mx-2">•</span>
                      <span className="text-zinc-500">{formatDate(announcement.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Announcement Content (Expandable) */}
                {selectedId === announcement.id && (
                  <div className="mt-6 pt-6 border-t border-zinc-700 ml-8">
                    <p className="text-zinc-200 whitespace-pre-wrap leading-relaxed text-base mb-6">
                      {announcement.content}
                    </p>

                    {/* Action Buttons */}
                    {!announcement.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(announcement.id);
                        }}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg font-semibold transition-all hover:shadow-lg hover:shadow-blue-500/30"
                      >
                        ✓ Mark as Read
                      </button>
                    )}
                    {announcement.read && (
                      <div className="px-4 py-2 bg-zinc-700/30 text-zinc-400 rounded-lg text-sm inline-block">
                        ✓ Already read
                      </div>
                    )}

                    {/* Reactions Section */}
                    <div className="mt-6 pt-6 border-t border-zinc-700">
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        {reactions[announcement.id]?.slice(0, 5).map((reaction) => (
                          <button
                            key={reaction.emoji}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReaction(announcement.id, reaction.emoji);
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                              reaction.userReacted
                                ? 'bg-blue-600 text-white'
                                : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                            }`}
                            title={reaction.users.join(', ')}
                          >
                            <span>{reaction.emoji}</span>
                            <span className="text-xs">{reaction.count}</span>
                          </button>
                        ))}

                        {/* Emoji Picker Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Simple emoji options
                            const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏'];
                            const emoji = prompt(
                              'Pick an emoji:\n' + emojis.join(' '),
                              emojis[0]
                            );
                            if (emoji) {
                              handleReaction(announcement.id, emoji);
                            }
                          }}
                          className="inline-flex items-center justify-center px-3 py-1.5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-medium transition-colors"
                          title="Add reaction"
                        >
                          😊
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Collapsed Preview */}
                {selectedId !== announcement.id && (
                  <p className="text-zinc-300 line-clamp-2 ml-8 group-hover:text-zinc-200 transition">
                    {announcement.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer Info */}
        {announcements.length > 0 && (
          <div className="mt-12 pt-8 border-t border-zinc-800 text-center text-zinc-500 text-sm">
            <p>Showing {announcements.length} announcement{announcements.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}

