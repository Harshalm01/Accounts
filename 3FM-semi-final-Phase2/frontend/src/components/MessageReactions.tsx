import { FC } from 'react';
import type { Reaction } from '../hooks/useMessageReactions.ts';

const EMOJI_REACTIONS = ['👍', '❤️', '🔥', '👏'];

interface MessageReactionsProps {
  messageId: string;
  reactions: Reaction[];
  onReact: (emoji: string) => void;
  onViewReactions?: () => void; // Optional: open reactions viewer modal
}

/**
 * MessageReactions Component
 * Displays reaction buttons and emoji counts for a message
 * No database persistence - all state managed locally
 */
const MessageReactions: FC<MessageReactionsProps> = ({
  messageId,
  reactions,
  onReact,
  onViewReactions,
}) => {
  if (!messageId || !reactions) return null;

  return (
    <div className="flex items-center flex-wrap gap-2 mt-2">
      {/* Show existing reactions with counts */}
      {reactions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              onClick={() => onReact(reaction.emoji)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm transition-all duration-200 ${
                reaction.userReacted
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 ring-2 ring-indigo-400 dark:ring-indigo-600'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              title={`${reaction.count} reaction${reaction.count !== 1 ? 's' : ''}`}
            >
              <span className="text-base leading-none">{reaction.emoji}</span>
              <span className="text-xs font-medium">{reaction.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Add reaction button */}
      <div className="relative group">
        <button
          className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 text-sm font-bold"
          title="Add reaction"
        >
          +
        </button>

        {/* Emoji picker dropdown */}
        <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 border border-gray-200 dark:border-gray-700">
          <div className="flex gap-1">
            {EMOJI_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className="text-lg p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 cursor-pointer hover:scale-125 transform transition-transform"
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* View all reactions button (if many reactions) */}
      {reactions.length > 3 && onViewReactions && (
        <button
          onClick={onViewReactions}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          View all
        </button>
      )}
    </div>
  );
};

export default MessageReactions;
