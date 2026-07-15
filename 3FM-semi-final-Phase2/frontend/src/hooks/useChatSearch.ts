import { useState, useCallback, useRef, useEffect } from 'react';

export interface SearchResult {
  id: string;
  content: string;
  senderId: string;
  sender: { id: string; name: string; designation?: string };
  createdAt: string;
}

interface SearchResponse {
  messages: SearchResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface UseChatSearchProps {
  conversationId: string;
  isGroup: boolean;
  apiBaseUrl?: string;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Hook for searching messages in conversations
 * Supports pagination and debounced queries
 */
export function useChatSearch({ conversationId, isGroup, apiBaseUrl = '/api' }: UseChatSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(
    async (searchQuery: string, page: number = 1) => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setResults([]);
        setTotalResults(0);
        setTotalPages(0);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const endpoint = isGroup
          ? `${apiBaseUrl}/groups/${conversationId}/search`
          : `${apiBaseUrl}/dm/conversations/${conversationId}/search`;

        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set('q', searchQuery);
        url.searchParams.set('page', page.toString());
        url.searchParams.set('limit', '20');

        const response = await fetch(url.toString(), {
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error('Search failed');
        }

        const data: SearchResponse = await response.json();
        setResults(data.messages);
        setCurrentPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setTotalResults(data.pagination.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [conversationId, isGroup, apiBaseUrl]
  );

  const handleSearch = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);
      setCurrentPage(1);

      // Clear existing debounce timer
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // Debounce search by 300ms
      debounceTimer.current = setTimeout(() => {
        search(searchQuery, 1);
      }, 300);
    },
    [search]
  );

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) {
        search(query, page);
      }
    },
    [query, totalPages, search]
  );

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setCurrentPage(1);
    setTotalPages(0);
    setTotalResults(0);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    query,
    results,
    loading,
    error,
    currentPage,
    totalPages,
    totalResults,
    handleSearch,
    goToPage,
    clear,
  };
}
