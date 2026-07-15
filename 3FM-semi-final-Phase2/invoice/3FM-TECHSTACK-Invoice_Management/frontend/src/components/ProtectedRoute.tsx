import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  // Check if user is logged in
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // If no role restrictions specified, allow access
  if (!allowedRoles) {
    return <>{children}</>;
  }

  // Check user role
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      
      // If user has an allowed role, grant access
      if (allowedRoles.includes(user.role)) {
        return <>{children}</>;
      }
    } catch (e) {
      console.error('Failed to parse user data');
    }
  }

  // If no valid role or not allowed, redirect to appropriate default page
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.role === 'BRAND') {
        return <Navigate to="/brands" replace />;
      }
      if (user.role === 'AGENCY') {
        return <Navigate to="/influencers" replace />;
      }
    } catch (e) {
      console.error('Failed to parse user data');
    }
  }

  // Default redirect to influencers
  return <Navigate to="/influencers" replace />;
}
