import { FC } from 'react';
import type { SearchResult } from '../hooks/useChatSearch';

interface ChatSearchProps {
  query: string;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  currentPage: number;
  totalPages: number;
  totalResults: number;
  onQueryChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onResultClick: (messageId: string) => void;
  onClose: () => void;
}

/**
 * ChatSearch Component
 * Provides UI for searching messages with pagination
 */
const ChatSearch: FC<ChatSearchProps> = ({
  query,
  results,
  loading,
  error,
  currentPage,
  totalPages,
  totalResults,
  onQueryChange,
  onPageChange,
  onResultClick,
  onClose,
}) => {
  const highlightQuery = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;

    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) => {
      const isMatch = regex.test(part);
      regex.lastIndex = 0;

      if (isMatch) {
        return (
          <span key={i} className="bg-yellow-200 dark:bg-yellow-700 font-semibold">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
      {/* Search Header */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900">
        <input
          type="text"
          placeholder="Search messages... (min 2 chars)"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          autoFocus
        />
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="Close search"
        >
          ✕
        </button>
      </div>

      {/* Results Section */}
      <div className="flex-1 overflow-y-auto">
        {query.length < 2 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-gray-500 dark:text-gray-400">Search messages</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              Type at least 2 characters to search
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400">Searching...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-500 dark:text-red-400">{error}</div>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <div className="text-4xl mb-2">❌</div>
            <p className="text-gray-500 dark:text-gray-400">No messages found</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              Try a different search term
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {results.map((result) => (
              <button
                key={result.id}
                onClick={() => onResultClick(result.id)}
                className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
              >
                {/* Author & Time */}
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-sm text-gray-900 dark:text-white">
                    {result.sender.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(result.createdAt)}
                  </div>
                </div>

                {/* Message Preview */}
                <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 break-words">
                  {highlightQuery(result.content, query)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && results.length > 0 && (
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 sticky bottom-0">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {totalResults} result{totalResults !== 1 ? 's' : ''} found
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400 min-w-fit">
              {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatSearch;
