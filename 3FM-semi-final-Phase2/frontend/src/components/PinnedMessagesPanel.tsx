import { FC, useState } from 'react';
import type { PinnedMessageData } from '../hooks/usePinnedMessages.ts';
import type { Reaction } from '../hooks/useMessageReactions.ts';
import MessageReactions from './MessageReactions.tsx';

interface PinnedMessagesPanelProps {
  pinnedMessages: PinnedMessageData[];
  isOpen: boolean;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
  onUnpin?: (pinId: string) => void;
  loading?: boolean;
  getReactions?: (messageId: string) => Reaction[];
  onReact?: (messageId: string, emoji: string) => void;
}

/**
 * PinnedMessagesPanel Component
 * Displays all pinned messages in the current conversation
 * Allows jumping to original message and unpinning
 */
const PinnedMessagesPanel: FC<PinnedMessagesPanelProps> = ({
  pinnedMessages,
  isOpen,
  onClose,
  onJumpToMessage,
  onUnpin,
  loading = false,
  getReactions,
  onReact,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md max-h-screen overflow-hidden flex flex-col bg-white dark:bg-gray-900 shadow-lg border-l border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-4 sticky top-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <span className="text-xl">📌</span>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Pinned Messages ({pinnedMessages.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Close"
          >
            <span className="text-xl">✕</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500 dark:text-gray-400">Loading pinned messages...</div>
            </div>
          ) : pinnedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
              <div className="text-4xl mb-2">📌</div>
              <p className="text-gray-500 dark:text-gray-400">No pinned messages yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Pin important messages to find them quickly
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {pinnedMessages.map((msg) => {
                const isExpanded = expandedIds.has(msg.id);
                const isLongMessage = msg.messageText.length > 150;

                return (
                  <div
                    key={msg.id}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    {/* Author & Time */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900 dark:text-white">
                          {msg.messageAuthorName}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(msg.createdAt)}
                        </div>
                      </div>
                      <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        pinned by {msg.pinnedUser.name}
                      </div>
                    </div>

                    {/* Message Text */}
                    <div
                      className={`text-sm text-gray-700 dark:text-gray-300 mb-3 p-2 bg-gray-100 dark:bg-gray-800 rounded break-words ${
                        isLongMessage && !isExpanded ? 'line-clamp-3' : ''
                      }`}
                    >
                      {msg.messageText}
                    </div>

                    {/* Pin Reason */}
                    {msg.pinReason && (
                      <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded mb-3">
                        💡 {msg.pinReason}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      {isLongMessage && (
                        <button
                          onClick={() => toggleExpanded(msg.id)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                      <button
                        onClick={() => onJumpToMessage(msg.originalMessageId)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline ml-auto"
                      >
                        Jump to message →
                      </button>
                      {onUnpin && (
                        <button
                          onClick={() => onUnpin(msg.id)}
                          className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Unpin"
                        >
                          ↺
                        </button>
                      )}
                    </div>

                    {/* Reactions on the pinned message */}
                    {getReactions && onReact && (
                      <div className="mt-2">
                        <MessageReactions
                          messageId={msg.originalMessageId}
                          reactions={getReactions(msg.originalMessageId)}
                          onReact={(emoji) => onReact(msg.originalMessageId, emoji)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PinnedMessagesPanel;
