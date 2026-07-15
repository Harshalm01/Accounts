import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import SimpleLogin from './pages/SimpleLogin';
import SignUp from './pages/SignUp';
import Influencers from './pages/Influencers';
import Brands from './pages/Brands';
import Campaign from './pages/Campaign';
import Invoice from './pages/Invoice';
import Roaster from './pages/Roaster';
import Settings from './pages/Settings';
import Users from './pages/Users';
// import Enquiries from './pages/Enquiries';
import BrandProfileSetup from './pages/BrandProfileSetup';
import LottieShowcase from './components/LottieShowcase';

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
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<SimpleLogin />} />
        <Route path="/login-animated" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/showcase" element={<LottieShowcase />} />
        
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
          {/* <Route path="enquiries" element={<Enquiries />} /> */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
