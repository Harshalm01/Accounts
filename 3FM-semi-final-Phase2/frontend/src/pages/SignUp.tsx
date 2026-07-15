import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Lottie from 'lottie-react';
import signupAnimation from '../assets/animations/Signup-animation.json';
import { API_URL } from '../config';


export default function SignUp() {
  const [isVisible, setIsVisible] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: 'AGENCY' as 'ADMIN' | 'AGENCY' | 'BRAND',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/influencers');
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(formData.phone)) {
      setError('Enter a valid 10-digit Indian mobile number (starting with 6-9)');
      return;
    }

    setLoading(true);

    try {
      console.log('🔄 Signup attempt:', { 
        name: formData.name, 
        email: formData.email, 
        role: formData.role,
        apiUrl: API_URL 
      });
      
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          role: formData.role,
        }),
      });

      console.log('📡 Response received:', { 
        status: response.status, 
        statusText: response.statusText,
        url: response.url 
      });

      const data = await response.json();
      console.log('📋 Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Don't store token yet - show success animation first
      // Show success animation
      setShowSuccessAnimation(true);
      
      // After 3 seconds, redirect to login page
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      console.error('❌ Signup error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name,
        cause: err.cause
      });
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Show fullscreen success animation
  if (showSuccessAnimation) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 animate-fade-in">
        <div className="w-full max-w-2xl px-4">
          <Lottie 
            animationData={signupAnimation} 
            loop={false}
            className="w-full h-auto"
          />
        </div>
        <div className="text-center mt-8 space-y-4 animate-fade-in">
          <h2 className="text-5xl font-bold text-white">Welcome to 3FM!</h2>
          <p className="text-2xl text-gray-400">Account created successfully</p>
          <div className="flex items-center justify-center gap-2 text-gray-500 mt-6">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Redirecting to login...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
      {/* Animated Background Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-10 w-72 h-72 bg-blue-600 rounded-full mix-blend-lighten filter blur-xl opacity-10 animate-blob"></div>
        <div className="absolute top-40 left-10 w-72 h-72 bg-indigo-600 rounded-full mix-blend-lighten filter blur-xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-purple-600 rounded-full mix-blend-lighten filter blur-xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      <div className={`w-full max-w-6xl mx-auto relative z-10 transition-all duration-1000 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className="grid md:grid-cols-2 gap-8 items-center min-h-[600px] p-4">
          
          {/* Left Side - Logo & Welcome */}
          <div className="hidden md:flex flex-col items-center justify-center p-8 space-y-6">
            <div className="w-full max-w-sm transform hover:scale-105 transition-all duration-500 animate-float">
              <div className="relative w-64 h-64 mx-auto mb-6">
                <img 
                  src="/auth_logo.png" 
                  alt="3FM Logo" 
                  className="relative z-10 w-full h-full object-contain drop-shadow-2xl"
                />
              </div>
            </div>
            <div className="text-center space-y-3">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-transparent bg-clip-text animate-gradient">
                Join Us Today!
              </h1>
              <p className="text-gray-400 text-lg">
                Create your account and start managing campaigns
              </p>
            </div>
          </div>

          {/* Right Side - Sign Up Form */}
          <div className="bg-black border border-zinc-800 rounded-3xl shadow-2xl p-8 md:p-12 hover:shadow-3xl transition-all duration-500">
            {/* Mobile Logo */}
            <div className="md:hidden flex justify-center mb-6">
              <img 
                src="/auth_logo.png" 
                alt="3FM Logo" 
                className="w-24 h-24 object-contain drop-shadow-lg"
              />
            </div>
            {/* Form Header */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-2">Sign Up</h2>
              <p className="text-gray-400">Create your account to get started</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl flex items-center gap-3 backdrop-blur-sm animate-shake">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="transform transition-all duration-500 hover:scale-[1.02]">
              <label htmlFor="name" className="block text-sm font-semibold text-gray-400 mb-2">
                Full Name
              </label>
              <div className="relative group">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full pl-12 pr-5 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 hover:border-blue-500/50 bg-zinc-900/50 backdrop-blur-sm text-white group-hover:bg-zinc-900"
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div className="transform transition-all duration-500 hover:scale-[1.02]">
              <label htmlFor="role" className="block text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                I am a
              </label>
              <select
                id="role"
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as 'ADMIN' | 'AGENCY' | 'BRAND' })}
                className="w-full px-5 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 hover:border-purple-500 bg-zinc-900 text-white"
              >
                <option value="ADMIN">Admin</option>
                <option value="AGENCY">Agency</option>
                <option value="BRAND">Brand / Client</option>
              </select>
              <p className="mt-2 text-xs text-gray-500">
                {formData.role === 'ADMIN' 
                  ? '🔐 Full system access and management' 
                  : formData.role === 'AGENCY' 
                  ? '📊 Manage campaigns and pitch to brands' 
                  : '🏢 Receive pitches from agencies'}
              </p>
            </div>

            <div className="transform transition-all duration-500 hover:scale-[1.02]">
              <label htmlFor="email" className="block text-sm font-semibold text-gray-400 mb-2">
                Email Address
              </label>
              <div className="relative group">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-12 pr-5 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 hover:border-indigo-500/50 bg-zinc-900/50 backdrop-blur-sm text-white group-hover:bg-zinc-900"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="transform transition-all duration-500 hover:scale-[1.02]">
              <label htmlFor="phone" className="block text-sm font-semibold text-gray-400 mb-2">
                Phone Number
              </label>
              <div className="relative group">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-green-500 transition-colors pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <input
                  id="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  className="w-full pl-12 pr-5 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-300 hover:border-green-500/50 bg-zinc-900/50 backdrop-blur-sm text-white group-hover:bg-zinc-900"
                  placeholder="Enter your phone number"
                  maxLength={10}
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">10-digit Indian mobile number (starts with 6–9)</p>
            </div>

            <div className="transform transition-all duration-500 hover:scale-[1.02]">
              <label htmlFor="password" className="block text-sm font-semibold text-gray-400 mb-2">
                Password
              </label>
              <div className="relative group">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-500 transition-colors pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-12 pr-12 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 hover:border-purple-500/50 bg-zinc-900/50 backdrop-blur-sm text-white group-hover:bg-zinc-900"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors z-10"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="transform transition-all duration-500 hover:scale-[1.02]">
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-400 mb-2">
                Confirm Password
              </label>
              <div className="relative group">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full pl-12 pr-12 py-3.5 border-2 border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 hover:border-indigo-500/50 bg-zinc-900/50 backdrop-blur-sm text-white group-hover:bg-zinc-900"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors z-10"
                >
                  {showConfirmPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-bold py-4 px-4 rounded-xl hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300 shadow-[0_0_25px_rgba(59,130,246,0.5)] hover:shadow-[0_0_35px_rgba(79,70,229,0.7)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
            >
              <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></span>
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <div className="relative">
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="absolute inset-0 animate-ping">
                        <svg className="h-5 w-5 opacity-30" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        </svg>
                      </span>
                    </div>
                    <span className="font-semibold">Creating account...</span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Create Account</span>
                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </>
                )}
              </span>
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-blue-500 hover:text-blue-400 font-semibold hover:underline transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>

          {/* Mobile - Show logo on small screens */}
          <div className="md:hidden text-center mt-6 pt-6 border-t border-zinc-800">
            <div className="w-24 h-24 mx-auto mb-3">
              <Lottie 
                animationData={signupAnimation} 
                loop={true}
                className="w-full h-full"
              />
            </div>
            <p className="text-sm text-gray-500">3FM Dashboard</p>
          </div>
        </div>
        
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>© 2026 3FM Dashboard. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
