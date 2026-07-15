import { FC, useEffect, useRef, useState } from 'react';
import type { VideoCallData } from '../hooks/useVideoCall.ts';

interface VideoCallModalProps {
  callData: VideoCallData | null;
  isActive: boolean;
  onEnd: () => void;
  participantName: string;
  remoteName?: string;
}

/**
 * VideoCallModal Component
 * Provides UI for video/audio calls using Daily.co
 * Requires Daily.co iframe to be embedded in a real implementation
 */
const VideoCallModal: FC<VideoCallModalProps> = ({
  callData,
  isActive,
  onEnd,
  participantName,
  remoteName = 'Participant',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      // Update duration every second
      durationInterval.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    }

    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, [isActive]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isActive || !callData) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      {/* Call Container */}
      <div className="relative w-full max-w-4xl h-full max-h-screen md:max-h-96 bg-black rounded-lg overflow-hidden shadow-2xl">
        {/* Video Area */}
        <div
          ref={containerRef}
          className="w-full h-full bg-gradient-to-br from-gray-900 to-black flex flex-col items-center justify-center"
        >
          {/* Placeholder - Daily.co iframe would go here */}
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">📞</div>
              <h3 className="text-white text-xl font-semibold mb-2">
                Call with {remoteName}
              </h3>
              <p className="text-gray-400 text-sm mb-2">
                In production, Daily.co iframe will embed here
              </p>
              <p className="text-gray-500 text-sm">
                Room: {callData.roomName}
              </p>
            </div>
          </div>
        </div>

        {/* Call Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4">
          <div className="flex items-center justify-between">
            {/* Duration */}
            <div className="text-white font-mono text-lg">
              {formatDuration(duration)}
            </div>

            {/* Control Buttons */}
            <div className="flex items-center gap-3">
              {/* Mute Audio */}
              <button
                className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                title="Mute audio"
              >
                🎤
              </button>

              {/* Mute Video */}
              <button
                className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                title="Mute video"
              >
                📹
              </button>

              {/* Screen Share */}
              <button
                className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                title="Share screen"
              >
                🖥️
              </button>

              {/* Record */}
              <button
                className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                title="Record call"
              >
                ⏺️
              </button>

              {/* End Call */}
              <button
                onClick={onEnd}
                className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors ml-2"
                title="End call"
              >
                ☎️
              </button>
            </div>

            {/* Participant Name */}
            <div className="text-gray-300 text-sm font-medium">
              {participantName}
            </div>
          </div>
        </div>

        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black via-black/50 to-transparent p-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">{remoteName}</h2>
            <p className="text-gray-400 text-xs">
              Connected via Daily.co
            </p>
          </div>
          <button
            onClick={onEnd}
            className="text-gray-400 hover:text-white transition-colors"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Status Indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-green-400 text-xs font-semibold">LIVE</span>
        </div>
      </div>

      {/* Note for integration */}
      <div className="absolute bottom-4 right-4 bg-yellow-900/50 text-yellow-200 text-xs p-2 rounded max-w-xs">
        💡 Integrate Daily.co SDK to embed live video
      </div>
    </div>
  );
};

export default VideoCallModal;
