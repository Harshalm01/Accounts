import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { API_URL } from "../config";
import NotificationsPanel from "./NotificationsPanel";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import OnboardingModal from "./OnboardingModal";
import GlobalSearchModal from "./GlobalSearchModal";
import DynamicAvatar from "./DynamicAvatar";
import PageTransition from "../layout/PageTransition";
import EasterEggs from "./EasterEggs";
import { type ThemeName, applyTheme } from "../utils/themes";
import PresenceBar from "./PresenceBar";
import { usePresence } from "../hooks/usePresence";
import { useLiveUpdates } from "../hooks/useLiveUpdates";
import BroadcastPopupModal from "./BroadcastPopupModal";
import { type AvatarStyle } from "./AvatarCustomization";

interface User {
  name: string | null;
  email: string;
  role?: 'ADMIN' | 'BRAND' | 'AGENCY' | 'EMPLOYEE';
  designation?: string | null;
  canAccessAccounts?: boolean;
  canApprovePayments?: boolean;
  credits?: number;
}

interface Toast {
  id: number;
  message: string;
  groupName: string;
}

interface NotifToast {
  id: number;
  title: string;
  body: string;
  type: string;
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifToasts, setNotifToasts] = useState<NotifToast[]>([]);
  const [theme, setTheme] = useState<ThemeName>(() => {
    return (localStorage.getItem('theme') as ThemeName) || 'dark';
  });
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>(() => {
    try {
      return JSON.parse(localStorage.getItem('avatarStyle') ?? '{"type":"initials"}');
    } catch {
      return { type: 'initials' };
    }
  });
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeBroadcasts, setActiveBroadcasts] = useState<any[]>([]);
  const pendingG = useRef(false);
  const gTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { onlineUsers } = usePresence();
  const { liveToasts, dismissToast } = useLiveUpdates();

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for avatar style changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'avatarStyle') {
        try {
          const newStyle = JSON.parse(e.newValue || '{"type":"initials"}');
          setAvatarStyle(newStyle);
        } catch {
          setAvatarStyle({ type: 'initials' });
        }
      }
    };

    const handleAvatarStyleChanged = (e: Event) => {
      const customEvent = e as CustomEvent;
      setAvatarStyle(customEvent.detail);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('avatarStyleChanged', handleAvatarStyleChanged);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('avatarStyleChanged', handleAvatarStyleChanged);
    };
  }, []);

  // Get user from localStorage on route change
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const parsedUser = JSON.parse(userStr);
        setUser(parsedUser);
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
  }, [location.pathname]);

  // Fetch unread count + subscribe to real-time updates
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const fetchCount = () => {
      fetch(`${API_URL}/api/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (r.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return null;
          }
          return r.json();
        })
        .then((data) => { if (data && typeof data.count === 'number') setNotifCount(data.count); })
        .catch(() => {});
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);

    // Fetch DM unread count + group unread count combined
    const fetchDmCount = () => {
      const token2 = localStorage.getItem('token');
      if (!token2) return;
      Promise.all([
        fetch(`${API_URL}/api/dm/unread-count`, { headers: { Authorization: `Bearer ${token2}` } }),
        fetch(`${API_URL}/api/groups/unread-count`, { headers: { Authorization: `Bearer ${token2}` } }),
      ])
        .then(([dmRes, groupRes]) => {
          if (dmRes.status === 401 || groupRes.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return;
          }
          return Promise.all([dmRes.json(), groupRes.json()]);
        })
        .then((results) => {
          if (!results) return;
          const [dmData, groupData] = results;
          if (pathnameRef.current === '/all-hands') {
            setDmUnreadCount(0);
            return;
          }
          const total = (dmData.count || 0) + (groupData.count || 0);
          setDmUnreadCount(total);
        })
        .catch(() => {});
    };
    fetchDmCount();
    const dmInterval = setInterval(fetchDmCount, 30000);

    const socket = io(API_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });
    socket.connect(); // Re-enables autoReconnect if socket was previously closed by another component; no-op if already connected
    const userStr = localStorage.getItem('user');
    const userId = userStr ? JSON.parse(userStr).id : null;

    // Join personal room on every connect (initial + reconnects)
    const joinRoom = () => { if (userId) socket.emit('join', userId); };
    socket.on('connect', joinRoom);
    // Also emit immediately in case socket is already connected
    if (userId && socket.connected) socket.emit('join', userId);

    if (userId) {
      socket.on(`notification:new:${userId}`, (notif: { id: string; title: string; body: string; type: string }) => {
        setNotifCount((c) => c + 1);
        const toastId = Date.now();
        setNotifToasts((prev) => [...prev, { id: toastId, title: notif.title, body: notif.body, type: notif.type }]);
        setTimeout(() => setNotifToasts((prev) => prev.filter((t) => t.id !== toastId)), 6000);
      });
      socket.on(`dm:message:${userId}`, () => {
        if (pathnameRef.current !== '/all-hands') setDmUnreadCount((c) => c + 1);
      });
      socket.on(`group:added:${userId}`, (payload: { group?: { name?: string } }) => {
        const groupName = payload?.group?.name || 'a group';
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message: 'You were added to', groupName }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
        if (pathnameRef.current !== '/all-hands') setDmUnreadCount((c) => c + 1);
      });
      socket.on('credits:updated', (payload: { userId: string; credits: number }) => {
        if (payload.userId === userId) {
          setUser((prev) => prev ? { ...prev, credits: payload.credits } : prev);
          const stored = localStorage.getItem('user');
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              localStorage.setItem('user', JSON.stringify({ ...parsed, credits: payload.credits }));
            } catch (e) {}
          }
        }
      });
      socket.on('broadcast:new', async (broadcast: any) => {
        // Add new broadcast to active broadcasts
        setActiveBroadcasts((prev) => [broadcast, ...prev]);
        // Auto-dismiss after 6 seconds
        setTimeout(() => {
          setActiveBroadcasts((prev) => prev.filter((b) => b.id !== broadcast.id));
        }, 6000);
      });
    }

    return () => {
      clearInterval(interval);
      clearInterval(dmInterval);
      socket.disconnect();
    };
  }, []);

  // Reset DM unread count when visiting All Hands & keep ref in sync
  useEffect(() => {
    pathnameRef.current = location.pathname;
    if (location.pathname === '/all-hands') {
      setDmUnreadCount(0);
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login');
    }
  };

  // Check onboarding on first mount (Feature 34)
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const parsed = JSON.parse(userStr);
        if (parsed.onboardingCompleted === false) {
          setShowOnboarding(true);
        }
      } catch (e) {}
    }
  }, []);

  // Global keyboard shortcuts (Feature 31)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K: global search (works even in input fields)
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowSearchModal(true);
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === '?') { setShowShortcutsModal(true); return; }
      if (e.key === 'Escape') { setShowShortcutsModal(false); setShowOnboarding(false); setShowSearchModal(false); return; }
      if (e.key === '/') { e.preventDefault(); setShowSearchModal(true); return; }

      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        pendingG.current = true;
        if (gTimeoutRef.current) clearTimeout(gTimeoutRef.current);
        gTimeoutRef.current = setTimeout(() => { pendingG.current = false; }, 1000);
        return;
      }

      if (pendingG.current) {
        pendingG.current = false;
        if (gTimeoutRef.current) clearTimeout(gTimeoutRef.current);
        const navMap: Record<string, string> = {
          i: '/influencers', c: '/campaign', b: '/brands',
          r: '/roaster', a: '/analytics', s: '/settings',
        };
        const dest = navMap[e.key.toLowerCase()];
        if (dest) { e.preventDefault(); navigate(dest); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (gTimeoutRef.current) clearTimeout(gTimeoutRef.current);
    };
  }, [navigate]);

  const toggleTheme = () => {
    // Quick toggle: cycle dark → light → dark. Full theme picker is in Settings.
    const newTheme: ThemeName = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ themePreference: newTheme }),
      }).catch(() => {});
    }
  };

  const handleOnboardingComplete = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/auth/onboarding-complete`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const parsed = JSON.parse(userStr);
          localStorage.setItem('user', JSON.stringify({ ...parsed, onboardingCompleted: true }));
        } catch (e) {}
      }
    } catch (e) {} finally {
      setShowOnboarding(false);
    }
  };

  // Define all navigation links with role-based access
  const allNavLinks = [
    { path: "/users",               name: "Users",            icon: IconUserManage,      roles: ['ADMIN'] },
    { path: "/announcements",       name: "Announcements",    icon: IconAnnouncements,   roles: ['ADMIN'] },
    { path: "/announcements-feed",  name: "Announcements",    icon: IconAnnouncements,   roles: ['AGENCY', 'EMPLOYEE', 'BRAND'] },
    { path: "/activity",            name: "Activity",         icon: IconActivity,        roles: ['ADMIN'] },
    { path: "/influencers",         name: "Influencers",      icon: IconUsers,           roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
    { path: "/campaign",            name: "Campaign",         icon: IconMegaphone,       roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
    { path: "/brands",              name: "Brands",           icon: IconBriefcase,       roles: ['ADMIN', 'AGENCY', 'BRAND', 'EMPLOYEE'] },
    { path: "/roaster",             name: "Roaster",          icon: IconRoaster,         roles: ['ADMIN', 'AGENCY', 'BRAND', 'EMPLOYEE'] },
    { path: "/invoice",             name: "Invoice",          icon: IconReceipt,         roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
    { path: "/analytics",           name: "Analytics",        icon: IconAnalytics,       roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
    { path: "/calendar",            name: "Calendar",         icon: IconCalendar,        roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
    { path: "/accounts",            name: "Accounts",         icon: IconAccounts,        roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
    { path: "/all-hands",           name: "All Hands",        icon: IconChat,            roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
    { path: "/settings",            name: "Settings",         icon: IconSettings,        roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
  ];

  // Filter nav links based on user role
  const navLinks = allNavLinks.filter(link => {
    if (!user?.role) return true;
    // Accounts tab: only show to users with canAccessAccounts flag or ADMIN
    if (link.path === '/accounts') {
      return user.role === 'ADMIN' || user.canAccessAccounts === true;
    }
    return link.roles.includes(user.role);
  });

  // Split so Settings always stays last, with Notifications just before it
  const mainNavLinks = navLinks.filter(l => l.path !== '/settings');
  const settingsLink  = navLinks.find(l => l.path === '/settings');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black transition-colors duration-200">
        <EasterEggs />
        {/* Mobile Menu Button */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img src="/3fm-logo.png" alt="3FM" className="h-10 object-contain" />
          {/* Mobile bell */}
          <button
            onClick={() => setShowPanel(true)}
            className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>
        </div>

        {/* Mobile Backdrop Overlay */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 w-56 bg-white dark:bg-black shadow-lg transition-all duration-300 z-50 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}>
          {/* Logo */}
          <div className="px-4 py-5 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-black flex-shrink-0">
            <img
              src="/3fm-logo.png"
              alt="3 Folks Media"
              className="w-full h-20 object-contain"
            />
          </div>

          {/* Navigation — scrollable, Settings always last */}
          <nav className="flex-1 overflow-y-auto py-2">
            {/* Main links (all except Settings) */}
            {mainNavLinks.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-4 py-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-900 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors ${
                    isActive ? 'bg-gray-100 dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 border-r-2 border-indigo-500' : ''
                  }`
                }
              >
                <link.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                <span className="font-medium text-sm flex-1">{link.name}</span>
                {link.path === '/all-hands' && dmUnreadCount > 0 && (
                  <span className="bg-indigo-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {dmUnreadCount > 9 ? '9+' : dmUnreadCount}
                  </span>
                )}
              </NavLink>
            ))}

            {/* Notifications — between Invoice and Settings */}
            {(user?.role === 'AGENCY' || user?.role === 'ADMIN' || user?.role === 'EMPLOYEE') && (
              <button
                onClick={() => setShowPanel(true)}
                className="w-full flex items-center px-4 py-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-900 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                <span className="relative mr-3 flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {notifCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </span>
                <span className="font-medium text-sm">Notifications</span>
                {notifCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {notifCount}
                  </span>
                )}
              </button>
            )}

            {/* Settings — always last */}
            {settingsLink && (
              <NavLink
                to={settingsLink.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-4 py-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-900 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors ${
                    isActive ? 'bg-gray-100 dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 border-r-2 border-indigo-500' : ''
                  }`
                }
              >
                <settingsLink.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                <span className="font-medium text-sm">{settingsLink.name}</span>
              </NavLink>
            )}
            {user?.role === 'ADMIN' && <PresenceBar onlineUsers={onlineUsers} />}
          </nav>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-black">
            {/* User Profile */}
            {user && (
              <div className="px-4 py-3 border-b border-gray-200 dark:border-zinc-800">
                <div className="flex items-center gap-3 mb-3">
                  <DynamicAvatar
                    userName={user.name || user.email}
                    avatarStyle={avatarStyle}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{user.name}</p>
                    {user.designation && (
                      <p className="text-xs text-gray-500 truncate">{user.designation}</p>
                    )}
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>
                {/* Credits display for heads */}
                {user.role === 'AGENCY' && user.credits !== undefined && (
                  <div className="mb-3 flex items-center gap-1.5 px-1">
                    <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className={`text-xs font-semibold ${(user.credits ?? 0) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      Credits: ₹{(user.credits ?? 0).toLocaleString()}
                    </span>
                  </div>
                )}
                {/* Theme toggle + Logout row */}
                <div className="flex items-center gap-2">
                  {/* Dark/Light toggle */}
                  <button
                    onClick={toggleTheme}
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {theme === 'dark' ? (
                      /* Sun icon */
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07l-.71.71M6.34 17.66l-.71.71m12.02 0l-.71-.71M6.34 6.34l-.71-.71M12 5a7 7 0 100 14A7 7 0 0012 5z" />
                      </svg>
                    ) : (
                      /* Moon icon */
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                    )}
                  </button>
                  {/* Keyboard shortcuts hint */}
                  <button
                    onClick={() => setShowShortcutsModal(true)}
                    title="Keyboard shortcuts (?)"
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </button>
                  {/* Logout */}
                  <button
                    onClick={handleLogout}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
                    title="Logout"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="text-sm">Logout</span>
                  </button>
                </div>
              </div>
            )}
            <div className="px-4 py-4">
              <p className="text-xs text-gray-400 text-center">
                © {new Date().getFullYear()} 3Folks Media
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="md:ml-56 pt-16 md:pt-0 p-4 md:p-8">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>

        {/* Notifications Panel */}
        <NotificationsPanel
          isOpen={showPanel}
          onClose={() => {
            setShowPanel(false);
            // Refresh unread count after closing panel
            const token = localStorage.getItem('token');
            if (token) {
              fetch(`${API_URL}/api/notifications/unread-count`, {
                headers: { Authorization: `Bearer ${token}` },
              })
                .then((r) => r.json())
                .then((data) => { if (typeof data.count === 'number') setNotifCount(data.count); })
                .catch(() => {});
            }
          }}
        />

        {/* Toast notifications (assignments + group-added + live updates) */}
        {(toasts.length > 0 || notifToasts.length > 0 || liveToasts.length > 0) && (
          <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
            {/* Live update toasts */}
            {liveToasts.map((toast) => (
              <div
                key={toast.id}
                className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-cyan-500/40 text-gray-800 dark:text-white px-4 py-3 rounded-xl shadow-2xl max-w-xs animate-fade-in"
              >
                <div className="w-8 h-8 rounded-full bg-cyan-600/30 text-cyan-300 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300 flex-1 min-w-0">{toast.message}</p>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {/* Assignment / campaign notification toasts */}
            {notifToasts.map((toast) => (
              <div
                key={toast.id}
                className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-indigo-500/40 text-gray-800 dark:text-white px-4 py-3 rounded-xl shadow-2xl max-w-xs animate-fade-in"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{toast.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{toast.body}</p>
                </div>
                <button
                  onClick={() => setNotifToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {/* Group-added toasts */}
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-purple-500/40 text-gray-800 dark:text-white px-4 py-3 rounded-xl shadow-2xl max-w-xs animate-fade-in"
              >
                <div className="w-8 h-8 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">{toast.message}</p>
                  <p className="text-sm font-semibold text-purple-300 truncate">"{toast.groupName}"</p>
                </div>
                <button
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Broadcast Popup Modal */}
        {activeBroadcasts.length > 0 && (
          <BroadcastPopupModal
            broadcast={activeBroadcasts[0]}
            onClose={() => setActiveBroadcasts((prev) => prev.filter((_, i) => i !== 0))}
          />
        )}

        {/* Keyboard Shortcuts Modal (Feature 31) */}
        {showShortcutsModal && (
          <KeyboardShortcutsModal onClose={() => setShowShortcutsModal(false)} />
        )}

        {/* Global Search Modal */}
        {showSearchModal && (
          <GlobalSearchModal onClose={() => setShowSearchModal(false)} />
        )}

        {/* Onboarding Modal (Feature 34) */}
        {showOnboarding && user && (
          <OnboardingModal
            userRole={user.role || 'AGENCY'}
            onComplete={handleOnboardingComplete}
            onSkip={handleOnboardingComplete}
          />
        )}
      </div>
  );
}

/* Icons */

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m-10.43 0A5.002 5.002 0 0115 13a5.002 5.002 0 018.43 3.143M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857M15 7a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function IconBriefcase({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function IconMegaphone({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6"
      />
    </svg>
  );
}

function IconReceipt({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586"
      />
    </svg>
  );
}

function IconRoaster({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-3-3h-2m-9.5-1.5A3.5 3.5 0 019 10c0-.394.065-.774.185-1.128M15 10a3.5 3.5 0 01-6.815 1.128m-1.056 2.87a7 7 0 1010.742 0M12 14v7m-4 0h8"
      />
    </svg>
  );
}

function IconUserManage({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function IconAnnouncements({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 001-5.868m-5.423-1.016A5.988 5.988 0 0020 13a5.988 5.988 0 01-6.923 5.988m5.868-9.005a1 1 0 10-2 0m2 0a1 1 0 10-2 0m4 0a1 1 0 10-2 0"
      />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function IconChat({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function IconActivity({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  );
}

function IconAnalytics({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function IconAccounts({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}
