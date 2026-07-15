import { useState, useCallback, useRef } from 'react';

export interface VideoCallData {
  roomName: string;
  participantToken: string;
  roomUrl: string;
}

interface UseVideoCallProps {
  conversationId: string;
  isGroup: boolean;
  apiBaseUrl?: string;
}

/**
 * Hook for managing video/audio calls
 * Handles token generation and call lifecycle
 */
export function useVideoCall({ conversationId, isGroup, apiBaseUrl = '/api' }: UseVideoCallProps) {
  const [callData, setCallData] = useState<VideoCallData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const callStartTimeRef = useRef<number | null>(null);

  const startCall = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const endpoint = isGroup
        ? `${apiBaseUrl}/groups/${conversationId}/video-token`
        : `${apiBaseUrl}/dm/conversations/${conversationId}/video-token`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to generate video call token');
      }

      const data: VideoCallData = await response.json();
      setCallData(data);
      setIsCallActive(true);
      callStartTimeRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start call');
    } finally {
      setLoading(false);
    }
  }, [conversationId, isGroup, apiBaseUrl]);

  const endCall = useCallback(() => {
    setIsCallActive(false);
    setCallData(null);
    callStartTimeRef.current = null;
  }, []);

  const getCallDuration = useCallback(() => {
    if (!callStartTimeRef.current) return 0;
    return Math.floor((Date.now() - callStartTimeRef.current) / 1000);
  }, []);

  return {
    callData,
    loading,
    error,
    isCallActive,
    startCall,
    endCall,
    getCallDuration,
  };
}
