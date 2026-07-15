import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  // Check if user is logged in and token is still valid
  if (!token || isTokenExpired(token)) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
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
