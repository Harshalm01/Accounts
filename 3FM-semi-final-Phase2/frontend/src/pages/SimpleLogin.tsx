import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Lottie from 'lottie-react';
import loginAnimation from '../assets/animations/login-animation.json';
import { API_URL } from '../config';

interface CampaignOption {
  id: string;
  name: string;
  brandName: string;
}

export default function SimpleLogin() {
  const [isVisible, setIsVisible] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const navigate = useNavigate();

  // --- Team login state ---
  const [formData, setFormData] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<'team' | 'creator'>('team');

  // --- Creator portal state ---
  const [creatorName, setCreatorName] = useState('');
  const [creatorEmail, setCreatorEmail] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [creatorError, setCreatorError] = useState('');
  const [creatorSuccess, setCreatorSuccess] = useState('');

  useEffect(() => {
    setIsVisible(true);
    const token = localStorage.getItem('token');
    if (token) {
      const userStr = localStorage.getItem('user');
      let redirectPath = '/influencers';
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          if (user.role === 'BRAND') redirectPath = '/brands';
        } catch { /* ignore */ }
      }
      navigate(redirectPath);
    }
  }, [navigate]);

  const handleTeamLogin = async (e: React.FormEvent) => {
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
      if (!response.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      const savedTheme = data.user.themePreference || 'dark';
      localStorage.setItem('theme', savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');

      setShowSuccessAnimation(true);
      setTimeout(() => {
        navigate(data.user.role === 'BRAND' ? '/brands' : '/influencers');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📝 [Creator Portal] Form submitted');
    console.log('  - Name:', creatorName);
    console.log('  - Email:', creatorEmail);
    console.log('  - Campaign:', campaignName);

    if (!creatorName.trim()) {
      console.error('❌ Creator name required');
      setCreatorError('Your full name is required.');
      return;
    }
    if (!creatorEmail.trim()) {
      console.error('❌ Email required');
      setCreatorError('Email is required.');
      return;
    }
    if (!campaignName.trim()) {
      console.error('❌ Campaign name required');
      setCreatorError('Campaign name is required.');
      return;
    }

    setCreatorError('');
    setCreatorLoading(true);
    try {
      console.log('📡 [Creator Portal] Sending request to /api/creator-portal/request');
      const res = await fetch(`${API_URL}/api/creator-portal/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorEmail,
          creatorName,
          campaignName
        }),
      });
      console.log('📡 [Creator Portal] Response status:', res.status, res.statusText);
      const data = await res.json();
      console.log('📡 [Creator Portal] Response data:', data);
      setCreatorSuccess(data.message || 'Request submitted successfully!');
      // Reset form
      setCreatorName('');
      setCreatorEmail('');
      setCampaignName('');
    } catch (err) {
      console.error('❌ [Creator Portal] Error:', err);
      setCreatorError('Failed to submit request. Please try again.');
    } finally {
      setCreatorLoading(false);
    }
  };

  if (showSuccessAnimation) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 animate-fade-in">
        <div className="w-full max-w-2xl px-4">
          <Lottie animationData={loginAnimation} loop={false} className="w-full h-auto" />
        </div>
        <div className="text-center mt-8 space-y-4 animate-fade-in">
          <h2 className="text-5xl font-bold text-white">Welcome Back!</h2>
          <p className="text-2xl text-gray-400">Login successful</p>
          <div className="flex items-center justify-center gap-2 text-gray-500 mt-6">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Redirecting to dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-600 rounded-full mix-blend-lighten filter blur-xl opacity-10 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-indigo-600 rounded-full mix-blend-lighten filter blur-xl opacity-10 animate-blob animation-delay-2000" />
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-purple-600 rounded-full mix-blend-lighten filter blur-xl opacity-10 animate-blob animation-delay-4000" />
      </div>

      <div className={`w-full max-w-6xl mx-auto relative z-10 transition-all duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="grid md:grid-cols-2 gap-8 items-center min-h-[600px] p-4">

          {/* Left Side */}
          <div className="hidden md:flex flex-col items-center justify-center p-8 space-y-6">
            <div className="w-full max-w-sm transform hover:scale-105 transition-all duration-500 animate-float">
              <div className="relative w-64 h-64 mx-auto mb-6">
                <img src="/auth_logo.png" alt="3FM Logo" className="relative z-10 w-full h-full object-contain drop-shadow-2xl" />
              </div>
            </div>
            <div className="text-center space-y-3">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-transparent bg-clip-text animate-gradient">
                Welcome!
              </h1>
              <p className="text-gray-400 text-lg">3FM Dashboard</p>
            </div>
          </div>

          {/* Right Side — Card */}
          <div className="bg-black border border-zinc-800 rounded-3xl shadow-2xl p-8 md:p-12 hover:shadow-3xl transition-all duration-500">

            {/* Tab switcher */}
            <div className="flex bg-zinc-900 rounded-xl p-1 mb-8">
              {(['team', 'creator'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setActiveTab(tab); setError(''); setCreatorError(''); setCreatorSuccess(''); }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    activeTab === tab
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab === 'team' ? 'Team Login' : 'Creator Portal'}
                </button>
              ))}
            </div>

            {/* ── TEAM LOGIN ── */}
            {activeTab === 'team' && (
              <>
                <div className="mb-8">
                  <h2 className="text-3xl font-bold text-white mb-2">Sign In</h2>
                  <p className="text-gray-400">Enter your credentials to access your account</p>
                </div>

                <form onSubmit={handleTeamLogin} className="space-y-7">
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3.5 rounded-xl flex items-center gap-3 animate-shake backdrop-blur-sm">
                      <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-medium">{error}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="identifier" className="block text-sm font-semibold text-gray-400 mb-2.5 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                      Email, Phone, or Name
                    </label>
                    <div className="relative group">
                      <input
                        id="identifier"
                        type="text"
                        required
                        value={formData.identifier}
                        onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                        className="w-full px-5 py-4 pl-12 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 hover:border-zinc-700 bg-zinc-900/50 backdrop-blur-sm text-white placeholder-gray-500 group-hover:bg-zinc-900"
                        placeholder="Enter your email, phone, or name"
                      />
                      <svg className="w-5 h-5 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="password" className="block text-sm font-semibold text-gray-400 mb-2.5 flex items-center gap-2">
                      <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Password
                    </label>
                    <div className="relative group">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-5 py-4 pl-12 pr-12 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-300 hover:border-zinc-700 bg-zinc-900/50 backdrop-blur-sm text-white placeholder-gray-500 group-hover:bg-zinc-900"
                        placeholder="••••••••"
                      />
                      <svg className="w-5 h-5 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors focus:outline-none">
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 transition-all cursor-pointer" />
                      <span className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">Remember me</span>
                    </label>
                    <a href="#" className="text-sm text-blue-500 hover:text-blue-400 font-medium hover:underline transition-colors">Forgot password?</a>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-bold py-4 px-4 rounded-xl hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300 shadow-[0_0_25px_rgba(59,130,246,0.5)] hover:shadow-[0_0_35px_rgba(79,70,229,0.7)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
                  >
                    <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                    <span className="relative z-10 flex items-center justify-center gap-2.5">
                      {loading ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span className="font-semibold">Signing in...</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">Sign In</span>
                          <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </>
                      )}
                    </span>
                  </button>
                </form>
              </>
            )}

            {/* ── CREATOR PORTAL ── */}
            {activeTab === 'creator' && (
              <>
                <div className="mb-8">
                  <h2 className="text-3xl font-bold text-white mb-2">Submit Invoice</h2>
                  <p className="text-gray-400 text-sm">Request access to submit your invoice for a campaign. You'll receive a link via email once approved.</p>
                </div>

                {creatorSuccess ? (
                  <div className="bg-green-500/10 border border-green-500/40 text-green-400 px-5 py-5 rounded-xl text-sm font-medium text-center">
                    <svg className="w-8 h-8 mx-auto mb-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      <label className="block text-sm font-semibold text-gray-400 mb-2">Creator's Full Name <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        required
                        value={creatorName}
                        onChange={(e) => setCreatorName(e.target.value)}
                        placeholder="e.g. Aishwarya Sharma"
                        className="w-full px-4 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-zinc-900/50 text-white placeholder-gray-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-400 mb-2">Your Email <span className="text-red-400">*</span></label>
                      <input
                        type="email"
                        required
                        value={creatorEmail}
                        onChange={(e) => setCreatorEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-4 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-zinc-900/50 text-white placeholder-gray-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-400 mb-2">Campaign Name <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        required
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        placeholder="e.g. Ghafoor"
                        className="w-full px-4 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-zinc-900/50 text-white placeholder-gray-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={creatorLoading}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-4 rounded-xl hover:opacity-90 transition-all disabled:opacity-50 mt-2"
                    >
                      {creatorLoading ? 'Submitting…' : 'Request Invoice Access'}
                    </button>
                  </form>
                )}
              </>
            )}

            {/* Mobile logo */}
            <div className="md:hidden text-center mt-6 pt-6 border-t border-zinc-800">
              <div className="w-24 h-24 mx-auto mb-3">
                <img src="/auth_logo.png" alt="3FM Logo" className="w-full h-full object-contain drop-shadow-lg" />
              </div>
              <p className="text-sm text-gray-500 font-semibold">3FM Dashboard</p>
            </div>
          </div>
        </div>

        <div className="text-center mt-8 text-sm text-gray-500">
          <p>© 2026 3FM Dashboard. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
