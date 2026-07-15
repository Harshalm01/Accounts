import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useLocation } from 'react-router-dom';
import { API_URL } from '../config';

export interface PresenceEntry {
  userId: string;
  userName: string;
  page: string;
  action: string;
  lastSeen: number;
}

const PAGE_NAMES: Record<string, string> = {
  '/influencers': 'Influencers',
  '/campaign': 'Campaigns',
  '/brands': 'Brands',
  '/roaster': 'Roaster',
  '/invoice': 'Invoices',
  '/analytics': 'Analytics',
  '/calendar': 'Calendar',
  '/settings': 'Settings',
  '/all-hands': 'All Hands',
  '/accounts': 'Accounts',
  '/users': 'Users',
  '/activity': 'Activity',
};

export function usePresence() {
  const location = useLocation();
  const [onlineUsers, setOnlineUsers] = useState<PresenceEntry[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const pathnameRef = useRef(location.pathname);

  // Keep pathname ref up to date
  pathnameRef.current = location.pathname;

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    if (!user) return;

    // forceNew ensures this socket is independent from Layout/other hooks
    const socket = io(API_URL, {
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('presence:changed', (entries: PresenceEntry[]) => {
      setOnlineUsers(entries);
    });

    // On every connect (initial + reconnects), announce presence and fetch list
    socket.on('connect', () => {
      const page = PAGE_NAMES[pathnameRef.current] || pathnameRef.current;
      socket.emit('presence:update', {
        userId: user.id,
        userName: user.name || user.email,
        page,
        action: `Viewing ${page}`,
      });
      socket.emit('presence:request');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Emit presence update on route change
  useEffect(() => {
    const socket = socketRef.current;
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    if (!socket || !user) return;

    const page = PAGE_NAMES[location.pathname] || location.pathname;

    socket.emit('presence:update', {
      userId: user.id,
      userName: user.name || user.email,
      page,
      action: `Viewing ${page}`,
    });
  }, [location.pathname]);

  return { onlineUsers };
}
