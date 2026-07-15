import { FC, useState, useEffect } from 'react';
import type { BroadcastMessage } from '../hooks/useBroadcasts.ts';

interface BroadcastNotificationProps {
  broadcast: BroadcastMessage;
  onClose: () => void;
  onMarkAsRead?: (id: string) => void;
  autoClose?: number; // ms, 0 for no auto-close
}

/**
 * BroadcastNotification Component
 * Displays a broadcast message with priority-based styling
 */
const BroadcastNotification: FC<BroadcastNotificationProps> = ({
  broadcast,
  onClose,
  onMarkAsRead,
  autoClose = 0,
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
  };

  const getPriorityStyles = () => {
    switch (broadcast.priority) {
      case 'CRITICAL':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-300 dark:border-red-700',
          title: 'text-red-900 dark:text-red-100',
          header: 'bg-red-100 dark:bg-red-900',
          badge: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50',
          pulse: 'animate-pulse',
        };
      case 'HIGH':
        return {
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-300 dark:border-orange-700',
          title: 'text-orange-900 dark:text-orange-100',
          header: 'bg-orange-100 dark:bg-orange-900',
          badge: 'text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/50',
          pulse: '',
        };
      case 'LOW':
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-300 dark:border-blue-700',
          title: 'text-blue-900 dark:text-blue-100',
          header: 'bg-blue-100 dark:bg-blue-900',
          badge: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50',
          pulse: '',
        };
      default: // NORMAL
        return {
          bg: 'bg-gray-50 dark:bg-gray-800',
          border: 'border-gray-300 dark:border-gray-600',
          title: 'text-gray-900 dark:text-gray-100',
          header: 'bg-gray-100 dark:bg-gray-700',
          badge: 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700',
          pulse: '',
        };
    }
  };

  const styles = getPriorityStyles();

  const getPriorityLabel = () => {
    const labels = {
      CRITICAL: '🚨 CRITICAL',
      HIGH: '⚠️ IMPORTANT',
      NORMAL: '📢 MESSAGE',
      LOW: 'ℹ️ INFO',
    };
    return labels[broadcast.priority];
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
    <div
      className={`${styles.border} border rounded-lg ${styles.bg} overflow-hidden transition-all duration-300 ${
        isExiting ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
      }`}
    >
      {/* Header */}
      <div className={`${styles.header} px-4 py-3 flex items-start justify-between`}>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${styles.badge} px-2 py-1 rounded ${styles.pulse}`}>
              {getPriorityLabel()}
            </span>
          </div>
          <h3 className={`${styles.title} font-semibold text-sm mt-2`}>{broadcast.title}</h3>
        </div>
        <button
          onClick={handleClose}
          className={`p-1 hover:bg-white/20 dark:hover:bg-black/20 rounded transition-colors`}
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{broadcast.content}</p>

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
          <div>
            From {broadcast.createdBy.name} • {formatDate(broadcast.createdAt)}
          </div>
          {!broadcast.read && (
            <span className="text-blue-600 dark:text-blue-400">• New</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!broadcast.read && (
            <button
              onClick={handleMarkAsRead}
              className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
            >
              Mark as read
            </button>
          )}
          <button
            onClick={handleClose}
            className="text-xs px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded transition-colors ml-auto"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Unread indicator */}
      {!broadcast.read && (
        <div className="h-1 bg-gradient-to-r from-indigo-600 to-indigo-400" />
      )}
    </div>
  );
};

export default BroadcastNotification;
