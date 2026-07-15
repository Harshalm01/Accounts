import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';


interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: 'ADMIN' | 'AGENCY' | 'BRAND';
  designation: string | null;
  createdAt: string;
}

export default function Settings() {
  const navigate = useNavigate();

  // Seed immediately from localStorage — no spinner needed
  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  })();

  const [user, setUser] = useState<User | null>(storedUser);
  const [loading, setLoading] = useState(!storedUser); // only show spinner if nothing in localStorage

  const [profileForm, setProfileForm] = useState({
    name: storedUser?.name || '',
    email: storedUser?.email || '',
    phone: storedUser?.phone || '',
    designation: storedUser?.designation || '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [lastLogin, setLastLogin] = useState<string | null>(null);

  useEffect(() => {
    fetchUser();
    fetchLastLogin();
  }, []);

  const fetchUser = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setUser(data);
      setProfileForm({ name: data.name || '', email: data.email || '', phone: data.phone || '', designation: data.designation || '' });
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLastLogin = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/login-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      const successLogins = data.filter((h: any) => h.status === 'success');
      if (successLogins.length > 0) setLastLogin(successLogins[0].loginAt);
    } catch (error) {
      console.error('Failed to fetch login history:', error);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (profileForm.phone) {
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(profileForm.phone)) {
        setProfileError('Enter a valid 10-digit Indian mobile number (starting with 6-9)');
        return;
      }
    }

    setProfileLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(profileForm),
      });
      const data = await response.json();
      if (!response.ok) { setProfileError(data.error || 'Failed to update profile'); return; }
      setUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
      setProfileSuccess('Profile updated successfully');
    } catch {
      setProfileError('Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    setPasswordLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }),
      });
      const data = await response.json();
      if (!response.ok) { setPasswordError(data.error || 'Failed to change password'); return; }
      setPasswordSuccess('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch {
      setPasswordError('Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-10 h-10 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const roleColor =
    user?.role === 'ADMIN' ? 'bg-purple-900 text-purple-200' :
    user?.role === 'AGENCY' ? 'bg-blue-900 text-blue-200' :
    'bg-orange-900 text-orange-200';

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your account information and security</p>
      </div>

      <div className="max-w-2xl space-y-6">

        {/* Profile Info */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Profile Information</h2>
              <p className="text-xs text-gray-400">Update your name, email and phone</p>
            </div>
          </div>

          <form onSubmit={handleProfileSave} className="p-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {user?.designation && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-900 text-indigo-200">
                  {user.designation}
                </span>
              )}
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${roleColor}`}>{user?.role}</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Full Name</label>
              <input
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-black border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Email Address</label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-black border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Phone Number</label>
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                className="w-full px-4 py-2.5 bg-black border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="10-digit mobile number"
                maxLength={10}
              />
            </div>

            {profileError && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">{profileError}</p>}
            {profileSuccess && <p className="text-sm text-green-400 bg-green-900/20 border border-green-800 rounded-lg px-4 py-2">{profileSuccess}</p>}

            <button
              type="submit"
              disabled={profileLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {profileLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Change Password</h2>
              <p className="text-xs text-gray-400">Update your account password</p>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Current Password</label>
              <input
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="w-full px-4 py-2.5 bg-black border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="Enter current password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">New Password</label>
              <input
                type="password"
                required
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full px-4 py-2.5 bg-black border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="Min. 6 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                required
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full px-4 py-2.5 bg-black border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="Re-enter new password"
              />
            </div>

            {passwordError && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-green-400 bg-green-900/20 border border-green-800 rounded-lg px-4 py-2">{passwordSuccess}</p>}

            <button
              type="submit"
              disabled={passwordLoading}
              className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {passwordLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Account Info */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Account Info</h2>
              <p className="text-xs text-gray-400">Read-only account details</p>
            </div>
          </div>

          <div className="p-6 space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-zinc-800">
              <span className="text-sm text-gray-400">Account Created</span>
              <span className="text-sm text-white">
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-400">Last Login</span>
              <span className="text-sm text-white">
                {lastLogin
                  ? new Date(lastLogin).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <div className="bg-zinc-900 rounded-xl border border-red-900/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-900/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-900 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Logout</h2>
              <p className="text-xs text-gray-400">Sign out of your account</p>
            </div>
          </div>
          <div className="p-6">
            <button
              onClick={handleLogout}
              className="w-full py-2.5 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
