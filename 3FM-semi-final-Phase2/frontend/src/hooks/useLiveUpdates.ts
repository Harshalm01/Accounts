import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';

export interface LiveToast {
  id: number;
  message: string;
}

export function useLiveUpdates() {
  const [liveToasts, setLiveToasts] = useState<LiveToast[]>([]);

  const addToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setLiveToasts((prev) => [...prev.slice(-4), { id, message }]);
    setTimeout(() => setLiveToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setLiveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const socket = io(API_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    if (!user) return;

    const myName = user.name || user.email;

    // Campaign events
    socket.on('campaign:updated', (data: any) => {
      if (data._updatedBy && data._updatedBy !== myName) {
        addToast(`${data._updatedBy} updated campaign "${data.name}"`);
      }
    });
    socket.on('campaign:created', (data: any) => {
      if (data._updatedBy && data._updatedBy !== myName) {
        addToast(`${data._updatedBy} created campaign "${data.name}"`);
      }
    });
    socket.on('campaign:deleted', () => {
      // No user info in delete, skip
    });

    // Influencer events
    socket.on('influencer:created', (data: any) => {
      if (data._updatedBy && data._updatedBy !== myName) {
        addToast(`${data._updatedBy} added influencer "${data.firstName} ${data.lastName}"`);
      }
    });
    socket.on('influencer:updated', (data: any) => {
      if (data._updatedBy && data._updatedBy !== myName) {
        addToast(`${data._updatedBy} updated influencer "${data.firstName} ${data.lastName}"`);
      }
    });

    // Brand events
    socket.on('brand:created', (data: any) => {
      if (data._updatedBy && data._updatedBy !== myName) {
        addToast(`${data._updatedBy} added brand "${data.name}"`);
      }
    });
    socket.on('brand:updated', (data: any) => {
      if (data._updatedBy && data._updatedBy !== myName) {
        addToast(`${data._updatedBy} updated brand "${data.name}"`);
      }
    });

    return () => { socket.disconnect(); };
  }, [addToast]);

  return { liveToasts, dismissToast };
}
