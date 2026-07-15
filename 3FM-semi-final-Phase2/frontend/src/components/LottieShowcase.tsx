import { useState, useEffect } from 'react';
import { 
  LoginLottie, 
  SignupLottie, 
  LoadingLottie, 
  SecurityLottie, 
  UserLottie, 
  CelebrationLottie,
  SuccessLottie,
  ErrorLottie,
  DashboardHeroLottie,
  DataVisualizationLottie 
} from './LottieAnimations';

export default function LottieShowcase() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-8">
      <div className={`max-w-6xl mx-auto transition-all duration-1000 transform ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
      }`}>
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-transparent bg-clip-text mb-4">
            Lottie Animations Showcase
          </h1>
          <p className="text-gray-600 text-lg">Beautiful animations for 3FM Dashboard</p>
        </div>

        {/* Auth Animations */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl p-8 mb-8 border border-white/20">
          <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <span className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></span>
            Authentication Animations
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 mb-3 hover:scale-110 transition-transform">
                <LoginLottie className="w-16 h-16 mx-auto" />
              </div>
              <p className="font-semibold text-gray-700">Login</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 mb-3 hover:scale-110 transition-transform">
                <SignupLottie className="w-16 h-16 mx-auto" />
              </div>
              <p className="font-semibold text-gray-700">Signup</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 mb-3 hover:scale-110 transition-transform">
                <LoadingLottie className="w-16 h-16 mx-auto" />
              </div>
              <p className="font-semibold text-gray-700">Loading</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 mb-3 hover:scale-110 transition-transform">
                <SecurityLottie className="w-16 h-16 mx-auto" />
              </div>
              <p className="font-semibold text-gray-700">Security</p>
            </div>
          </div>
        </div>

        {/* User & Success Animations */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl p-8 mb-8 border border-white/20">
          <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <span className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-500 rounded-full"></span>
            User & Feedback Animations
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-6 mb-3 hover:scale-110 transition-transform">
                <UserLottie className="w-16 h-16 mx-auto" />
              </div>
              <p className="font-semibold text-gray-700">User Profile</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-2xl p-6 mb-3 hover:scale-110 transition-transform">
                <CelebrationLottie className="w-16 h-16 mx-auto" />
              </div>
              <p className="font-semibold text-gray-700">Celebration</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 mb-3 hover:scale-110 transition-transform">
                <SuccessLottie className="w-16 h-16 mx-auto" />
              </div>
              <p className="font-semibold text-gray-700">Success</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-6 mb-3 hover:scale-110 transition-transform">
                <ErrorLottie className="w-16 h-16 mx-auto" />
              </div>
              <p className="font-semibold text-gray-700">Error</p>
            </div>
          </div>
        </div>

        {/* Dashboard Animations */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl p-8 border border-white/20">
          <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <span className="w-8 h-8 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full"></span>
            Dashboard & Data Animations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="text-center">
              <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-6 mb-3 hover:scale-105 transition-transform">
                <DashboardHeroLottie className="w-32 h-32 mx-auto" />
              </div>
              <p className="font-semibold text-gray-700 text-lg">Dashboard Hero</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-6 mb-3 hover:scale-105 transition-transform">
                <DataVisualizationLottie className="w-32 h-32 mx-auto" />
              </div>
              <p className="font-semibold text-gray-700 text-lg">Data Visualization</p>
            </div>
          </div>
        </div>

        {/* Animation Usage Guide */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl shadow-xl p-8 text-white mt-8">
          <h2 className="text-3xl font-bold mb-4">How to Use These Animations</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
              <h3 className="font-bold mb-2">Import Components</h3>
              <code className="text-xs bg-black/30 p-2 rounded block">
                import {`{LoginLottie}`} from '../components/LottieAnimations'
              </code>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
              <h3 className="font-bold mb-2">Use in JSX</h3>
              <code className="text-xs bg-black/30 p-2 rounded block">
                &lt;LoginLottie className="w-16 h-16" /&gt;
              </code>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
              <h3 className="font-bold mb-2">Customize Size</h3>
              <code className="text-xs bg-black/30 p-2 rounded block">
                className="w-8 h-8" | "w-16 h-16" | "w-32 h-32"
              </code>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}