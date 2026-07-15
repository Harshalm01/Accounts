import { useEffect, useState } from 'react';
import { API_URL } from '../config';

interface User {
  id: string;
  name: string;
  designation?: string;
}

interface MentionDropdownProps {
  isOpen: boolean;
  searchText: string;
  position: { x: number; y: number };
  onSelect: (user: User) => void;
}

export default function MentionDropdown({
  isOpen,
  searchText,
  position,
  onSelect,
}: MentionDropdownProps) {
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch users based on search text
  useEffect(() => {
    if (!isOpen || !searchText.trim()) {
      setFilteredUsers([]);
      return;
    }

    setLoading(true);
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/dm/users/search?q=${encodeURIComponent(searchText)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setFilteredUsers(data.slice(0, 5)); // Show top 5 results
        }
      })
      .catch(() => setFilteredUsers([]))
      .finally(() => setLoading(false));

    setSelectedIndex(0);
  }, [searchText, isOpen]);

  if (!isOpen || filteredUsers.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed z-50 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-lg py-1 w-48"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {filteredUsers.map((user, index) => (
        <div
          key={user.id}
          onClick={() => onSelect(user)}
          className={`px-3 py-2 cursor-pointer ${
            index === selectedIndex
              ? 'bg-teal-100 dark:bg-teal-900'
              : 'hover:bg-gray-100 dark:hover:bg-zinc-700'
          }`}
        >
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            {user.name}
          </div>
          {user.designation && (
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {user.designation}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
