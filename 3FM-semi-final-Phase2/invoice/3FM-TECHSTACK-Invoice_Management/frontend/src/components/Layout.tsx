import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { API_URL } from "../config";
import NotificationsPanel from "./NotificationsPanel";

interface User {
  name: string | null;
  email: string;
  role?: 'ADMIN' | 'BRAND' | 'AGENCY' | 'EMPLOYEE';
  designation?: string | null;
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);

  // Force dark mode permanently
  useEffect(() => {
    document.documentElement.classList.add('dark');

    // Get user from localStorage
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
      fetch(`${API_URL}/api/assignments/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => { if (typeof data.total === 'number') setNotifCount(data.total); })
        .catch(() => {});
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);

    const socket = io(API_URL);
    const userStr = localStorage.getItem('user');
    const userId = userStr ? JSON.parse(userStr).id : null;

    if (userId) {
      socket.on(`assignment:new:${userId}`, () => setNotifCount((c) => c + 1));
      socket.on(`assignment:responded:${userId}`, () => fetchCount());
      socket.on(`chat:unread:${userId}`, () => setNotifCount((c) => c + 1));
    }

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Define all navigation links with role-based access
  // Order: Users → Influencers → Campaign → Brands → Roaster → Invoice → (Notifications) → Settings
  const allNavLinks = [
    { path: "/users",       name: "Users",       icon: IconUserManage, roles: ['ADMIN'] },
    { path: "/influencers", name: "Influencers", icon: IconUsers,      roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
    { path: "/campaign",    name: "Campaign",    icon: IconMegaphone,  roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
    { path: "/brands",      name: "Brands",      icon: IconBriefcase,  roles: ['ADMIN', 'AGENCY', 'BRAND', 'EMPLOYEE'] },
    { path: "/roaster",     name: "Roaster",     icon: IconRoaster,    roles: ['ADMIN', 'AGENCY', 'BRAND', 'EMPLOYEE'] },
    { path: "/invoice",     name: "Invoice",     icon: IconReceipt,    roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
    { path: "/settings",    name: "Settings",    icon: IconSettings,   roles: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
  ];

  // Filter nav links based on user role
  const navLinks = allNavLinks.filter(link => {
    if (!user?.role) return true;
    return link.roles.includes(user.role);
  });

  // Split so Settings always stays last, with Notifications just before it
  const mainNavLinks = navLinks.filter(l => l.path !== '/settings');
  const settingsLink  = navLinks.find(l => l.path === '/settings');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black transition-colors duration-200">
        {/* Mobile Menu Button */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-black border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-300 hover:text-white p-2 rounded-lg hover:bg-zinc-900 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img src="/3fm-logo.png" alt="3FM" className="h-10 object-contain" />
          {/* Mobile bell */}
          <button
            onClick={() => setShowPanel(true)}
            className="relative p-2 text-gray-300 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors"
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
        <div className={`fixed inset-y-0 left-0 w-56 bg-black shadow-lg transition-all duration-300 z-50 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}>
          {/* Logo */}
          <div className="px-4 py-5 border-b border-zinc-800 bg-black flex-shrink-0">
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
                  `flex items-center px-4 py-2.5 text-gray-400 hover:bg-zinc-900 hover:text-indigo-400 transition-colors ${
                    isActive ? 'bg-zinc-900 text-indigo-400 border-r-2 border-indigo-500' : ''
                  }`
                }
              >
                <link.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                <span className="font-medium text-sm">{link.name}</span>
              </NavLink>
            ))}

            {/* Notifications — between Invoice and Settings */}
            {(user?.role === 'AGENCY' || user?.role === 'ADMIN' || user?.role === 'EMPLOYEE') && (
              <button
                onClick={() => setShowPanel(true)}
                className="w-full flex items-center px-4 py-2.5 text-gray-400 hover:bg-zinc-900 hover:text-indigo-400 transition-colors"
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
                  `flex items-center px-4 py-2.5 text-gray-400 hover:bg-zinc-900 hover:text-indigo-400 transition-colors ${
                    isActive ? 'bg-zinc-900 text-indigo-400 border-r-2 border-indigo-500' : ''
                  }`
                }
              >
                <settingsLink.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                <span className="font-medium text-sm">{settingsLink.name}</span>
              </NavLink>
            )}
          </nav>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-zinc-800 bg-black">
            {/* User Profile */}
            {user && (
              <div className="px-4 py-3 border-b border-zinc-800">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
                    {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{user.name}</p>
                    {user.designation && (
                      <p className="text-xs text-gray-500 truncate">{user.designation}</p>
                    )}
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-400 hover:text-red-400 hover:bg-zinc-900 rounded-lg transition-colors"
                  title="Logout"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="text-sm">Logout</span>
                </button>
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
          <Outlet />
        </div>

        {/* Notifications Panel */}
        <NotificationsPanel
          isOpen={showPanel}
          onClose={() => {
            setShowPanel(false);
            // Refresh count after closing
            const token = localStorage.getItem('token');
            if (token) {
              fetch(`${API_URL}/api/assignments/unread-count`, {
                headers: { Authorization: `Bearer ${token}` },
              })
                .then((r) => r.json())
                .then((data) => { if (typeof data.total === 'number') setNotifCount(data.total); })
                .catch(() => {});
            }
          }}
        />
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
