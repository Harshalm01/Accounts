import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import { type ThemeName, THEMES, applyTheme } from '../utils/themes';
import { soundManager } from '../utils/notificationSounds';
import AvatarCustomization, { type AvatarStyle } from '../components/AvatarCustomization';


interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: 'ADMIN' | 'AGENCY' | 'BRAND' | 'EMPLOYEE';
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
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(
    () => (localStorage.getItem('theme') as ThemeName) || 'dark'
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(
    () => JSON.parse(localStorage.getItem('soundEnabled') ?? 'true')
  );
  const [notificationSoundType, setNotificationSoundType] = useState<string>(
    () => localStorage.getItem('notificationSoundType') ?? 'bell'
  );
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>(() => {
    try {
      return JSON.parse(localStorage.getItem('avatarStyle') ?? '{"type":"initials"}');
    } catch {
      return { type: 'initials' };
    }
  });

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

  const handleThemeToggle = async (newTheme: ThemeName) => {
    setCurrentTheme(newTheme);
    applyTheme(newTheme);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ themePreference: newTheme }),
      });
    } catch (e) {}
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    soundManager.setSoundEnabled(enabled);
  };

  const handleSoundTypeChange = (soundType: string) => {
    setNotificationSoundType(soundType);
    localStorage.setItem('notificationSoundType', soundType);
    // Play preview of selected sound
    playNotificationSoundPreview(soundType);
  };

  const handleAvatarStyleChange = (newStyle: AvatarStyle) => {
    setAvatarStyle(newStyle);
    localStorage.setItem('avatarStyle', JSON.stringify(newStyle));

    // Dispatch custom event for same-tab updates
    const event = new CustomEvent('avatarStyleChanged', { detail: newStyle });
    window.dispatchEvent(event);

    // Optionally: Send to backend to save permanently
    try {
      const token = localStorage.getItem('token');
      fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarStyle: newStyle }),
      }).catch(() => {});
    } catch (e) {}
  };

  const playNotificationSoundPreview = (soundType: string) => {
    const soundMap: Record<string, string> = {
      'bell': '/sounds/notification-bell.mp3',
      'chime': '/sounds/success-chime.mp3',
      'buzz': '/sounds/error-buzz.mp3',
    };

    const soundFile = soundMap[soundType] || '/sounds/notification-bell.mp3';

    // Use different frequencies for each sound type fallback beep
    const fallbackFrequencies: Record<string, { freq: number; duration: number }> = {
      'bell': { freq: 800, duration: 200 },
      'chime': { freq: 1000, duration: 150 },
      'buzz': { freq: 400, duration: 300 },
    };

    const fallback = fallbackFrequencies[soundType] || fallbackFrequencies['bell'];

    try {
      const audio = new Audio(soundFile);
      audio.volume = 0.5;
      audio.play().catch(() => {
        // Fallback beep if audio file fails - different tone per type
        playBeepSound(fallback.freq, fallback.duration);
      });
    } catch (error) {
      playBeepSound(fallback.freq, fallback.duration);
    }
  };

  const playBeepSound = (frequency: number = 800, duration: number = 200) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.5, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (error) {
      // Silent fallback
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-black">
        <div className="w-10 h-10 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const roleColor =
    user?.role === 'ADMIN' ? 'bg-purple-900 text-purple-200' :
    user?.role === 'AGENCY' ? 'bg-blue-900 text-blue-200' :
    'bg-orange-900 text-orange-200';

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your account information and security</p>
      </div>

      <div className="max-w-2xl space-y-6">

        {/* Profile Info */}
        <div className="bg-gray-100 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Profile Information</h2>
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
                className="w-full px-4 py-2.5 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Email Address</label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Phone Number</label>
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                className="w-full px-4 py-2.5 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

        {/* Change Password - ADMIN only */}
        {/* Appearance */}
        <div className="bg-gray-100 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Appearance</h2>
              <p className="text-xs text-gray-400">Choose how 3FM looks for you</p>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-3 gap-3">
              {(Object.entries(THEMES) as [ThemeName, typeof THEMES[ThemeName]][]).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => handleThemeToggle(key)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    currentTheme === key
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                  }`}
                >
                  {/* Color preview circles */}
                  <div className="flex gap-1.5">
                    <span className="w-4 h-4 rounded-full border border-gray-300 dark:border-zinc-600" style={{ backgroundColor: meta.preview.bg }} />
                    <span className="w-4 h-4 rounded-full border border-gray-300 dark:border-zinc-600" style={{ backgroundColor: meta.preview.accent }} />
                    <span className="w-4 h-4 rounded-full border border-gray-300 dark:border-zinc-600" style={{ backgroundColor: meta.preview.text }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{meta.label}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</span>
                  {currentTheme === key && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Active</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Avatar Customization */}
        <div className="bg-gray-100 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Avatar Style</h2>
              <p className="text-xs text-gray-400">Choose your avatar style</p>
            </div>
          </div>
          <div className="p-6">
            <AvatarCustomization
              userName={user?.name || 'User'}
              currentStyle={avatarStyle}
              onAvatarStyleChange={handleAvatarStyleChange}
            />
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-gray-100 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Notifications</h2>
              <p className="text-xs text-gray-400">Manage notification preferences</p>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between py-3 px-4 bg-white dark:bg-black rounded-lg border border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5.951-1.429 5.951 1.429a1 1 0 001.169-1.409l-7-14z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Notification Sounds</p>
                  <p className="text-xs text-gray-500">Enable sound alerts for notifications</p>
                </div>
              </div>
              <button
                onClick={() => handleSoundToggle(!soundEnabled)}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  soundEnabled ? 'bg-green-600' : 'bg-gray-400'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    soundEnabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {soundEnabled && (
              <p className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-lg px-3 py-2">
                ✓ Notification sounds are enabled
              </p>
            )}
            {!soundEnabled && (
              <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700/30 rounded-lg px-3 py-2">
                Notification sounds are currently disabled
              </p>
            )}
            {soundEnabled && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-zinc-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sound Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'bell', label: '🔔 Bell', desc: 'notification-bell' },
                    { id: 'chime', label: '✨ Chime', desc: 'success-chime' },
                    { id: 'buzz', label: '📢 Buzz', desc: 'error-buzz' },
                  ].map((sound) => (
                    <button
                      key={sound.id}
                      onClick={() => handleSoundTypeChange(sound.id)}
                      className={`p-3 rounded-lg border-2 transition-all text-center ${
                        notificationSoundType === sound.id
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <div className="text-lg font-semibold">{sound.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sound.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {user?.role === 'ADMIN' && (
        <div className="bg-gray-100 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Change Password</h2>
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
                className="w-full px-4 py-2.5 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
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
                className="w-full px-4 py-2.5 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
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
                className="w-full px-4 py-2.5 bg-white dark:bg-black border border-gray-300 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
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
        )}

        {/* Account Info */}
        <div className="bg-gray-100 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Account Info</h2>
              <p className="text-xs text-gray-400">Read-only account details</p>
            </div>
          </div>

          <div className="p-6 space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-zinc-800">
              <span className="text-sm text-gray-400">Account Created</span>
              <span className="text-sm text-gray-900 dark:text-white">
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-400">Last Login</span>
              <span className="text-sm text-gray-900 dark:text-white">
                {lastLogin
                  ? new Date(lastLogin).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <div className="bg-gray-100 dark:bg-zinc-900 rounded-xl border border-red-900/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-900/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-900 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Logout</h2>
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
