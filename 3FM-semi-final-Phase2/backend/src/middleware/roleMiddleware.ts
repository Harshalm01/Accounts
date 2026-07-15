import { Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { AuthRequest } from './auth';

const prisma = new PrismaClient();

export interface RoleAuthRequest extends AuthRequest {
  userRole?: UserRole;
  userDetails?: {
    id: string;
    email: string;
    role: UserRole;
    name: string | null;
  };
}

// Middleware to check if user has required role
export const requireRole = (...allowedRoles: UserRole[]) => {
  return async (req: RoleAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get user with role from database
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true, role: true, name: true }
      });

      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // Check if user's role is in the allowed roles
      if (!allowedRoles.includes(user.role)) {
        res.status(403).json({ 
          error: 'Access denied',
          message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
        });
        return;
      }

      // Attach user role to request for use in route handlers
      req.userRole = user.role;
      req.userDetails = user;

      next();
    } catch (error) {
      console.error('Role middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Middleware to attach user role to request (doesn't block access)
export const attachUserRole = async (req: RoleAuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true, role: true, name: true }
      });

      if (user) {
        console.log(`🔐 User found - ID: ${user.id}, Role: ${user.role}`);
        req.userRole = user.role;
        req.userDetails = user;
      } else {
        console.log(`⚠️  User not found - ID: ${req.userId}`);
      }
    } else {
      console.log(`⚠️  No userId in request`);
    }
    next();
  } catch (error) {
    console.error('Attach role middleware error:', error);
    next(); // Continue even if there's an error
  }
};

// Helper function to check if user can access a campaign
export const canAccessCampaign = async (userId: string, campaignId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (!user) return false;

  // Admins can access everything
  if (user.role === 'ADMIN') return true;

  // Agencies can access their own campaigns
  if (user.role === 'AGENCY') {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true }
    });
    return campaign !== null && campaign.userId === userId;
  }

  // Brands can only access campaigns pitched to them
  if (user.role === 'BRAND') {
    const pitch = await prisma.pitch.findFirst({
      where: {
        campaignId: campaignId,
        brandUserId: userId,
        status: { in: ['SENT', 'UNDER_REVIEW', 'ACCEPTED'] }
      }
    });
    return !!pitch;
  }

  return false;
};

// Helper function to check if user can access a brand
export const canAccessBrand = async (userId: string, brandId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (!user) return false;

  // Admins can access everything
  if (user.role === 'ADMIN') return true;

  // Brands can only access their own brand profile
  if (user.role === 'BRAND') {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { userId: true }
    });
    return brand !== null && brand.userId === userId;
  }

  // Agencies can access brands they've pitched to
  if (user.role === 'AGENCY') {
    return true; // Agencies need to see brands to pitch to them
  }

  return false;
};
