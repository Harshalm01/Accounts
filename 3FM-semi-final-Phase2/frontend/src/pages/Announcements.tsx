import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import { io } from 'socket.io-client';
import ConfirmModal from '../components/ConfirmModal';

interface BroadcastMessage {
  id: string;
  title: string;
  content: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  createdById: string;
  createdBy: { id: string; name: string | null };
  readBy: string[];
  recipientType: string;
  recipientRoles: string[];
  recipientUserIds: string[];
  read: boolean;
  createdAt: string;
  updatedAt: string;
  isPinned?: boolean;
  pinnedAt?: string;
  pinnedById?: string;
  pinnedReason?: string;
}

interface User {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

interface AnnouncementTemplate {
  id: string;
  name: string;
  description?: string;
  title: string;
  content: string;
  priority: string;
  recipientType: string;
  recipientRoles: string[];
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  createdBy: { id: string; name: string | null };
}

type TabType = 'dashboard' | 'create' | 'history' | 'templates';
type RecipientType = 'ALL' | 'ROLES' | 'USERS';

const priorityColors: Record<string, string> = {
  CRITICAL: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700',
  HIGH: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700',
  NORMAL: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  LOW: 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700',
};

const priorityBadgeColors: Record<string, string> = {
  CRITICAL: 'bg-red-500 text-white',
  HIGH: 'bg-orange-500 text-white',
  NORMAL: 'bg-blue-500 text-white',
  LOW: 'bg-gray-500 text-white',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function Announcements() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [announcements, setAnnouncements] = useState<BroadcastMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');

  // Create form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    priority: 'NORMAL' as const,
    recipientType: 'ALL' as RecipientType,
    recipientRoles: [] as string[],
    recipientUserIds: [] as string[],
    scheduledFor: '' as string,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Draft and auto-save state
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [recentlySent, setRecentlySent] = useState<BroadcastMessage[]>([]);

  // Templates state
  const [templates, setTemplates] = useState<AnnouncementTemplate[]>([]);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // Stats state
  const [selectedStats, setSelectedStats] = useState<BroadcastMessage | null>(null);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  const socketRef = useRef<any>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const token = localStorage.getItem('token');

  // Fetch announcements
  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/broadcasts?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data);
      }
    } catch (err) {
      console.error('Failed to fetch announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch all users for recipient selection
  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Backend returns array directly, not wrapped in object
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  // Fetch templates
  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/api/announcement-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
    fetchUsers();
    fetchTemplates();
    loadDraft();
    loadRecentlySent();
  }, []);

  // Load draft from localStorage
  const loadDraft = () => {
    try {
      const saved = localStorage.getItem('announcement_draft');
      if (saved) {
        const draft = JSON.parse(saved);
        setFormData(draft);
        setIsDraft(true);
      }
    } catch (err) {
      console.error('Failed to load draft:', err);
    }
  };

  // Load recently sent announcements
  const loadRecentlySent = () => {
    try {
      const saved = localStorage.getItem('recently_sent_broadcasts');
      if (saved) {
        setRecentlySent(JSON.parse(saved).slice(0, 5));
      }
    } catch (err) {
      console.error('Failed to load recently sent:', err);
    }
  };

  // Auto-save draft to localStorage
  const saveDraft = () => {
    try {
      localStorage.setItem('announcement_draft', JSON.stringify(formData));
      setLastSaved(new Date());
      setIsDraft(true);
    } catch (err) {
      console.error('Failed to save draft:', err);
    }
  };

  // Auto-save on content change
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      if (formData.title.trim() || formData.content.trim()) {
        saveDraft();
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [formData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // N = New announcement
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setActiveTab('create');
        clearDraft();
      }
      // S = Save/Submit (only in create tab)
      if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey) && activeTab === 'create') {
        e.preventDefault();
        // Trigger submit form
        const form = document.querySelector('form');
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  // Setup Socket.IO listeners for real-time sync
  useEffect(() => {
    const socket = io(API_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

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

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.title.trim() || !formData.content.trim()) {
      setError('Title and content are required');
      return;
    }

    if (formData.recipientType === 'ROLES' && formData.recipientRoles.length === 0) {
      setError('Select at least one role');
      return;
    }

    if (formData.recipientType === 'USERS' && formData.recipientUserIds.length === 0) {
      setError('Select at least one user');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/broadcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          priority: formData.priority,
          recipientType: formData.recipientType,
          recipientRoles: formData.recipientType === 'ROLES' ? formData.recipientRoles : undefined,
          recipientUserIds: formData.recipientType === 'USERS' ? formData.recipientUserIds : undefined,
          scheduledFor: formData.scheduledFor || undefined,
        }),
      });

      if (res.ok) {
        const newBroadcast = await res.json();
        setSuccess('Announcement sent successfully!');

        // Save to recently sent
        const updated = [newBroadcast, ...recentlySent].slice(0, 5);
        localStorage.setItem('recently_sent_broadcasts', JSON.stringify(updated));
        setRecentlySent(updated);

        // Clear draft and form
        clearDraft();
        setFormData({
          title: '',
          content: '',
          priority: 'NORMAL',
          recipientType: 'ALL',
          recipientRoles: [],
          recipientUserIds: [],
          scheduledFor: '',
        });

        await fetchAnnouncements();
        setTimeout(() => { setActiveTab('dashboard'); setSuccess(''); }, 2000);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to create announcement');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Failed to create announcement:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Clear draft
  const clearDraft = () => {
    localStorage.removeItem('announcement_draft');
    setIsDraft(false);
    setLastSaved(null);
  };

  // Save as template
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      setError('Template name is required');
      return;
    }

    setError('');
    try {
      const res = await fetch(`${API_URL}/api/announcement-templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: templateName,
          description: templateDescription,
          title: formData.title,
          content: formData.content,
          priority: formData.priority,
          recipientType: formData.recipientType,
          recipientRoles: formData.recipientRoles,
        }),
      });

      if (res.ok) {
        setSuccess('Template saved successfully!');
        setShowSaveTemplateModal(false);
        setTemplateName('');
        setTemplateDescription('');
        await fetchTemplates();
        setTimeout(() => setSuccess(''), 2000);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to save template');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Failed to save template:', err);
    }
  };

  // Delete template
  const handleDeleteTemplate = (templateId: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Template',
      message: 'This announcement template will be permanently deleted.',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        try {
          const res = await fetch(`${API_URL}/api/announcement-templates/${templateId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            await fetchTemplates();
          }
        } catch (err) {
          console.error('Failed to delete template:', err);
        }
      },
    });
  };

  // Load template into form
  const loadTemplate = (template: AnnouncementTemplate) => {
    setFormData({
      title: template.title,
      content: template.content,
      priority: template.priority as any,
      recipientType: template.recipientType as RecipientType,
      recipientRoles: template.recipientRoles,
      recipientUserIds: [],
      scheduledFor: '',
    });
    setActiveTab('create');
  };

  // Pin announcement
  const handlePinAnnouncement = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/broadcasts/${id}/pin`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: 'Pinned by admin',
        }),
      });

      if (res.ok) {
        await fetchAnnouncements();
      }
    } catch (err) {
      console.error('Failed to pin announcement:', err);
    }
  };

  // Unpin announcement
  const handleUnpinAnnouncement = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/broadcasts/${id}/unpin`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        await fetchAnnouncements();
      }
    } catch (err) {
      console.error('Failed to unpin announcement:', err);
    }
  };

  // Get word/character count
  const wordCount = formData.content.trim().split(/\s+/).filter(w => w).length;
  const charCount = formData.content.length;

  const handleDeleteAnnouncement = (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Announcement',
      message: 'This announcement will be permanently deleted for all recipients. This action cannot be undone.',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        try {
          const res = await fetch(`${API_URL}/api/broadcasts/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            await fetchAnnouncements();
          }
        } catch (err) {
          console.error('Failed to delete announcement:', err);
        }
      },
    });
  };

  const handleFetchStats = async (announcement: BroadcastMessage) => {
    try {
      const res = await fetch(`${API_URL}/api/broadcasts/${announcement.id}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const statsData = await res.json();
        setSelectedStats({ ...announcement, ...statsData });
      } else {
        setSelectedStats(announcement);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setSelectedStats(announcement);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Announcements</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Create and manage system announcements</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-zinc-800">
          {(['dashboard', 'create', 'templates', 'history'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab === 'dashboard' && '📊 Dashboard'}
              {tab === 'create' && '✍️ Create'}
              {tab === 'templates' && '📋 Templates'}
              {tab === 'history' && '📜 History'}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-gray-200 dark:border-zinc-800">
                    <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Announcements</div>
                    <div className="text-3xl font-bold mt-2">{announcements.length}</div>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-gray-200 dark:border-zinc-800">
                    <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">Critical Priority</div>
                    <div className="text-3xl font-bold mt-2 text-red-600">
                      {announcements.filter((a) => a.priority === 'CRITICAL').length}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-gray-200 dark:border-zinc-800">
                    <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">High Priority</div>
                    <div className="text-3xl font-bold mt-2 text-orange-600">
                      {announcements.filter((a) => a.priority === 'HIGH').length}
                    </div>
                  </div>
                </div>

                {/* Announcements Grid */}
                {announcements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <div className="text-6xl mb-4">📢</div>
                    <p className="text-lg">No announcements yet</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {announcements.map((announcement) => (
                      <div
                        key={announcement.id}
                        className={`bg-white dark:bg-zinc-900 rounded-xl p-6 border ${priorityColors[announcement.priority]} space-y-3`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold">{announcement.title}</h3>
                              <span className={`px-2 py-1 rounded text-xs font-bold ${priorityBadgeColors[announcement.priority]}`}>
                                {announcement.priority}
                              </span>
                              {announcement.isPinned && (
                                <span className="px-2 py-1 bg-yellow-500 text-white text-xs font-bold rounded">📌 Pinned</span>
                              )}
                            </div>
                            <p className="text-sm opacity-90 line-clamp-2">{announcement.content}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleFetchStats(announcement)}
                              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                            >
                              Stats
                            </button>
                            {announcement.isPinned ? (
                              <button
                                onClick={() => handleUnpinAnnouncement(announcement.id)}
                                className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-lg transition-colors"
                              >
                                📌 Unpin
                              </button>
                            ) : (
                              <button
                                onClick={() => handlePinAnnouncement(announcement.id)}
                                className="px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm rounded-lg transition-colors"
                              >
                                📌 Pin
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteAnnouncement(announcement.id)}
                              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-xs text-gray-500 dark:text-gray-400">
                          <span>👤 {announcement.createdBy.name || 'Unknown'}</span>
                          <span>📅 {formatDate(announcement.createdAt)}</span>
                          <span>
                            {announcement.recipientType === 'ALL'
                              ? '📢 All Users'
                              : announcement.recipientType === 'ROLES'
                                ? `📋 Specific Roles (${announcement.recipientRoles.length})`
                                : `👥 Specific Users (${announcement.recipientUserIds.length})`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Create Tab */}
        {activeTab === 'create' && (
          <div className="max-w-2xl mx-auto">
            <form onSubmit={handleCreateAnnouncement} className="bg-white dark:bg-zinc-900 rounded-xl p-8 border border-gray-200 dark:border-zinc-800 space-y-6">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-4 text-red-700 dark:text-red-300 text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg p-4 text-green-700 dark:text-green-300 text-sm">
                  {success}
                </div>
              )}

              {/* Draft Recovery */}
              {isDraft && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg p-4 flex items-center justify-between">
                  <div className="text-blue-700 dark:text-blue-300 text-sm">
                    📝 Draft saved {lastSaved ? `at ${lastSaved.toLocaleTimeString()}` : 'automatically'}
                  </div>
                  <button
                    type="button"
                    onClick={clearDraft}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Clear Draft
                  </button>
                </div>
              )}

              {/* Recently Sent Quick Access */}
              {recentlySent.length > 0 && (
                <div className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">⏱️ Recently Sent</div>
                  <div className="flex gap-2 flex-wrap">
                    {recentlySent.map((broadcast) => (
                      <button
                        key={broadcast.id}
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            title: broadcast.title,
                            content: broadcast.content,
                            priority: broadcast.priority,
                            recipientType: broadcast.recipientType as RecipientType,
                          });
                          clearDraft();
                        }}
                        className="text-xs px-3 py-1.5 bg-white dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded hover:bg-gray-100 dark:hover:bg-zinc-600 transition-colors text-gray-700 dark:text-gray-300 truncate max-w-xs"
                        title={broadcast.title}
                      >
                        {broadcast.title}
                      </button>
                    ))}
                  </div>
</div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium mb-2">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter announcement title"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium mb-2">Content *</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter announcement content"
                  rows={5}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  required
                />
                {/* Word Counter */}
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  📊 {charCount} characters • {wordCount} words
                </div>
              </div>

              {/* Schedule (Optional) */}
              <div>
                <label className="block text-sm font-medium mb-2">Schedule (Optional)</label>
                <input
                  type="datetime-local"
                  value={formData.scheduledFor}
                  onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Leave empty to send immediately
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium mb-2">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              {/* Recipients */}
              <div className="space-y-4">
                <label className="block text-sm font-medium">Send To *</label>

                {/* All Users */}
                <label className="flex items-center gap-3 p-4 border border-gray-300 dark:border-zinc-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800">
                  <input
                    type="radio"
                    checked={formData.recipientType === 'ALL'}
                    onChange={() => setFormData({ ...formData, recipientType: 'ALL' })}
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="font-medium">All Users</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Send to all authenticated users</div>
                  </div>
                </label>

                {/* Specific Roles */}
                <label className="flex items-start gap-3 p-4 border border-gray-300 dark:border-zinc-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800">
                  <input
                    type="radio"
                    checked={formData.recipientType === 'ROLES'}
                    onChange={() => setFormData({ ...formData, recipientType: 'ROLES' })}
                    className="w-4 h-4 mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium mb-2">Send to Specific Roles</div>
                    {formData.recipientType === 'ROLES' && (
                      <div className="space-y-2">
                        {['ADMIN', 'AGENCY', 'EMPLOYEE', 'BRAND'].map((role) => (
                          <label key={role} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={formData.recipientRoles.includes(role)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    recipientRoles: [...formData.recipientRoles, role],
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    recipientRoles: formData.recipientRoles.filter((r) => r !== role),
                                  });
                                }
                              }}
                              className="w-4 h-4"
                            />
                            <span className="text-sm">{role}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </label>

                {/* Specific Users */}
                <label className="flex items-start gap-3 p-4 border border-gray-300 dark:border-zinc-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800">
                  <input
                    type="radio"
                    checked={formData.recipientType === 'USERS'}
                    onChange={() => {
                      setFormData({ ...formData, recipientType: 'USERS' });
                      setUserSearch('');
                    }}
                    className="w-4 h-4 mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium mb-3">Send to Specific Users</div>
                    {formData.recipientType === 'USERS' && (
                      <div className="space-y-3">
                        {/* Search Bar */}
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Search users by name or email..."
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            className="w-full px-4 py-2 rounded border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="absolute right-3 top-2.5 text-gray-400">🔍</span>
                        </div>

                        {/* Selected Users Count */}
                        {formData.recipientUserIds.length > 0 && (
                          <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                            {formData.recipientUserIds.length} user{formData.recipientUserIds.length !== 1 ? 's' : ''} selected
                          </div>
                        )}

                        {/* Users List */}
                        <div className="border border-gray-300 dark:border-zinc-700 rounded-lg max-h-64 overflow-y-auto bg-gray-50 dark:bg-zinc-800">
                          {users
                            .filter(
                              (user) =>
                                (user.name?.toLowerCase() || '').includes(userSearch.toLowerCase()) ||
                                (user.email?.toLowerCase() || '').includes(userSearch.toLowerCase())
                            )
                            .map((user) => (
                              <label key={user.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer last:border-b-0 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={formData.recipientUserIds.includes(user.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData({
                                        ...formData,
                                        recipientUserIds: [...formData.recipientUserIds, user.id],
                                      });
                                    } else {
                                      setFormData({
                                        ...formData,
                                        recipientUserIds: formData.recipientUserIds.filter((id) => id !== user.id),
                                      });
                                    }
                                  }}
                                  className="w-4 h-4 rounded cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {user.name || 'Unnamed User'}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {user.email}
                                  </div>
                                </div>
                                <div className="text-xs font-semibold bg-gray-200 dark:bg-zinc-700 px-2 py-1 rounded text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                  {user.role}
                                </div>
                              </label>
                            ))}
                          {users.filter((user) => (user.name?.toLowerCase() || '').includes(userSearch.toLowerCase()) || (user.email?.toLowerCase() || '').includes(userSearch.toLowerCase())).length === 0 && (
                            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                              No users found
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {/* Submit Button */}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  title="Keyboard shortcut: Ctrl+S (Cmd+S on Mac)"
                >
                  {submitting ? 'Sending...' : '📢 Send Announcement'}
                  <span className="text-xs opacity-70">(Ctrl+S)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateModal(true)}
                  disabled={!formData.title.trim() || !formData.content.trim()}
                  className="px-4 py-3 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
                  title="Save as template for reuse"
                >
                  💾 Save as Template
                </button>
              </div>

              {/* Keyboard Shortcuts Help */}
              <div className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-4 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <div>⌨️ <strong>Keyboard Shortcuts:</strong></div>
                <div>• <strong>Ctrl+N</strong> — New Announcement</div>
                <div>• <strong>Ctrl+S</strong> — Send Announcement</div>
              </div>
            </form>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold">Announcement Templates</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Saved templates for quick reuse</p>
              </div>
              <button
                onClick={() => setActiveTab('create')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                ➕ New Template
              </button>
            </div>

            {templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800">
                <div className="text-6xl mb-4">📋</div>
                <p className="text-lg font-medium">No templates yet</p>
                <p className="text-sm text-gray-400 mt-2">Create an announcement and save it as a template</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {templates.map((template) => (
                  <div key={template.id} className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-gray-200 dark:border-zinc-800 space-y-3 hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold">{template.name}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${priorityBadgeColors[template.priority]}`}>
                            {template.priority}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{template.description || 'No description'}</p>
                        <p className="text-xs text-gray-400 mt-2 line-clamp-1">{template.title}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => loadTemplate(template)}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                        >
                          Use
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-zinc-800">
                      <span>📝 {template.recipientType === 'ALL' ? 'All Users' : `${template.recipientType}`}</span>
                      <span>🔄 Used {template.usageCount} times</span>
                      <span>📅 {formatDate(template.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : announcements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <div className="text-6xl mb-4">📜</div>
                <p className="text-lg">No announcement history yet</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold">Title</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold">Priority</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold">Recipients</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold">Created By</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold">Read %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-zinc-800">
                      {announcements.map((announcement) => {
                        const totalUsers = announcement.recipientType === 'ALL' ? 100 : (announcement.recipientRoles.length > 0 ? announcement.recipientRoles.length * 10 : announcement.recipientUserIds.length);
                        const readPercent = totalUsers > 0 ? Math.round((announcement.readBy.length / totalUsers) * 100) : 0;
                        return (
                          <tr key={announcement.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                            <td className="px-6 py-3 text-sm font-medium">{announcement.title}</td>
                            <td className="px-6 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${priorityBadgeColors[announcement.priority]}`}>
                                {announcement.priority}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-sm">
                              {announcement.recipientType === 'ALL' && 'All Users'}
                              {announcement.recipientType === 'ROLES' && `${announcement.recipientRoles.join(', ')}`}
                              {announcement.recipientType === 'USERS' && `${announcement.recipientUserIds.length} Users`}
                            </td>
                            <td className="px-6 py-3 text-sm">{announcement.createdBy.name || 'Unknown'}</td>
                            <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(announcement.createdAt)}</td>
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-12 bg-gray-200 dark:bg-zinc-700 rounded-full h-2">
                                  <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${readPercent}%` }}></div>
                                </div>
                                <span className="text-sm font-medium">{readPercent}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save Template Modal */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 max-w-md w-full p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold">Save as Template</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create a reusable template</p>
              </div>
              <button
                onClick={() => setShowSaveTemplateModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded text-gray-500"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="e.g., Weekly Update"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                  placeholder="Describe this template..."
                  rows={3}
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveTemplateModal(false)}
                className="flex-1 py-2 bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {selectedStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 max-w-md w-full p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold">{selectedStats.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Announcement Statistics</p>
              </div>
              <button
                onClick={() => setSelectedStats(null)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded text-gray-500"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Recipients</div>
                <div className="text-3xl font-bold mt-1">{(selectedStats as any).totalUsers || 0}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                  <div className="text-sm text-green-700 dark:text-green-400 font-medium">Read</div>
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">
                    {(selectedStats as any).readCount || selectedStats.readBy.length}
                  </div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                  <div className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">Unread</div>
                  <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400 mt-1">
                    {(selectedStats as any).unreadCount || 0}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="text-sm text-blue-700 dark:text-blue-400">Read Rate</div>
                <div className="flex items-end gap-2 mt-2">
                  <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">
                    {(selectedStats as any).readPercentage || 0}%
                  </div>
                  <div className="text-sm text-blue-600 dark:text-blue-300 pb-1">of recipients</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedStats(null)}
              className="w-full py-2 bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}
