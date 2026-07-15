import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { SecurityLottie, LoadingLottie, ErrorLottie } from '../components/LottieAnimations';
import { API_URL } from '../config';

// Backend API connection for login

interface CampaignOption {
  id: string;
  name: string;
  brandName: string;
}

export default function Login() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<'team' | 'creator'>('team');

  // --- Creator portal state ---
  const [creatorName, setCreatorName] = useState('');
  const [creatorEmail, setCreatorEmail] = useState('');
  const [campaignQuery, setCampaignQuery] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignOption | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [creatorError, setCreatorError] = useState('');
  const [creatorSuccess, setCreatorSuccess] = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      const userStr = localStorage.getItem('user');
      let redirectPath = '/influencers';
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          if (user.role === 'BRAND') {
            redirectPath = '/brands';
          }
        } catch (e) {
          console.error('Failed to parse user data');
        }
      }
      navigate(redirectPath);
    }
  }, [navigate]);

  // Debounced campaign search
  useEffect(() => {
    if (!campaignQuery.trim() || selectedCampaign) {
      setCampaigns([]);
      setDropdownOpen(false);
      return;
    }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/creator-portal/campaigns/search?q=${encodeURIComponent(campaignQuery)}`);
        const data = await res.json();
        setCampaigns(data.campaigns || []);
        setDropdownOpen((data.campaigns || []).length > 0);
      } catch { /* ignore */ }
    }, 300);
  }, [campaignQuery, selectedCampaign]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store token and user data
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Apply user theme preference to DOM immediately
      const themeFromServer = data.user.themePreference || 'dark';
      localStorage.setItem('theme', themeFromServer);
      document.documentElement.classList.toggle('dark', themeFromServer === 'dark');

      // Redirect based on role
      if (data.user.role === 'BRAND') {
        navigate('/brands');
      } else {
        navigate('/influencers');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) {
      setCreatorError('Please select a campaign from the search results.');
      return;
    }
    setCreatorError('');
    setCreatorLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/creator-portal/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorEmail, creatorName, campaignId: selectedCampaign.id }),
      });
      const data = await res.json();
      setCreatorSuccess(data.message || 'Request submitted!');
    } catch {
      setCreatorError('Failed to submit request. Please try again.');
    } finally {
      setCreatorLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-600 rounded-full mix-blend-lighten filter blur-xl opacity-10 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-600 rounded-full mix-blend-lighten filter blur-xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-600 rounded-full mix-blend-lighten filter blur-xl opacity-10 animate-blob animation-delay-4000"></div>

        {/* Floating Lottie Security Animation */}
        <div className="absolute top-10 right-20 opacity-30">
          <SecurityLottie className="w-24 h-24" />
        </div>
        <div className="absolute bottom-20 left-20 opacity-25">
          <SecurityLottie className="w-32 h-32" />
        </div>
      </div>

      <div className={`w-full max-w-md relative z-10 transition-all duration-1000 transform ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
      }`}>
        {/* Logo/Brand */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-32 h-32 mb-4 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-600 rounded-3xl shadow-2xl animate-float opacity-10"></div>
            <img
              src="/3fm-logo.png"
              alt="3FM Logo"
              className="relative z-10 w-28 h-28 object-contain drop-shadow-xl"
            />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-transparent bg-clip-text animate-gradient">3FM Dashboard</h1>
          <p className="text-gray-400 mt-3 text-lg">Welcome back!</p>
        </div>

        {/* Login Card */}
        <div className="bg-black border border-zinc-800 rounded-3xl shadow-2xl p-8 hover:shadow-3xl transition-all duration-500">

          {/* Tab switcher */}
          <div className="flex bg-zinc-900 rounded-xl p-1 mb-6">
            {(['team', 'creator'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => { setActiveTab(tab); setError(''); setCreatorError(''); setCreatorSuccess(''); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab === 'team' ? 'Team Login' : 'Creator Portal'}
              </button>
            ))}
          </div>

          {/* ── TEAM LOGIN ── */}
          {activeTab === 'team' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
                  <ErrorLottie className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="transform transition-all duration-500 hover:scale-[1.02]">
                <label htmlFor="identifier" className="block text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                  Email or Phone Number
                </label>
                <input
                  id="identifier"
                  type="text"
                  required
                  value={formData.identifier}
                  onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                  className="w-full px-5 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 hover:border-blue-500 bg-zinc-900 text-white"
                  placeholder="Enter your email or phone number"
                />
              </div>

              <div className="transform transition-all duration-500 hover:scale-[1.02]">
                <label htmlFor="password" className="block text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-5 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 hover:border-purple-500 bg-zinc-900 text-white"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white font-bold py-4 px-4 rounded-xl hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative overflow-hidden group"
              >
                <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></span>
                <span className="relative z-10">
                  {loading ? (
                    <>
                      <div className="flex items-center gap-2">
                        <LoadingLottie className="w-6 h-6" />
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In
                      <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </span>
              </button>
            </form>
          )}

          {/* ── CREATOR PORTAL ── */}
          {activeTab === 'creator' && (
            <>
              <p className="text-gray-400 text-sm mb-5">Request access to submit your invoice for a campaign. You'll receive a link via email once approved.</p>

              {creatorSuccess ? (
                <div className="bg-green-500/10 border border-green-500/40 text-green-400 px-5 py-5 rounded-xl text-sm font-medium text-center">
                  <svg className="w-8 h-8 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {creatorSuccess}
                </div>
              ) : (
                <form onSubmit={handleCreatorSubmit} className="space-y-5">
                  {creatorError && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">{creatorError}</div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-gray-400 mb-2">Your Name (optional)</label>
                    <input type="text" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} placeholder="e.g. Aishwarya Sharma"
                      className="w-full px-4 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-zinc-900 text-white placeholder-gray-500" />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-400 mb-2">Your Email <span className="text-red-400">*</span></label>
                    <input type="email" required value={creatorEmail} onChange={(e) => setCreatorEmail(e.target.value)} placeholder="you@example.com"
                      className="w-full px-4 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-zinc-900 text-white placeholder-gray-500" />
                  </div>

                  <div className="relative">
                    <label className="block text-sm font-semibold text-gray-400 mb-2">Campaign Name <span className="text-red-400">*</span></label>
                    {selectedCampaign ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-4 py-3.5 border-2 border-purple-600/60 rounded-xl bg-zinc-900 text-white text-sm">
                          {selectedCampaign.name} <span className="text-gray-400">— {selectedCampaign.brandName}</span>
                        </div>
                        <button type="button" onClick={() => { setSelectedCampaign(null); setCampaignQuery(''); }} className="text-gray-500 hover:text-white p-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <>
                        <input type="text" value={campaignQuery} onChange={(e) => { setCampaignQuery(e.target.value); setSelectedCampaign(null); }}
                          placeholder="Search campaign by name…"
                          className="w-full px-4 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-zinc-900 text-white placeholder-gray-500" />
                        {dropdownOpen && campaigns.length > 0 && (
                          <div className="absolute z-20 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                            {campaigns.map((c) => (
                              <button key={c.id} type="button" onClick={() => { setSelectedCampaign(c); setCampaignQuery(c.name); setDropdownOpen(false); }}
                                className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors">
                                <p className="text-sm font-medium text-white">{c.name}</p>
                                <p className="text-xs text-gray-400">{c.brandName}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <button type="submit" disabled={creatorLoading}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-4 rounded-xl hover:opacity-90 transition-all disabled:opacity-50">
                    {creatorLoading ? 'Submitting…' : 'Request Invoice Access'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>© 2026 3FM Dashboard. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
