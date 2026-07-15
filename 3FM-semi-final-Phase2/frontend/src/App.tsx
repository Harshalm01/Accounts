import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import SimpleLogin from './pages/SimpleLogin';
import SignUp from './pages/SignUp';

const Influencers = lazy(() => import('./pages/Influencers'));
const Brands = lazy(() => import('./pages/Brands'));
const Campaign = lazy(() => import('./pages/Campaign'));
const Invoice = lazy(() => import('./pages/Invoice'));
const Roaster = lazy(() => import('./pages/Roaster'));
const Settings = lazy(() => import('./pages/Settings'));
const Users = lazy(() => import('./pages/Users'));
const Announcements = lazy(() => import('./pages/Announcements'));
const AnnouncementsFeed = lazy(() => import('./pages/AnnouncementsFeed'));
const AllHands = lazy(() => import('./pages/AllHands'));
const BrandProfileSetup = lazy(() => import('./pages/BrandProfileSetup'));
const LottieShowcase = lazy(() => import('./components/LottieShowcase'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const Analytics = lazy(() => import('./pages/Analytics'));
const ContentCalendar = lazy(() => import('./pages/ContentCalendar'));
const Accounts = lazy(() => import('./pages/Accounts'));
const CreatorInvoiceSubmit = lazy(() => import('./pages/CreatorInvoiceSubmit'));

// Role-based default redirect component
function DefaultRedirect() {
  const userStr = localStorage.getItem('user');
  let defaultPath = '/influencers'; // Default for ADMIN and AGENCY

  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.role === 'BRAND') {
        defaultPath = '/brands';
      }
    } catch (e) {
      console.error('Failed to parse user data');
    }
  }

  return <Navigate to={defaultPath} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-black" />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<SimpleLogin />} />
          <Route path="/login-animated" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/showcase" element={<LottieShowcase />} />
          <Route path="/invoice/submit" element={<CreatorInvoiceSubmit />} />

          {/* Brand profile setup (protected but outside main layout) */}
          <Route
            path="/brand-setup"
            element={
              <ProtectedRoute>
                <BrandProfileSetup />
              </ProtectedRoute>
            }
          />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DefaultRedirect />} />
            <Route
              path="influencers"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'AGENCY', 'EMPLOYEE']}>
                  <Influencers />
                </ProtectedRoute>
              }
            />
            <Route
              path="brands"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'AGENCY', 'BRAND', 'EMPLOYEE']}>
                  <Brands />
                </ProtectedRoute>
              }
            />
            <Route
              path="campaign"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'AGENCY', 'EMPLOYEE']}>
                  <Campaign />
                </ProtectedRoute>
              }
            />
            <Route
              path="invoice"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'AGENCY', 'EMPLOYEE']}>
                  <Invoice />
                </ProtectedRoute>
              }
            />
            <Route
              path="roaster"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'AGENCY', 'BRAND', 'EMPLOYEE']}>
                  <Roaster />
                </ProtectedRoute>
              }
            />
            <Route
              path="settings"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'AGENCY', 'EMPLOYEE']}>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="users"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="announcements"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <Announcements />
                </ProtectedRoute>
              }
            />
            <Route
              path="announcements-feed"
              element={
                <ProtectedRoute>
                  <AnnouncementsFeed />
                </ProtectedRoute>
              }
            />
            <Route
              path="activity"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <ActivityLog />
                </ProtectedRoute>
              }
            />
            <Route
              path="analytics"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'AGENCY', 'EMPLOYEE']}>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="calendar"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'AGENCY', 'EMPLOYEE']}>
                  <ContentCalendar />
                </ProtectedRoute>
              }
            />
            <Route
              path="accounts"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'AGENCY', 'EMPLOYEE']}>
                  <Accounts />
                </ProtectedRoute>
              }
            />
            <Route
              path="all-hands"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'AGENCY', 'EMPLOYEE']}>
                  <AllHands />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
// Latest build
