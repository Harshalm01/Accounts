import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config';
import NotificationReactions from './NotificationReactions';
import VictoryFanfare from './VictoryFanfare';
import { soundManager } from '../utils/notificationSounds';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
  reactions?: Array<{
    emoji: string;
    count: number;
    userReacted: boolean;
  }>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'ASSIGNMENT_CREATED':
      return (
        <div className="w-8 h-8 rounded-full bg-indigo-900/50 text-indigo-300 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
      );
    case 'ASSIGNMENT_RESPONDED':
      return (
        <div className="w-8 h-8 rounded-full bg-green-900/50 text-green-300 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    case 'STATUS_UPDATE':
      return (
        <div className="w-8 h-8 rounded-full bg-teal-900/50 text-teal-300 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 rounded-full bg-gray-700 text-gray-300 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
      );
  }
}

export default function NotificationsPanel({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [responding, setResponding] = useState<Record<string, boolean>>({});
  const [respondedMap, setRespondedMap] = useState<Record<string, 'ACCEPTED' | 'REJECTED'>>({});
  const [exitingNotifications, setExitingNotifications] = useState<Set<string>>(new Set());
  const [showVictoryFanfare, setShowVictoryFanfare] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Resume AudioContext on first user interaction
  useEffect(() => {
    const handleUserInteraction = () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
      } catch (error) {
        // Silent catch
      }
    };

    if (isOpen) {
      // Try to resume on panel open
      handleUserInteraction();
    }
  }, [isOpen]);

  // Listen for assignment-accepted event to show victory fanfare
  useEffect(() => {
    const handleAssignmentAccepted = () => {
      setShowVictoryFanfare(true);
    };

    window.addEventListener('assignment-accepted', handleAssignmentAccepted);
    return () => window.removeEventListener('assignment-accepted', handleAssignmentAccepted);
  }, []);

  // Fetch notifications whenever panel opens
  useEffect(() => {
    if (!isOpen) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoading(true);
    console.log('📢 Fetching notifications...');
    fetch(`${API_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        console.log('✅ Notifications fetched:', data?.length || 0, 'notifications');
        if (Array.isArray(data)) setNotifications(data);
      })
      .catch((err) => {
        console.error('❌ Error fetching notifications:', err);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Subscribe to real-time notifications while panel is open
  useEffect(() => {
    if (!isOpen) return;
    const userStr = localStorage.getItem('user');
    const userId = userStr ? JSON.parse(userStr)?.id : null;
    if (!userId) return;

    const socket = io(API_URL, { forceNew: true });
    socketRef.current = socket;
    const joinRoom = () => socket.emit('join', userId);
    socket.on('connect', joinRoom);
    if (socket.connected) socket.emit('join', userId);
    socket.on(`notification:new:${userId}`, (notif: Notification) => {
      soundManager.playNotificationSound(); // PLAY SOUND ON NEW NOTIFICATION
      setNotifications((prev) => [notif, ...prev]);
    });

    socket.on(`notification:reaction:${userId}`, (data: { notificationId: string; reactions: Notification['reactions'] }) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === data.notificationId ? { ...n, reactions: data.reactions } : n))
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // silent
    } finally {
      setMarkingAll(false);
    }
  };

  const handleClickNotification = async (notif: Notification) => {
    if (!notif.read) {
      const token = localStorage.getItem('token');
      fetch(`${API_URL}/api/notifications/${notif.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    }
    if (notif.entityType === 'campaign' || notif.entityType === 'assignment') {
      onClose();
      navigate('/campaign');
    } else {
      onClose();
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Add to exiting set to trigger animation
    setExitingNotifications((prev) => new Set(prev).add(id));
    // Wait for animation to complete before removing from DOM
    setTimeout(() => {
      const token = localStorage.getItem('token');
      fetch(`${API_URL}/api/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setExitingNotifications((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }, 300);
  };

  const respondToAssignment = async (
    e: React.MouseEvent,
    notifId: string,
    assignmentId: string,
    status: 'ACCEPTED' | 'REJECTED'
  ) => {
    e.stopPropagation();
    setResponding((prev) => ({ ...prev, [notifId]: true }));
    try {
      const token = localStorage.getItem('token');
      console.log('Responding to assignment:', { notifId, assignmentId, status });
      const res = await fetch(`${API_URL}/api/assignments/${assignmentId}/respond`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      console.log('Response status:', res.status);
      if (res.ok) {
        console.log('Assignment accepted/rejected successfully');
        soundManager.playSuccessSound(); // PLAY SUCCESS SOUND
        setRespondedMap((prev) => ({ ...prev, [notifId]: status }));
        // Mark notification as read
        fetch(`${API_URL}/api/notifications/${notifId}/read`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
        setNotifications((prev) =>
          prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
        );

        // Emit custom event so CampaignDashboard refreshes
        if (status === 'ACCEPTED') {
          console.log('Dispatching assignment-accepted event');
          window.dispatchEvent(new Event('assignment-accepted'));
        }
      } else {
        const errText = await res.text();
        console.error('Error response:', res.status, errText);
      }
    } catch (err) {
      console.error('Caught error in respondToAssignment:', err);
    } finally {
      setResponding((prev) => ({ ...prev, [notifId]: false }));
    }
  };

  const handleReactToNotification = async (notifId: string, emoji: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/notifications/${notifId}/react`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        // Update the notification with new reaction data
        const updatedNotif = await res.json();
        setNotifications((prev) =>
          prev.map((n) => (n.id === notifId ? { ...n, reactions: updatedNotif.reactions } : n))
        );
      }
    } catch (err) {
      console.error('Error reacting to notification:', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!isOpen) return null;

  return (
    <>
      <VictoryFanfare
        isVisible={showVictoryFanfare}
        onComplete={() => setShowVictoryFanfare(false)}
        type="assignment"
      />

      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-50 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white dark:bg-zinc-900 border-l border-gray-200 dark:border-zinc-800 z-[60] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h2>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
              >
                {markingAll ? 'Marking...' : 'Mark all read'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-300 p-1 rounded transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {notifications.map((notif) => {
                const isExiting = exitingNotifications.has(notif.id);
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleClickNotification(notif)}
                    className={`group flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-all duration-300 ease-out ${
                      isExiting
                        ? 'opacity-0 translate-x-[400px]'
                        : 'opacity-100 translate-x-0 animate-slide-in'
                    } hover:scale-[1.02] hover:shadow-lg ${
                      !notif.read ? 'bg-indigo-50/60 dark:bg-indigo-950/20' : ''
                    }`}
                  >
                  <TypeIcon type={notif.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium leading-snug ${notif.read ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-white'}`}>
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      {notif.body}
                    </p>
                    {/* Accept / Reject buttons — only for ASSIGNMENT_CREATED while not yet responded */}
                    {notif.type === 'ASSIGNMENT_CREATED' && notif.entityType === 'assignment' && notif.entityId && (
                      respondedMap[notif.id] ? (
                        <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          respondedMap[notif.id] === 'ACCEPTED'
                            ? 'bg-green-900/40 text-green-300'
                            : 'bg-red-900/40 text-red-300'
                        }`}>
                          {respondedMap[notif.id] === 'ACCEPTED' ? 'Accepted' : 'Rejected'}
                        </span>
                      ) : (
                        <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            disabled={responding[notif.id]}
                            onClick={(e) => respondToAssignment(e, notif.id, notif.entityId!, 'ACCEPTED')}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 hover:scale-105 disabled:opacity-50 text-white text-xs font-semibold rounded-md transition-all duration-200 transform"
                          >
                            {responding[notif.id] ? '...' : 'Accept'}
                          </button>
                          <button
                            disabled={responding[notif.id]}
                            onClick={(e) => respondToAssignment(e, notif.id, notif.entityId!, 'REJECTED')}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 hover:scale-95 disabled:opacity-50 text-white text-xs font-semibold rounded-md transition-all duration-200 transform"
                          >
                            {responding[notif.id] ? '...' : 'Reject'}
                          </button>
                        </div>
                      )
                    )}
                    <div onClick={(e) => e.stopPropagation()}>
                      <NotificationReactions
                        notificationId={notif.id}
                        reactions={notif.reactions || []}
                        onReact={(emoji) => handleReactToNotification(notif.id, emoji)}
                      />
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {relativeTime(notif.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, notif.id)}
                    className="flex-shrink-0 p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 rounded transition-colors mt-0.5"
                    title="Dismiss"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
