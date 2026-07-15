import { FC, useState, useEffect } from 'react';
import type { BroadcastMessage } from '../hooks/useBroadcasts.ts';

interface BroadcastPopupModalProps {
  broadcast: BroadcastMessage;
  onClose: () => void;
  onMarkAsRead?: (id: string) => void;
  autoClose?: number; // ms, 0 for no auto-close
}

/**
 * BroadcastPopupModal Component
 * Displays a large popup modal when a broadcast is received
 */
const BroadcastPopupModal: FC<BroadcastPopupModalProps> = ({
  broadcast,
  onClose,
  onMarkAsRead,
  autoClose = 8000,
}) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (autoClose > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, autoClose);
      return () => clearTimeout(timer);
    }
  }, [autoClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleMarkAsRead = () => {
    onMarkAsRead?.(broadcast.id);
    handleClose();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          isExiting ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
          isExiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <div className="w-full max-w-2xl bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-700 to-cyan-600 px-8 py-6 flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl animate-pulse">📢</span>
                <span className="text-sm font-bold text-blue-100 uppercase tracking-wider">New Announcement</span>
              </div>
              <h2 className="text-3xl font-bold text-white">{broadcast.title}</h2>
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-3 hover:bg-white/20 rounded-lg transition-colors ml-4"
              title="Close"
            >
              <span className="text-2xl text-white">✕</span>
            </button>
          </div>

          {/* Body */}
          <div className="px-8 py-8 bg-gradient-to-b from-blue-50 to-white dark:from-zinc-900 dark:to-zinc-800">
            <p className="text-lg text-gray-700 dark:text-gray-200 mb-6 leading-relaxed whitespace-pre-wrap">
              {broadcast.content}
            </p>

            {/* Metadata */}
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-8 pb-6 border-b border-gray-200 dark:border-zinc-700">
              <div className="flex items-center gap-4">
                <div>
                  <span className="font-medium text-gray-800 dark:text-gray-300">
                    From {broadcast.createdBy.name || 'Admin'}
                  </span>
                  <span className="mx-2">•</span>
                  <span>{formatDate(broadcast.createdAt)}</span>
                </div>
              </div>
              {!broadcast.read && (
                <span className="text-blue-600 dark:text-blue-400 font-semibold">• NEW</span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              {!broadcast.read && (
                <button
                  onClick={handleMarkAsRead}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-blue-500/30 text-base"
                >
                  ✓ Mark as Read
                </button>
              )}
              {broadcast.read && (
                <div className="px-8 py-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-semibold rounded-lg text-base">
                  ✓ Already read
                </div>
              )}
              <button
                onClick={handleClose}
                className="px-8 py-3 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg transition-all text-base"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default BroadcastPopupModal;
