import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config';

// ── Feature imports ────────────────────────────────────────────────────────
// Chat Search
import { useChatSearch } from '../hooks/useChatSearch';
import ChatSearch from '../components/ChatSearch';
// Message Reactions
import type { Reaction } from '../hooks/useMessageReactions';
import MessageReactions from '../components/MessageReactions';
// Message Pinning
import { usePinnedMessages } from '../hooks/usePinnedMessages';
import PinnedMessagesPanel from '../components/PinnedMessagesPanel';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface UserMeta {
  id: string;
  name: string | null;
  designation: string | null;
  role: string;
}

interface UserDetail extends UserMeta {
  email: string | null;
  phone: string | null;
}

interface ConversationMessage {
  id: string;
  content: string | null;
  senderId: string;
  sender: { id: string; name: string | null; designation: string | null };
  isRead: boolean;
  createdAt: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  reactions?: Reaction[];
}

interface Conversation {
  id: string;
  user1: UserMeta;
  user2: UserMeta;
  messages: ConversationMessage[];
  unreadCount: number;
  updatedAt: string;
}

interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  sender: { id: string; name: string | null; designation: string | null; role: string };
  content: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  createdAt: string;
  reactions?: Reaction[];
}

interface GroupMemberEntry {
  id: string;
  user: UserMeta;
  joinedAt: string;
}

interface Group {
  id: string;
  name: string;
  createdById: string;
  createdBy: UserMeta;
  members: GroupMemberEntry[];
  messages: GroupMessage[];
  unreadCount: number;
  updatedAt: string;
}

// ── Typing indicator helpers ───────────────────────────────────────────────────

interface TypistEntry { userId: string; userName: string }

function buildTypingText(typists: TypistEntry[]): string {
  const fn = (name: string) => name.split(' ')[0];
  if (typists.length === 0) return '';
  if (typists.length === 1) return `${fn(typists[0].userName)} is typing`;
  if (typists.length === 2) return `${fn(typists[0].userName)} and ${fn(typists[1].userName)} are typing`;
  return `${fn(typists[0].userName)}, ${fn(typists[1].userName)} and ${typists.length - 2} others are typing`;
}

