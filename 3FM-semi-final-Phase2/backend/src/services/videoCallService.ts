/**
 * Video Call Controller
 * Handles video/audio call token generation for Daily.co integration
 *
 * Environment variables required:
 * - DAILY_API_KEY: Daily.co API key for token generation
 */

import axios from 'axios';
import { Request, Response } from 'express';

const DAILY_API_KEY = process.env.DAILY_API_KEY || '';
const DAILY_API_URL = 'https://api.daily.co/v1';

interface VideoTokenResponse {
  roomName: string;
  participantToken: string;
  roomUrl: string;
}

/**
 * Generate a room token for Daily.co video call
 * Each user in a call gets a unique token
 */
export async function generateVideoToken(
  roomId: string,
  participantName: string
): Promise<VideoTokenResponse> {
  if (!DAILY_API_KEY) {
    return {
      roomName: roomId,
      participantToken: `demo-token-${Date.now()}`,
      roomUrl: `https://meet.daily.co/${roomId}`,
    };
  }

  try {
    // Generate a participant token with a 1-hour expiration
    const expiryTime = Math.floor(Date.now() / 1000) + 60 * 60;

    const response = await axios.post(
      `${DAILY_API_URL}/tokens`,
      {
        properties: {
          room_name: roomId,
          is_owner: false,
          user_id: participantName,
          user_name: participantName,
          max_participants: 100,
          max_participant_duration: 3600, // 1 hour
        },
        exp: expiryTime,
      },
      {
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      roomName: roomId,
      participantToken: response.data.token,
      roomUrl: `https://meet.daily.co/${roomId}`,
    };
  } catch (error) {
    console.error('Failed to generate video token:', error);
    throw new Error('Failed to generate video call token');
  }
}

/**
 * Start a video call recording
 * For Daily.co, recordings are managed via the room settings
 */
export async function startRecording(roomId: string): Promise<{ recordingId: string }> {
  if (!DAILY_API_KEY) {
    throw new Error('DAILY_API_KEY environment variable not set');
  }

  try {
    const response = await axios.post(
      `${DAILY_API_URL}/recordings`,
      {
        room_name: roomId,
      },
      {
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      recordingId: response.data.id,
    };
  } catch (error) {
    console.error('Failed to start recording:', error);
    throw new Error('Failed to start recording');
  }
}

/**
 * Stop a video call recording
 */
export async function stopRecording(recordingId: string): Promise<{ status: string; recordingUrl?: string }> {
  if (!DAILY_API_KEY) {
    throw new Error('DAILY_API_KEY environment variable not set');
  }

  try {
    const response = await axios.post(
      `${DAILY_API_URL}/recordings/${recordingId}/stop`,
      {},
      {
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      status: response.data.status,
      recordingUrl: response.data.download_link,
    };
  } catch (error) {
    console.error('Failed to stop recording:', error);
    throw new Error('Failed to stop recording');
  }
}
