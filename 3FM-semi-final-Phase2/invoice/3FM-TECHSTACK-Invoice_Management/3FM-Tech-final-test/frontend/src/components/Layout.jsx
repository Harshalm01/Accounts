import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Briefcase, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import companyLogo from '../assets/3fm-logo.avif';

const Layout = ({ children }) => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/influencers', icon: Users, label: 'Influencers' },
    { path: '/campaigns', icon: Briefcase, label: 'Campaigns' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-lg">
        {/* Logo Section */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <img
            src={companyLogo}
            alt="3 Folks Media"
            className="w-full h-24 object-contain mix-blend-multiply"
          />
        </div>

        {/* Navigation */}
        <nav className="mt-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-600 border-r-4 border-indigo-600' : ''
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Section at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">
                {user?.first_name && user?.last_name
                  ? `${user.first_name} ${user.last_name}`
                  : user?.username || 'User'}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  user?.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                  user?.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {user?.role || 'viewer'}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        {children}
      </div>
    </div>
  );
};

export default Layout;