const TYPING_COLORS = ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#98D8C8','#F7DC6F','#BB8FCE','#85C1E2'];
function typingAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash << 5) - hash + userId.charCodeAt(i);
  return TYPING_COLORS[Math.abs(hash) % TYPING_COLORS.length];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AllHands() {
  const [currentUser, setCurrentUser] = useState<UserMeta | null>(null);
  const token = localStorage.getItem('token') || '';

  // ── Tab ────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'dm' | 'groups'>('dm');

  // ── DM state ──────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [dmTyping, setDmTyping] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<UserDetail | null>(null);

  // ── Group state ────────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingGroupMessages, setLoadingGroupMessages] = useState(false);
  const [groupTypists, setGroupTypists] = useState<TypistEntry[]>([]);
  const typingStaleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);

  // Create group modal
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [createGroupName, setCreateGroupName] = useState('');
  const [createGroupMembers, setCreateGroupMembers] = useState<UserMeta[]>([]);
  const [cgMemberSearch, setCgMemberSearch] = useState('');
  const [cgMemberResults, setCgMemberResults] = useState<UserMeta[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Add member to existing group
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberResults, setAddMemberResults] = useState<UserMeta[]>([]);

  // ── Shared compose state ──────────────────────────────────────────────────
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // ── Group mention state ────────────────────────────────────────────────────
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearchText, setMentionSearchText] = useState('');
  const [mentionFilteredMembers, setMentionFilteredMembers] = useState<UserMeta[]>([]);
  const [mentionDropdownPos, setMentionDropdownPos] = useState({ x: 0, y: 0 });
  const [mentionToast, setMentionToast] = useState<{ senderName: string; context: string } | null>(null);

  // ── Message selection state ────────────────────────────────────────────────
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // ── Feature 1: Chat Search ────────────────────────────────────────────────
  const activeConvId = selectedGroup?.id || selectedConv?.id || '';
  const activeIsGroup = !!selectedGroup;
  const { query: searchQuery2, results: searchResults, handleSearch: performSearch, loading: searchLoading, error: searchError, currentPage: searchPage, totalPages: searchTotalPages, totalResults: searchTotalResults, goToPage: searchGoToPage, clear: clearSearch } = useChatSearch({ conversationId: activeConvId, isGroup: activeIsGroup });
  const [showChatSearch, setShowChatSearch] = useState(false);

  // ── Feature 2: Message Reactions (backend-backed) ──────────────────────────
  const [messageReactions, setMessageReactions] = useState<Record<string, Reaction[]>>({});
  const [activeReactMessageId, setActiveReactMessageId] = useState<string | null>(null);

  const getMessageReactions = (messageId: string): Reaction[] => messageReactions[messageId] || [];

  const computeReactions = (allReactions: { emoji: string; userId: string }[], myId: string): Reaction[] => {
    const grouped: Record<string, { count: number; userReacted: boolean }> = {};
    for (const r of allReactions) {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, userReacted: false };
      grouped[r.emoji].count++;
      if (r.userId === myId) grouped[r.emoji].userReacted = true;
    }
    return Object.entries(grouped).map(([emoji, data]) => ({ emoji, ...data }));
  };

  const handleReactToMessage = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    const isGroup = !!selectedGroup;
    const url = isGroup
      ? `${API_URL}/api/groups/${selectedGroup?.id}/messages/${messageId}/react`
      : `${API_URL}/api/dm/conversations/${selectedConv?.id}/messages/${messageId}/react`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const { reactions } = await res.json();
        setMessageReactions((prev) => ({ ...prev, [messageId]: reactions }));
      }
    } catch {}
    setActiveReactMessageId(null);
  };

  // ── Feature 3: Message Pinning ─────────────────────────────────────────────
  const { pinnedMessages, fetchPinnedMessages, pinMessage, unpinMessage } = usePinnedMessages({ conversationId: activeConvId, isGroup: activeIsGroup });
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const pinnedMessageCount = pinnedMessages?.length || 0;

  // ── User search (DM new conv) ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchUserResults, setSearchUserResults] = useState<UserMeta[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedConvRef = useRef<Conversation | null>(null);
  const selectedGroupRef = useRef<Group | null>(null);

  useEffect(() => { selectedConvRef.current = selectedConv; }, [selectedConv]);
  useEffect(() => { selectedGroupRef.current = selectedGroup; }, [selectedGroup]);

  // ── Load current user ──────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try { setCurrentUser(JSON.parse(stored)); } catch {}
    }
  }, []);

  // ── DM: Fetch conversations ────────────────────────────────────────────────
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_URL}/api/dm/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations(await res.json());
    } catch {}
    setLoadingConvs(false);
  };

  useEffect(() => { fetchConversations(); }, []);

  // ── Groups: Fetch groups ───────────────────────────────────────────────────
  const fetchGroups = async () => {
    try {
      const res = await fetch(`${API_URL}/api/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch {}
    setLoadingGroups(false);
  };

  useEffect(() => { fetchGroups(); }, []);

  // ── Socket setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const socket = io(API_URL, { forceNew: true });
    socketRef.current = socket;

    // Join personal room so DM/group-added events only reach this user's devices
    socket.emit('join', currentUser.id);

    // DM events
    socket.on(`dm:message:${currentUser.id}`, (payload: { conversationId: string; message: ConversationMessage }) => {
      if (selectedConvRef.current?.id === payload.conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.message.id)) return prev;
          return [...prev, payload.message];
        });
        setDmTyping(false);
      }
      fetchConversations();
    });

    socket.on(`dm:typing:${currentUser.id}`, (payload: { conversationId: string }) => {
      if (selectedConvRef.current?.id === payload.conversationId) setDmTyping(true);
    });

    socket.on(`dm:stop_typing:${currentUser.id}`, (payload: { conversationId: string }) => {
      if (selectedConvRef.current?.id === payload.conversationId) setDmTyping(false);
    });

    // DM reactions real-time sync
    socket.on(`message:reaction`, (data: { conversationId: string; messageId: string; allReactions: { emoji: string; userId: string }[] }) => {
      if (selectedConvRef.current?.id === data.conversationId && currentUser) {
        setMessageReactions((prev) => ({
          ...prev,
          [data.messageId]: computeReactions(data.allReactions, currentUser.id),
        }));
      }
    });

    // Group events — listen once per mounted component; groups list may change
    socket.on(`group:added:${currentUser.id}`, () => {
      fetchGroups();
    });

    socket.on(`group:deleted:${currentUser.id}`, ({ groupId }: { groupId: string }) => {
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (selectedGroupRef.current?.id === groupId) {
        setSelectedGroup(null);
        setGroupMessages([]);
        setShowGroupPanel(false);
      }
    });

    return () => {
      socket.off(`message:reaction`);
      typingStaleTimers.current.forEach(t => clearTimeout(t));
      typingStaleTimers.current.clear();
      socket.disconnect();
    };
  }, [currentUser]);

  // ── Per-group socket listeners (message, typing, member changes) ───────────
  useEffect(() => {
    if (!socketRef.current || !selectedGroup) return;
    const socket = socketRef.current;
    const gid = selectedGroup.id;

    const onMsg = (payload: { groupId: string; message: GroupMessage }) => {
      if (payload.groupId !== gid) return;
      setGroupMessages((prev) => {
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
      setGroupTypists([]);
      // Also refresh unread counts in the groups list
      fetchGroups();
    };

    const onTyping = (data: { userId: string; userName: string }) => {
      if (data.userId === currentUser?.id) return;
      setGroupTypists(prev =>
        prev.some(t => t.userId === data.userId) ? prev : [...prev, { userId: data.userId, userName: data.userName }]
      );
      const timers = typingStaleTimers.current;
      if (timers.has(data.userId)) clearTimeout(timers.get(data.userId)!);
      timers.set(data.userId, setTimeout(() => {
        setGroupTypists(prev => prev.filter(t => t.userId !== data.userId));
        timers.delete(data.userId);
      }, 3000));
    };

    const onStopTyping = (data: { userId: string }) => {
      const timers = typingStaleTimers.current;
      if (timers.has(data.userId)) { clearTimeout(timers.get(data.userId)!); timers.delete(data.userId); }
      setGroupTypists(prev => prev.filter(t => t.userId !== data.userId));
    };

    const onMemberAdded = () => {
      // Refresh the selected group to update members list
      fetchGroups();
    };

    const onMemberRemoved = ({ userId }: { userId: string }) => {
      if (userId === currentUser?.id) {
        setSelectedGroup(null);
        setGroupMessages([]);
        setShowGroupPanel(false);
        fetchGroups();
      } else {
        fetchGroups();
      }
    };

    const onMentionNotification = (data: { groupId: string; senderName: string; context: string; createdAt: string }) => {
      setMentionToast({ senderName: data.senderName, context: data.context });
      setTimeout(() => setMentionToast(null), 5000);
    };

    const onReaction = (data: { messageId: string; allReactions: { emoji: string; userId: string }[] }) => {
      if (currentUser) {
        setMessageReactions((prev) => ({
          ...prev,
          [data.messageId]: computeReactions(data.allReactions, currentUser.id),
        }));
      }
    };

    const onMessagePinned = (data: { messageId: string; pinnedBy: string; messageText: string; pinnedAt: string }) => {
      // Refresh pinned messages list when a message is pinned
      fetchPinnedMessages?.();
    };

    const onMessageUnpinned = (data: { pinId: string }) => {
      // Refresh pinned messages list when message is unpinned
      fetchPinnedMessages?.();
    };

    socket.on(`group:message:${gid}`, onMsg);
    socket.on(`group:typing:${gid}`, onTyping);
    socket.on(`group:stop_typing:${gid}`, onStopTyping);
    socket.on(`group:member_added:${gid}`, onMemberAdded);
    socket.on(`group:member_removed:${gid}`, onMemberRemoved);
    socket.on(`mention:new:in-group:${currentUser?.id}`, onMentionNotification);
    socket.on(`message:reaction:${gid}`, onReaction);
    socket.on(`message:pinned:${gid}`, onMessagePinned);
    socket.on(`message:unpinned:${gid}`, onMessageUnpinned);

    // Join group room so messages are delivered only to group members on LAN
    socket.emit('join-group', gid);

    return () => {
      socket.emit('leave-group', gid);
      socket.off(`group:message:${gid}`, onMsg);
      socket.off(`group:typing:${gid}`, onTyping);
      socket.off(`group:stop_typing:${gid}`, onStopTyping);
      socket.off(`group:member_added:${gid}`, onMemberAdded);
      socket.off(`group:member_removed:${gid}`, onMemberRemoved);
      socket.off(`mention:new:in-group:${currentUser?.id}`, onMentionNotification);
      socket.off(`message:reaction:${gid}`, onReaction);
      socket.off(`message:pinned:${gid}`, onMessagePinned);
      socket.off(`message:unpinned:${gid}`, onMessageUnpinned);
      setGroupTypists([]);
    };
  }, [selectedGroup?.id, currentUser?.id]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, groupMessages]);

  // ── DM: Search users ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchUserResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/dm/users/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSearchUserResults(await res.json());
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Create group: member search ────────────────────────────────────────────
  useEffect(() => {
    if (!cgMemberSearch.trim()) { setCgMemberResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/dm/users/search?q=${encodeURIComponent(cgMemberSearch)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const users: UserMeta[] = await res.json();
        // Exclude current user and already-added members
        setCgMemberResults(
          users.filter((u) => u.id !== currentUser?.id && !createGroupMembers.some((m) => m.id === u.id))
        );
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [cgMemberSearch, createGroupMembers, currentUser?.id]);

  // ── Add member to group: search ────────────────────────────────────────────
  useEffect(() => {
    if (!addMemberSearch.trim() || !selectedGroup) { setAddMemberResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/dm/users/search?q=${encodeURIComponent(addMemberSearch)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const users: UserMeta[] = await res.json();
        const existingIds = new Set(selectedGroup.members.map((m) => m.user.id));
        setAddMemberResults(users.filter((u) => !existingIds.has(u.id)));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [addMemberSearch, selectedGroup?.members]);

  // ── DM: Open conversation ──────────────────────────────────────────────────
  const openConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    setSelectedGroup(null);
    setShowGroupPanel(false);
    setLoadingMessages(true);
    setMessages([]);
    setDmTyping(false);
    setAttachedFile(null);
    setShowEmojiPicker(false);
    setNewMessage('');
    try {
      const res = await fetch(`${API_URL}/api/dm/conversations/${conv.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const msgs: ConversationMessage[] = await res.json();
      setMessages(msgs);
      const initReactions: Record<string, Reaction[]> = {};
      msgs.forEach((m) => { if (m.reactions?.length) initReactions[m.id] = m.reactions; });
      setMessageReactions(initReactions);
      setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)));
    } catch {}
    setLoadingMessages(false);
  };

  // ── Group: Open group conversation ─────────────────────────────────────────
  const openGroup = async (group: Group) => {
    setSelectedGroup(group);
    setSelectedConv(null);
    setProfileUser(null);
    setShowGroupPanel(false);
    setLoadingGroupMessages(true);
    setGroupMessages([]);
    setGroupTypists([]);
    setAttachedFile(null);
    setShowEmojiPicker(false);
    setNewMessage('');
    try {
      const res = await fetch(`${API_URL}/api/groups/${group.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setSelectedGroup(null);
        setLoadingGroupMessages(false);
        return;
      }
      setGroupMessages(await res.json().then((msgs: GroupMessage[]) => {
        const initReactions: Record<string, Reaction[]> = {};
        msgs.forEach((m) => { if (m.reactions?.length) initReactions[m.id] = m.reactions; });
        setMessageReactions(initReactions);
        return msgs;
      }));
      setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, unreadCount: 0 } : g)));
    } catch {}
    setLoadingGroupMessages(false);
  };

  // ── DM: View user profile ──────────────────────────────────────────────────
  const viewProfile = async (userId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/dm/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfileUser(await res.json());
      // Don't close the group panel — it will be restored when profile is closed
    } catch {}
  };

  // ── DM: Start conversation ─────────────────────────────────────────────────
  const startConversation = async (user: UserMeta) => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchUserResults([]);
    setTab('dm');
    try {
      const res = await fetch(`${API_URL}/api/dm/conversations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId: user.id }),
      });
      const conv = await res.json();
      await fetchConversations();
      openConversation(conv);
    } catch {}
  };

  // ── DM: Delete conversation ────────────────────────────────────────────────
  const deleteConversation = async (convId: string) => {
    try {
      await fetch(`${API_URL}/api/dm/conversations/${convId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (selectedConv?.id === convId) { setSelectedConv(null); setMessages([]); }
      if (profileUser) {
        const deleted = conversations.find((c) => c.id === convId);
        if (deleted && (deleted.user1.id === profileUser.id || deleted.user2.id === profileUser.id)) {
          setProfileUser(null);
        }
      }
    } catch {}
    setConfirmDeleteId(null);
  };

  // ── Group: Create group ────────────────────────────────────────────────────
  const createGroup = async () => {
    if (!createGroupName.trim() || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const res = await fetch(`${API_URL}/api/groups`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createGroupName.trim(),
          memberIds: createGroupMembers.map((m) => m.id),
        }),
      });
      const group = await res.json();
      setGroups((prev) => [group, ...prev]);
      setShowCreateGroup(false);
      setCreateGroupName('');
      setCreateGroupMembers([]);
      setCgMemberSearch('');
      openGroup(group);
    } catch {}
    setCreatingGroup(false);
  };

  // ── Group: Delete group ────────────────────────────────────────────────────
  const deleteGroup = async (groupId: string) => {
    try {
      await fetch(`${API_URL}/api/groups/${groupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
        setGroupMessages([]);
        setShowGroupPanel(false);
      }
    } catch {}
    setConfirmDeleteGroupId(null);
  };

  // ── Group: Leave group ─────────────────────────────────────────────────────
  const leaveGroup = async (groupId: string) => {
    if (!currentUser) return;
    try {
      await fetch(`${API_URL}/api/groups/${groupId}/members/${currentUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
        setGroupMessages([]);
        setShowGroupPanel(false);
      }
    } catch {}
  };

  // ── Group: Remove member ───────────────────────────────────────────────────
  const removeMember = async (groupId: string, userId: string) => {
    try {
      await fetch(`${API_URL}/api/groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Refresh groups to get updated members
      const updated = await fetch(`${API_URL}/api/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await updated.json();
      const updatedGroups: Group[] = Array.isArray(data) ? data : [];
      setGroups(updatedGroups);
      if (selectedGroup?.id === groupId) {
        const refreshed = updatedGroups.find((g) => g.id === groupId);
        if (refreshed) setSelectedGroup(refreshed);
      }
    } catch {}
  };

  // ── Group: Add member ──────────────────────────────────────────────────────
  const addMember = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      await fetch(`${API_URL}/api/groups/${selectedGroup.id}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      setAddMemberSearch('');
      setAddMemberResults([]);
      setShowAddMember(false);
      // Refresh groups
      const updated = await fetch(`${API_URL}/api/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await updated.json();
      const updatedGroups: Group[] = Array.isArray(data) ? data : [];
      setGroups(updatedGroups);
      if (selectedGroup?.id) {
        const refreshed = updatedGroups.find((g) => g.id === selectedGroup.id);
        if (refreshed) setSelectedGroup(refreshed);
      }
    } catch {}
  };

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || (!selectedConv && !selectedGroup)) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/api/dm/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.fileUrl) {
        setAttachedFile({ url: data.fileUrl, name: data.fileName, type: data.fileType });
      }
    } catch {}
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if ((!newMessage.trim() && !attachedFile) || sending) return;
    const content = newMessage.trim();
    setNewMessage('');
    setSending(true);
    const fileToSend = attachedFile;
    setAttachedFile(null);
    setShowMentionDropdown(false);

    // Extract mentioned usernames from content
    const mentionMatches = content.match(/@(\w+)/g) || [];
    const mentionedUsernames = mentionMatches.map((m) => m.substring(1)); // Remove @ prefix

    if (selectedConv) {
      try {
        const res = await fetch(`${API_URL}/api/dm/conversations/${selectedConv.id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content || undefined, fileUrl: fileToSend?.url, fileName: fileToSend?.name, fileType: fileToSend?.type }),
        });
        const msg = await res.json();
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
        fetchConversations();
      } catch {}
    } else if (selectedGroup) {
      try {
        const res = await fetch(`${API_URL}/api/groups/${selectedGroup.id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: content || undefined,
            fileUrl: fileToSend?.url,
            fileName: fileToSend?.name,
            fileType: fileToSend?.type,
            mentions: mentionedUsernames, // Send mentioned usernames
          }),
        });
        const msg = await res.json();
        setGroupMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
        fetchGroups();
      } catch {}
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Message selection handlers ────────────────────────────────────────────
  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedMsgIds(new Set());
  };

  const handleMsgPointerDown = (msgId: string, isMine: boolean) => {
    if (!isMine) return; // can only select own messages
    longPressTimer.current = setTimeout(() => {
      setIsSelectMode(true);
      setSelectedMsgIds(new Set([msgId]));
    }, 500);
  };

  const handleMsgPointerUp = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const handleMsgClick = (msgId: string, isMine: boolean) => {
    if (!isSelectMode || !isMine) return;
    setSelectedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      return next;
    });
  };

  const deleteSelectedMessages = async () => {
    const ids = Array.from(selectedMsgIds);
    try {
      if (selectedConv) {
        await fetch(`${API_URL}/api/dm/conversations/${selectedConv.id}/messages`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageIds: ids }),
        });
        setMessages((prev) => prev.filter((m) => !selectedMsgIds.has(m.id)));
      } else if (selectedGroup) {
        await fetch(`${API_URL}/api/groups/${selectedGroup.id}/messages`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageIds: ids }),
        });
        setGroupMessages((prev) => prev.filter((m) => !selectedMsgIds.has(m.id)));
      }
    } catch {}
    exitSelectMode();
  };

  const handleTyping = () => {
    if (selectedConv && socketRef.current) {
      const other = getOtherUser(selectedConv);
      socketRef.current.emit('dm:typing', { conversationId: selectedConv.id, recipientId: other.id });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('dm:stop_typing', { conversationId: selectedConv.id, recipientId: other.id });
      }, 2500);
    } else if (selectedGroup && socketRef.current && currentUser) {
      socketRef.current.emit('group:typing', { groupId: selectedGroup.id, userId: currentUser.id, userName: currentUser.name || 'Someone' });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('group:stop_typing', { groupId: selectedGroup!.id, userId: currentUser.id });
      }, 2500);
    }
  };

  // ── Handle message input for @mentions ──────────────────────────────────────
  const handleMessageInputChange = (text: string) => {
    setNewMessage(text);
    handleTyping();

    // Detect @mention pattern
    if (selectedGroup && text) {
      const lastAtIndex = text.lastIndexOf('@');
      if (lastAtIndex !== -1) {
        const afterAt = text.substring(lastAtIndex + 1);
        // Check if we're still in the mention (no space after @, or only word chars)
        if (/^[\w]*$/.test(afterAt)) {
          setMentionSearchText(afterAt);
          setShowMentionDropdown(true);

          // Filter group members by search text
          if (selectedGroup.members && selectedGroup.members.length > 0) {
            const filtered = selectedGroup.members
              .map((m) => m.user)
              .filter((u) => u.name && u.name.toLowerCase().includes(afterAt.toLowerCase()));
            setMentionFilteredMembers(filtered);
          }
          return;
        }
      }
    }

    // Close mention dropdown if @ not found
    setShowMentionDropdown(false);
    setMentionSearchText('');
  };

  // ── Handle mention selection ────────────────────────────────────────────────
  const handleMentionSelect = (user: UserMeta) => {
    if (!selectedGroup) return;

    const lastAtIndex = newMessage.lastIndexOf('@');
    if (lastAtIndex === -1) return;

    // Replace @search with @Full Name, then place cursor right after it
    const beforeAt = newMessage.substring(0, lastAtIndex);
    const newMsg = beforeAt + '@' + (user.name || '') + ' ';
    setNewMessage(newMsg);
    // Restore focus and move cursor to end of inserted mention
    setTimeout(() => {
      if (messageInputRef.current) {
        messageInputRef.current.focus();
        messageInputRef.current.setSelectionRange(newMsg.length, newMsg.length);
      }
    }, 0);
    setShowMentionDropdown(false);
    setMentionSearchText('');
    setMentionFilteredMembers([]);
  };

  // ── Helper: Render message content with styled mentions ────────────────────
  const renderMessageWithMentions = (content: string, members?: GroupMemberEntry[]) => {
    // Build a regex that matches @FullName for known group members (multi-word names supported)
    if (members && members.length > 0) {
      const names = members
        .map(m => m.user.name)
        .filter((n): n is string => !!n)
        .sort((a, b) => b.length - a.length); // longer names first to avoid partial matches
      if (names.length > 0) {
        const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(`(@(?:${escaped.join('|')}))`, 'gi');
        const parts = content.split(regex);
        return parts.map((part, idx) => {
          const matchedMember = members.find(m => m.user.name && part.toLowerCase() === `@${m.user.name.toLowerCase()}`);
          if (matchedMember) {
            return (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); viewProfile(matchedMember.user.id); }}
                className="bg-blue-500/20 text-blue-300 px-1 rounded hover:bg-blue-500/35 hover:text-blue-200 transition-colors cursor-pointer"
                title={`View ${matchedMember.user.name}'s profile`}
              >
                {part}
              </button>
            );
          }
          return part;
        });
      }
    }
    // Fallback: simple single-word @mention highlighting
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, idx) => {
      if (part.match(/^@\w+$/)) {
        return (
          <span key={idx} className="bg-blue-500/20 text-blue-300 px-1 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };
  const getOtherUser = (conv: Conversation): UserMeta =>
    conv.user1.id === currentUser?.id ? conv.user2 : conv.user1;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const isToday = d.toDateString() === new Date().toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':    return 'bg-red-500/20 text-red-400';
      case 'AGENCY':   return 'bg-indigo-500/20 text-indigo-400';
      case 'EMPLOYEE': return 'bg-emerald-500/20 text-emerald-400';
      default:         return 'bg-zinc-500/20 text-zinc-400';
    }
  };

  const getRoleAvatarColor = (role: string) => {
    switch (role) {
      case 'ADMIN':    return 'bg-red-600/30 text-red-300';
      case 'AGENCY':   return 'bg-indigo-600/30 text-indigo-300';
      case 'EMPLOYEE': return 'bg-emerald-600/30 text-emerald-300';
      default:         return 'bg-zinc-600/30 text-zinc-300';
    }
  };

  const EMOJIS = ['😀','😂','😍','🥰','😎','🤔','😅','😭','🥺','😤','🎉','🔥','❤️','✅','👍','👏','🙏','💯','😊','🤣','😬','🫡','💪','👀','🚀','⭐','💡','📌','✨','🎯'];

  // ── Derived ────────────────────────────────────────────────────────────────
  const isViewingGroup = selectedGroup !== null;
  const isAmCreator = selectedGroup?.createdById === currentUser?.id;

  // Right panel: profile takes priority over group panel; group panel shows when toggled
  const showRightPanel =
    !!profileUser ||
    (showGroupPanel && !!selectedGroup) ||
    (showPinnedPanel && !!(selectedGroup || selectedConv)) ||
    (showChatSearch && !!(selectedGroup || selectedConv));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-6rem)] bg-gray-50 dark:bg-zinc-950 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800">

      {/* ── Mention toast ─────────────────────────────────────────────────── */}
      {mentionToast && (
        <div className="fixed top-4 right-4 z-[200] max-w-sm w-full animate-slide-in-right">
          <div className="bg-indigo-600 text-white rounded-xl shadow-2xl px-4 py-3 flex items-start gap-3">
            <span className="text-lg flex-shrink-0">@</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{mentionToast.senderName} mentioned you</p>
              <p className="text-indigo-200 text-xs mt-0.5 truncate">{mentionToast.context}</p>
            </div>
            <button onClick={() => setMentionToast(null)} className="text-indigo-300 hover:text-white flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-zinc-800 bg-white dark:bg-black">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">All Hands · 3Folks</h2>
            {!(tab === 'groups' && currentUser?.role === 'EMPLOYEE') && (
              <button
                onClick={() => {
                  if (tab === 'dm') setShowSearch((v) => !v);
                  else { setShowCreateGroup(true); }
                }}
                className="p-2 text-gray-400 hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
                title={tab === 'dm' ? 'New conversation' : 'Create group'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 dark:bg-zinc-900 rounded-lg p-1">
            <button
              onClick={() => setTab('dm')}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${tab === 'dm' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Direct
            </button>
            <button
              onClick={() => setTab('groups')}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${tab === 'groups' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Groups
            </button>
          </div>

          {/* DM search */}
          {tab === 'dm' && showSearch && (
            <div className="relative mt-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search people..."
                autoFocus
                className="w-full bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white text-sm px-4 py-2 pr-8 rounded-lg border border-gray-300 dark:border-zinc-700 focus:border-indigo-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-500"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchUserResults([]); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {searchUserResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-xl z-10 overflow-hidden">
                  {searchUserResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => startConversation(user)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${getRoleAvatarColor(user.role)}`}>
                        {user.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{user.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500 truncate">{user.designation || user.role}</p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${getRoleBadgeColor(user.role)}`}>
                        {user.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery && searchUserResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-3 text-sm text-gray-500 z-10">
                  No users found
                </div>
              )}
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {/* ── DM tab ── */}
          {tab === 'dm' && (
            loadingConvs ? (
              <div className="flex items-center justify-center py-10 text-gray-500 text-sm">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <svg className="w-10 h-10 text-zinc-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-gray-500 text-sm">No conversations yet</p>
                <p className="text-gray-600 text-xs mt-1">Click + to start chatting</p>
              </div>
            ) : (
              conversations.map((conv) => {
                const other = getOtherUser(conv);
                const lastMsg = conv.messages[0];
                const isSelected = selectedConv?.id === conv.id;
                const isConfirming = confirmDeleteId === conv.id;
                return (
                  <div key={conv.id} className="border-b border-gray-100 dark:border-zinc-900">
                    {isConfirming ? (
                      <div className={`flex items-center gap-2 px-4 py-3 bg-red-950/30 ${isSelected ? 'border-r-2 border-r-red-500' : ''}`}>
                        <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <p className="text-xs text-red-300 flex-1">Delete this chat?</p>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
                        <button onClick={() => deleteConversation(conv.id)} className="text-xs text-white bg-red-600 hover:bg-red-500 px-2 py-1 rounded transition-colors">Delete</button>
                      </div>
                    ) : (
                      <div className={`group relative flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors ${isSelected ? 'bg-gray-100 dark:bg-zinc-900 border-r-2 border-r-indigo-500' : ''}`}>
                        <button
                          onClick={(e) => { e.stopPropagation(); viewProfile(other.id); }}
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold flex-shrink-0 hover:ring-2 hover:ring-indigo-500 transition-all ${getRoleAvatarColor(other.role)}`}
                          title={`View ${other.name}'s profile`}
                        >
                          {other.name?.charAt(0).toUpperCase() || '?'}
                        </button>
                        <button onClick={() => openConversation(conv)} className="flex-1 min-w-0 text-left pr-6">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{other.name || 'Unknown'}</p>
                            {lastMsg && <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{formatTime(conv.updatedAt)}</span>}
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <p className="text-xs text-gray-500 truncate">
                              {lastMsg
                                ? (lastMsg.senderId === currentUser?.id ? 'You: ' : '') + (lastMsg.content || (lastMsg.fileUrl ? '📎 File' : ''))
                                : other.designation || other.role}
                            </p>
                            {conv.unreadCount > 0 && (
                              <span className="flex-shrink-0 ml-2 bg-indigo-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                              </span>
                            )}
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(conv.id); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          title="Delete conversation"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}

          {/* ── Groups tab ── */}
          {tab === 'groups' && (
            loadingGroups ? (
              <div className="flex items-center justify-center py-10 text-gray-500 text-sm">Loading...</div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <svg className="w-10 h-10 text-zinc-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-gray-500 text-sm">No group chats yet</p>
                <p className="text-gray-600 text-xs mt-1">Click + to create a group</p>
              </div>
            ) : (
              groups.map((group) => {
                const lastMsg = group.messages[0];
                const isSelected = selectedGroup?.id === group.id;
                const isConfirming = confirmDeleteGroupId === group.id;
                return (
                  <div key={group.id} className="border-b border-gray-100 dark:border-zinc-900">
                    {isConfirming ? (
                      <div className={`flex items-center gap-2 px-4 py-3 bg-red-950/30 ${isSelected ? 'border-r-2 border-r-red-500' : ''}`}>
                        <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <p className="text-xs text-red-300 flex-1">Delete "{group.name}"?</p>
                        <button onClick={() => setConfirmDeleteGroupId(null)} className="text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
                        <button onClick={() => deleteGroup(group.id)} className="text-xs text-white bg-red-600 hover:bg-red-500 px-2 py-1 rounded transition-colors">Delete</button>
                      </div>
                    ) : (
                      <div className={`group relative flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors ${isSelected ? 'bg-gray-100 dark:bg-zinc-900 border-r-2 border-r-indigo-500' : ''}`}>
                        {/* Group avatar */}
                        <div className="w-10 h-10 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center font-semibold flex-shrink-0 text-sm">
                          {group.name.charAt(0).toUpperCase()}
                        </div>
                        <button onClick={() => openGroup(group)} className="flex-1 min-w-0 text-left pr-6">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{group.name}</p>
                            {lastMsg && <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{formatTime(group.updatedAt)}</span>}
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <p className="text-xs text-gray-500 truncate">
                              {lastMsg
                                ? (lastMsg.senderId === currentUser?.id ? 'You: ' : `${lastMsg.sender.name?.split(' ')[0]}: `) +
                                  (lastMsg.content || (lastMsg.fileUrl ? '📎 File' : ''))
                                : `${group.members.length} member${group.members.length !== 1 ? 's' : ''}`}
                            </p>
                            {group.unreadCount > 0 && (
                              <span className="flex-shrink-0 ml-2 bg-purple-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {group.unreadCount > 9 ? '9+' : group.unreadCount}
                              </span>
                            )}
                          </div>
                        </button>
                        {/* Creator can delete, others can leave */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (group.createdById === currentUser?.id) setConfirmDeleteGroupId(group.id);
                            else leaveGroup(group.id);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          title={group.createdById === currentUser?.id ? 'Delete group' : 'Leave group'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {group.createdById === currentUser?.id
                              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            }
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* ── Centre: chat panel ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* DM chat */}
        {selectedConv && !isViewingGroup && (
          <>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 flex items-center gap-3 flex-shrink-0">
              {(() => {
                const other = getOtherUser(selectedConv);
                return (
                  <>
                    <button
                      onClick={() => viewProfile(other.id)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold hover:ring-2 hover:ring-indigo-500 transition-all ${getRoleAvatarColor(other.role)}`}
                    >
                      {other.name?.charAt(0).toUpperCase() || '?'}
                    </button>
                    <button onClick={() => viewProfile(other.id)} className="text-left hover:opacity-80 transition-opacity">
                      <p className="text-gray-900 dark:text-white font-semibold leading-tight">{other.name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{other.designation || other.role}</p>
                    </button>
                    <span className={`ml-1 text-xs px-2 py-0.5 rounded font-medium ${getRoleBadgeColor(other.role)}`}>{other.role}</span>
                    <div className="ml-auto flex items-center gap-1">
                      {/* Chat Search toggle */}
                      <button
                        onClick={() => setShowChatSearch(!showChatSearch)}
                        className={`p-2 rounded-lg transition-colors ${showChatSearch ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10'}`}
                        title="Search messages"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </button>
                      {/* Pinned messages badge */}
                      {pinnedMessageCount > 0 && (
                        <button
                          onClick={() => setShowPinnedPanel(!showPinnedPanel)}
                          className={`p-2 rounded-lg transition-colors relative ${showPinnedPanel ? 'text-yellow-400 bg-yellow-500/10' : 'text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10'}`}
                          title={`${pinnedMessageCount} pinned message${pinnedMessageCount !== 1 ? 's' : ''}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          {pinnedMessageCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-5 flex items-center justify-center">{pinnedMessageCount > 9 ? '9+' : pinnedMessageCount}</span>
                          )}
                        </button>
                      )}
                      {/* Delete button */}
                      <button
                        onClick={() => setConfirmDeleteId(selectedConv.id)}
                        className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete conversation"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
            {renderMessages(false)}
            {renderCompose()}
          </>
        )}

        {/* Group chat */}
        {selectedGroup && isViewingGroup && (
          <>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 flex items-center gap-3 flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center font-semibold text-sm">
                {selectedGroup.name.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={() => { setShowGroupPanel((v) => !v); setProfileUser(null); }}
                className="text-left hover:opacity-80 transition-opacity"
              >
                <p className="text-gray-900 dark:text-white font-semibold leading-tight">{selectedGroup.name}</p>
                <p className="text-xs text-gray-500">{selectedGroup.members.length} member{selectedGroup.members.length !== 1 ? 's' : ''}</p>
              </button>
              <div className="ml-auto flex items-center gap-1">
                {/* Chat Search toggle */}
                <button
                  onClick={() => setShowChatSearch(!showChatSearch)}
                  className={`p-2 rounded-lg transition-colors ${showChatSearch ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10'}`}
                  title="Search messages"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
                {/* Pinned messages badge */}
                {pinnedMessageCount > 0 && (
                  <button
                    onClick={() => setShowPinnedPanel(!showPinnedPanel)}
                    className={`p-2 rounded-lg transition-colors relative ${showPinnedPanel ? 'text-yellow-400 bg-yellow-500/10' : 'text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10'}`}
                    title={`${pinnedMessageCount} pinned message${pinnedMessageCount !== 1 ? 's' : ''}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    {pinnedMessageCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-5 flex items-center justify-center">{pinnedMessageCount > 9 ? '9+' : pinnedMessageCount}</span>
                    )}
                  </button>
                )}
                {/* Members panel toggle */}
                <button
                  onClick={() => { setShowGroupPanel((v) => !v); setProfileUser(null); }}
                  className={`p-2 rounded-lg transition-colors ${showGroupPanel ? 'text-purple-400 bg-purple-500/10' : 'text-gray-500 hover:text-purple-400 hover:bg-purple-500/10'}`}
                  title="Group members"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                {/* Delete / Leave */}
                {isAmCreator ? (
                  <button
                    onClick={() => setConfirmDeleteGroupId(selectedGroup.id)}
                    className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete group"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => leaveGroup(selectedGroup.id)}
                    className="p-2 text-gray-600 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors"
                    title="Leave group"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Delete group inline confirm */}
            {confirmDeleteGroupId === selectedGroup.id && (
              <div className="px-6 py-3 bg-red-950/40 border-b border-red-900/40 flex items-center gap-3">
                <p className="text-sm text-red-300 flex-1">Delete "{selectedGroup.name}"? All messages will be lost.</p>
                <button onClick={() => setConfirmDeleteGroupId(null)} className="text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white px-3 py-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
                <button onClick={() => deleteGroup(selectedGroup.id)} className="text-xs text-white bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded transition-colors">Delete</button>
              </div>
            )}

            {renderMessages(true)}
            {renderCompose()}
          </>
        )}

        {/* Empty state */}
        {!selectedConv && !selectedGroup && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-gray-900 dark:text-white font-semibold text-lg mb-1">All Hands · 3Folks</h3>
            <p className="text-gray-500 text-sm max-w-xs">
              Chat directly with teammates or in groups. Pick a conversation or press{' '}
              <span className="text-indigo-400 font-medium">+</span> to start a new one.
            </p>
          </div>
        )}
      </div>

      {/* ── Right panel: profile OR group members ─────────────────────────── */}
      <div className={`flex-shrink-0 border-l border-gray-200 dark:border-zinc-800 bg-white dark:bg-black flex flex-col transition-all duration-300 overflow-hidden ${showRightPanel ? 'w-72' : 'w-0'}`}>
        {/* User profile panel — shown on top of group panel when active */}
        {profileUser && (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-800">
              {showGroupPanel ? (
                <button
                  onClick={() => setProfileUser(null)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Group Info
                </button>
              ) : (
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Profile</p>
              )}
              <button onClick={() => setProfileUser(null)} className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6">
              <div className="flex flex-col items-center mb-6">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold mb-3 ${getRoleAvatarColor(profileUser.role)}`}>
                  {profileUser.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <h3 className="text-gray-900 dark:text-white font-semibold text-lg text-center leading-tight">{profileUser.name || 'Unknown'}</h3>
                {profileUser.designation && <p className="text-gray-400 text-sm mt-1 text-center">{profileUser.designation}</p>}
                <span className={`mt-2 text-xs px-3 py-1 rounded-full font-medium ${getRoleBadgeColor(profileUser.role)}`}>{profileUser.role}</span>
              </div>
              <div className="space-y-3">
                {profileUser.email && (
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-100 dark:bg-zinc-900 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5">Email</p>
                      <a href={`mailto:${profileUser.email}`} className="text-sm text-gray-700 dark:text-gray-200 hover:text-indigo-400 transition-colors truncate block">{profileUser.email}</a>
                    </div>
                  </div>
                )}
                {profileUser.phone && (
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-100 dark:bg-zinc-900 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5">Phone</p>
                      <a href={`tel:${profileUser.phone}`} className="text-sm text-gray-700 dark:text-gray-200 hover:text-emerald-400 transition-colors">{profileUser.phone}</a>
                    </div>
                  </div>
                )}
                {!profileUser.email && !profileUser.phone && (
                  <p className="text-xs text-gray-600 text-center py-4">No contact details available</p>
                )}
              </div>
              {profileUser.id !== currentUser?.id && (
                <button
                  onClick={() => { startConversation(profileUser); setProfileUser(null); }}
                  className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Send Message
                </button>
              )}
            </div>
          </>
        )}

        {/* Pinned Messages Panel — shown when toggled on */}
        {!profileUser && showPinnedPanel && (isViewingGroup ? selectedGroup : selectedConv) && (
          <>
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-800">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                📌 Pinned Messages ({pinnedMessages?.length || 0})
              </p>
              <button
                onClick={() => setShowPinnedPanel(false)}
                className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Pinned Messages Panel Component */}
            <PinnedMessagesPanel
              isOpen={showPinnedPanel}
              onClose={() => setShowPinnedPanel(false)}
              pinnedMessages={pinnedMessages}
              onUnpin={(pinId) => unpinMessage?.(pinId)}
              getReactions={getMessageReactions}
              onReact={handleReactToMessage}
              onJumpToMessage={(messageId) => {
                // Scroll to message in chat
                const messageElement = document.getElementById(`message-${messageId}`);
                if (messageElement) {
                  messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
            />
          </>
        )}

        {/* Chat Search Panel — shown when toggled on */}
        {!profileUser && !showPinnedPanel && showChatSearch && (selectedGroup || selectedConv) && (
          <ChatSearch
            query={searchQuery2}
            results={searchResults}
            loading={searchLoading}
            error={searchError}
            currentPage={searchPage}
            totalPages={searchTotalPages}
            totalResults={searchTotalResults}
            onQueryChange={performSearch}
            onPageChange={searchGoToPage}
            onResultClick={(messageId) => {
              const messageElement = document.getElementById(`message-${messageId}`);
              if (messageElement) {
                messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
            onClose={() => { setShowChatSearch(false); clearSearch(); }}
          />
        )}

        {/* Group Info panel — hidden when profile is shown */}
        {!profileUser && showGroupPanel && selectedGroup && (
          <>
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-800">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Group Info</p>
              <button onClick={() => setShowGroupPanel(false)} className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Group identity block */}
              <div className="flex flex-col items-center px-5 py-6 border-b border-gray-200/60 dark:border-zinc-800/60">
                <div className="w-16 h-16 rounded-2xl bg-purple-600/30 text-purple-300 flex items-center justify-center text-2xl font-bold mb-3">
                  {selectedGroup.name.charAt(0).toUpperCase()}
                </div>
                <p className="text-gray-900 dark:text-white font-semibold text-base text-center leading-tight">{selectedGroup.name}</p>
                <p className="text-xs text-gray-500 mt-1">{selectedGroup.members.length} member{selectedGroup.members.length !== 1 ? 's' : ''}</p>
              </div>

              {/* Admin section */}
              <div className="px-4 pt-4 pb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 mb-2">Group Admin</p>
                {(() => {
                  const adminEntry = selectedGroup.members.find(m => m.user.id === selectedGroup.createdById);
                  const adminUser = adminEntry?.user || selectedGroup.createdBy;
                  const isMe = adminUser.id === currentUser?.id;
                  return (
                    <button
                      onClick={() => viewProfile(adminUser.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/15 transition-colors text-left"
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${getRoleAvatarColor(adminUser.role)}`}>
                        {adminUser.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{adminUser.name || 'Unknown'}</p>
                          {isMe && <span className="text-xs text-gray-500 flex-shrink-0">(you)</span>}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{adminUser.designation || adminUser.role}</p>
                      </div>
                      <span className="text-xs text-purple-400 bg-purple-500/20 px-1.5 py-0.5 rounded font-medium flex-shrink-0">Admin</span>
                    </button>
                  );
                })()}
              </div>

              {/* Members section */}
              <div className="px-4 pt-3 pb-4">
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Members ({selectedGroup.members.filter(m => m.user.id !== selectedGroup.createdById).length})
                  </p>
                  {/* Add member button — creator only */}
                  {isAmCreator && !showAddMember && (
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add
                    </button>
                  )}
                </div>

                {/* Add member search (creator only) */}
                {isAmCreator && showAddMember && (
                  <div className="mb-3 space-y-1.5">
                    <input
                      type="text"
                      value={addMemberSearch}
                      onChange={(e) => setAddMemberSearch(e.target.value)}
                      placeholder="Search people..."
                      autoFocus
                      className="w-full bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 focus:border-purple-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-600"
                    />
                    {addMemberResults.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => addMember(u.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg transition-colors text-left"
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${getRoleAvatarColor(u.role)}`}>
                          {u.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <span className="text-xs text-gray-700 dark:text-gray-200 truncate">{u.name || 'Unknown'}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => { setShowAddMember(false); setAddMemberSearch(''); setAddMemberResults([]); }}
                      className="text-xs text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-1"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Non-admin members list */}
                {selectedGroup.members.filter(m => m.user.id !== selectedGroup.createdById).length === 0 ? (
                  <p className="text-xs text-gray-600 text-center py-3">No other members yet</p>
                ) : (
                  <div className="space-y-1">
                    {selectedGroup.members
                      .filter(m => m.user.id !== selectedGroup.createdById)
                      .map((entry) => {
                        const isMe = entry.user.id === currentUser?.id;
                        return (
                          <div key={entry.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors group">
                            <button
                              onClick={() => viewProfile(entry.user.id)}
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 hover:ring-2 hover:ring-indigo-500 transition-all ${getRoleAvatarColor(entry.user.role)}`}
                              title={`View ${entry.user.name}'s profile`}
                            >
                              {entry.user.name?.charAt(0).toUpperCase() || '?'}
                            </button>
                            <button
                              onClick={() => viewProfile(entry.user.id)}
                              className="flex-1 min-w-0 text-left"
                            >
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs text-gray-900 dark:text-white font-medium truncate">{entry.user.name || 'Unknown'}</p>
                                {isMe && <span className="text-xs text-gray-500 flex-shrink-0">(you)</span>}
                              </div>
                              <p className="text-xs text-gray-600 truncate">{entry.user.designation || entry.user.role}</p>
                            </button>
                            <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getRoleBadgeColor(entry.user.role)}`}>
                              {entry.user.role === 'EMPLOYEE' ? 'EMP' : entry.user.role === 'AGENCY' ? 'AGY' : entry.user.role}
                            </span>
                            {/* Creator can remove non-self members */}
                            {isAmCreator && !isMe && (
                              <button
                                onClick={() => removeMember(selectedGroup.id, entry.user.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-400 transition-all rounded flex-shrink-0"
                                title="Remove member"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        );
                      })
                    }
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Create Group Modal ─────────────────────────────────────────────── */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-700">
              <h3 className="text-gray-900 dark:text-white font-semibold">New Group Chat</h3>
              <button
                onClick={() => { setShowCreateGroup(false); setCreateGroupName(''); setCreateGroupMembers([]); setCgMemberSearch(''); }}
                className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Group name */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Group name</label>
                <input
                  type="text"
                  value={createGroupName}
                  onChange={(e) => setCreateGroupName(e.target.value)}
                  placeholder="e.g. Campaign Team, Q4 Planning..."
                  autoFocus
                  className="w-full bg-gray-200 dark:bg-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 focus:border-purple-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-600"
                />
              </div>

              {/* Add members */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Add members</label>
                <div className="relative">
                  <input
                    type="text"
                    value={cgMemberSearch}
                    onChange={(e) => setCgMemberSearch(e.target.value)}
                    placeholder="Search teammates..."
                    className="w-full bg-gray-200 dark:bg-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 focus:border-purple-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-600"
                  />
                  {cgMemberResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-200 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-xl shadow-xl z-10 overflow-hidden max-h-40 overflow-y-auto">
                      {cgMemberResults.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setCreateGroupMembers((prev) => [...prev, u]);
                            setCgMemberSearch('');
                            setCgMemberResults([]);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-300 dark:hover:bg-zinc-700 transition-colors text-left"
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${getRoleAvatarColor(u.role)}`}>
                            {u.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 dark:text-white truncate">{u.name || 'Unknown'}</p>
                            <p className="text-xs text-gray-500 truncate">{u.designation || u.role}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected members chips */}
                {createGroupMembers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {createGroupMembers.map((m) => (
                      <div key={m.id} className="flex items-center gap-1.5 bg-purple-500/20 text-purple-300 text-xs px-2.5 py-1 rounded-full">
                        <span>{m.name?.split(' ')[0] || 'Unknown'}</span>
                        <button
                          onClick={() => setCreateGroupMembers((prev) => prev.filter((x) => x.id !== m.id))}
                          className="hover:text-white transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-600">You will be added automatically as admin.</p>
            </div>

            <div className="px-6 py-4 border-t border-gray-300 dark:border-zinc-700 flex gap-3">
              <button
                onClick={() => { setShowCreateGroup(false); setCreateGroupName(''); setCreateGroupMembers([]); setCgMemberSearch(''); }}
                className="flex-1 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createGroup}
                disabled={!createGroupName.trim() || creatingGroup}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
              >
                {creatingGroup ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Inner render helpers ───────────────────────────────────────────────────

  function renderMessages(isGroup: boolean) {
    const msgs = isGroup ? groupMessages : messages;
    const loading = isGroup ? loadingGroupMessages : loadingMessages;

    return (
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {isSelectMode && (
          <div className="sticky top-0 z-10 flex items-center justify-between py-2.5 bg-indigo-600/10 border-b border-indigo-500/30 backdrop-blur-sm -mx-6 px-6 -mt-4 mb-2">
            <div className="flex items-center gap-3">
              <button onClick={exitSelectMode} className="p-1 text-gray-400 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <span className="text-sm text-gray-300 font-medium">{selectedMsgIds.size} selected</span>
            </div>
            {selectedMsgIds.size > 0 && (
              <button onClick={deleteSelectedMessages} className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-500 text-sm">Loading messages...</div>
        ) : msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <p className="text-gray-500 text-sm">No messages yet. Say hello!</p>
          </div>
        ) : (
          msgs.map((msg, idx) => {
            const isMine = msg.senderId === currentUser?.id;
            const prevMsg = idx > 0 ? msgs[idx - 1] : null;
            const showDate = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
            // For group messages, determine sender role
            const senderRole = isGroup
              ? ((msg as GroupMessage).sender as any).role || 'AGENCY'
              : (selectedConv ? getOtherUser(selectedConv).role : 'AGENCY');

            return (
              <div
                key={msg.id}
                id={`message-${msg.id}`}
                onPointerDown={() => handleMsgPointerDown(msg.id, isMine)}
                onPointerUp={handleMsgPointerUp}
                onPointerLeave={handleMsgPointerUp}
              >
                {showDate && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                    <span className="text-xs text-gray-500 px-2">
                      {new Date(msg.createdAt).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}
                    </span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                  </div>
                )}
                <div className={`flex gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                  {!isMine && (
                    <button
                      onClick={() => viewProfile(msg.senderId)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-1 hover:ring-2 hover:ring-indigo-500 transition-all ${getRoleAvatarColor(senderRole)}`}
                      title={`View ${msg.sender.name}'s profile`}
                    >
                      {msg.sender.name?.charAt(0).toUpperCase() || '?'}
                    </button>
                  )}
                  <div className={`max-w-[70%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                    {/* Show sender name in groups for non-mine messages */}
                    {isGroup && !isMine && (
                      <p className="text-xs text-gray-500 px-1 mb-0.5">{msg.sender.name?.split(' ')[0] || 'Unknown'}</p>
                    )}
                    {/* Message bubble — click to open reaction picker */}
                    <div className="relative">
                      {isSelectMode && isMine && (
                        <div className={`absolute -left-7 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedMsgIds.has(msg.id) ? 'bg-indigo-500 border-indigo-500' : 'border-gray-400 bg-transparent'}`}>
                          {selectedMsgIds.has(msg.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                      <div
                        className={`rounded-2xl text-sm leading-relaxed overflow-hidden cursor-pointer select-none ${isMine ? 'bg-indigo-600 text-white rounded-tr-md' : 'bg-gray-200 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 rounded-tl-md'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelectMode) {
                            handleMsgClick(msg.id, isMine);
                          } else {
                            setActiveReactMessageId(activeReactMessageId === msg.id ? null : msg.id);
                          }
                        }}
                      >
                        {msg.fileUrl && (
                          msg.fileType?.startsWith('image/') ? (
                            <a href={`${API_URL}${msg.fileUrl}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                              <img src={`${API_URL}${msg.fileUrl}`} alt={msg.fileName || 'image'} className="max-w-xs max-h-60 object-cover block" />
                            </a>
                          ) : (
                            <a
                              href={`${API_URL}${msg.fileUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              download={msg.fileName || true}
                              onClick={(e) => e.stopPropagation()}
                              className={`flex items-center gap-2 px-4 py-3 hover:opacity-80 transition-opacity ${isMine ? 'text-indigo-100' : 'text-gray-300'}`}
                            >
                              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-sm truncate max-w-[200px]">{msg.fileName || 'Download file'}</span>
                              <svg className="w-4 h-4 flex-shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </a>
                          )
                        )}
                        {msg.content && <p className="px-4 py-2.5">{renderMessageWithMentions(msg.content, isGroup ? selectedGroup?.members : undefined)}</p>}
                      </div>
                      {/* Floating emoji reaction picker — appears on bubble click */}
                      {!isSelectMode && activeReactMessageId === msg.id && (
                        <div className={`absolute ${isMine ? 'right-0' : 'left-0'} bottom-full mb-1 z-50 bg-white dark:bg-zinc-900 rounded-full shadow-xl px-2 py-1.5 flex items-center gap-1 border border-gray-200 dark:border-zinc-700`}>
                          {['👍', '❤️', '🔥', '👏'].map((emoji) => (
                            <button
                              key={emoji}
                              onClick={(e) => { e.stopPropagation(); handleReactToMessage(msg.id, emoji); }}
                              className="text-xl hover:scale-125 transition-transform p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800"
                              title={`React with ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveReactMessageId(null); }}
                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-1 px-1"
                            title="Close"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-1 mt-1">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {!isSelectMode && (
                        <button
                          onClick={() => {
                            pinMessage(
                              msg.id,
                              msg.content || (msg.fileUrl ? `📎 ${msg.fileName || 'File'}` : 'Message'),
                              msg.senderId,
                              msg.sender.name || 'Unknown'
                            );
                          }}
                          className="p-1 text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
                          title="Pin message"
                        >
                          📌
                        </button>
                      )}
                    </div>
                    {/* Message Reactions */}
                    <MessageReactions
                      messageId={msg.id}
                      reactions={getMessageReactions(msg.id)}
                      onReact={(emoji) => handleReactToMessage(msg.id, emoji)}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
        {(groupTypists.length > 0 || (dmTyping && !!selectedConv && !isGroup)) && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex -space-x-2">
              {(isGroup
                ? groupTypists.slice(0, 3)
                : [{ userId: 'dm-other', userName: getOtherUser(selectedConv!).name || '?' }]
              ).map((t, i) => (
                <div
                  key={t.userId}
                  className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center text-white text-[10px] font-bold typing-avatar-breathe"
                  style={{ backgroundColor: typingAvatarColor(t.userId), zIndex: 10 - i, animationDelay: `${i * 200}ms` }}
                  title={t.userName}
                >
                  {t.userName.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isGroup
                ? buildTypingText(groupTypists)
                : `${getOtherUser(selectedConv!).name?.split(' ')[0] ?? 'Someone'} is typing`}
            </span>
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    );
  }

  function renderCompose() {
    return (
      <div className="px-6 py-4 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 flex-shrink-0">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />

        {attachedFile && (
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-900 rounded-lg px-3 py-2 mb-2 border border-gray-300 dark:border-zinc-700">
            {attachedFile.type.startsWith('image/') ? (
              <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate flex-1">{attachedFile.name}</span>
            <button onClick={() => setAttachedFile(null)} className="text-gray-500 hover:text-red-400 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {showEmojiPicker && (
          <div className="mb-2 bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-xl p-2 grid grid-cols-10 gap-1">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { setNewMessage((prev) => prev + emoji); setShowEmojiPicker(false); }}
                className="text-lg hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg p-1 transition-colors leading-none"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {showMentionDropdown && mentionFilteredMembers.length > 0 && (
          <div className="mb-2 bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-xl overflow-hidden">
            <div className="max-h-40 overflow-y-auto">
              {mentionFilteredMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleMentionSelect(member)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-200 dark:hover:bg-zinc-800 text-sm text-gray-900 dark:text-white transition-colors flex items-center gap-2"
                >
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center flex-shrink-0 font-semibold">
                    {member.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <span>{member.name}</span>
                  {member.designation && <span className="text-xs text-gray-500">({member.designation})</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-900 rounded-xl px-3 py-2 border border-gray-300 dark:border-zinc-700 focus-within:border-indigo-500 transition-colors">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0 disabled:opacity-40"
            title="Attach file"
          >
            {uploading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setShowEmojiPicker((v) => !v)}
            className={`p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0 text-base leading-none ${showEmojiPicker ? 'text-indigo-400' : 'text-gray-500 hover:text-yellow-400'}`}
            title="Emoji"
          >
            😊
          </button>
          <input
            ref={messageInputRef}
            type="text"
            value={newMessage}
            onChange={(e) => handleMessageInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-transparent text-gray-900 dark:text-white text-sm focus:outline-none placeholder-gray-400 dark:placeholder-gray-600"
          />
          <button
            onClick={sendMessage}
            disabled={(!newMessage.trim() && !attachedFile) || sending || uploading}
            className="p-2 text-indigo-400 hover:text-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5 ml-1">Press Enter to send · Max file size 25 MB</p>
      </div>
    );
  }
}
