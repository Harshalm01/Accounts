import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';
import AssignmentChat from './AssignmentChat';

interface Assignment {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
  campaign: {
    id: string;
    name: string;
    brandName: string;
    status: string;
    startDate: string;
  };
  assignedBy?: {
    id: string;
    name: string;
    designation: string;
  };
  head?: {
    id: string;
    name: string;
    designation: string;
  };
  unreadCount: number;
}

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatAssignment, setChatAssignment] = useState<Assignment | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        setUserRole(u.role);
        setUserId(u.id);
      } catch {}
    }
  }, []);

  const fetchAssignments = async () => {
    const token = localStorage.getItem('token');
    if (!token || !userRole) return;
    setLoading(true);
    try {
      if (userRole === 'ADMIN') {
        // ADMIN sees assignments they gave
        const res = await fetch(`${API_URL}/api/assignments/given`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setAssignments(Array.isArray(data) ? data : []);
      } else if (userRole === 'AGENCY') {
        // AGENCY sees their own inbox (from admin) + assignments they gave (to employees)
        const [myRes, givenRes] = await Promise.all([
          fetch(`${API_URL}/api/assignments/my`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/assignments/given`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const myData = await myRes.json();
        const givenData = await givenRes.json();
        const merged = [
          ...(Array.isArray(myData) ? myData : []),
          ...(Array.isArray(givenData) ? givenData : []),
        ];
        setAssignments(merged);
      } else {
        // EMPLOYEE sees their own inbox
        const res = await fetch(`${API_URL}/api/assignments/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setAssignments(Array.isArray(data) ? data : []);
      }
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !userRole) return;
    fetchAssignments();
  }, [isOpen, userRole]);

  // Real-time: listen for new assignment + responses
  useEffect(() => {
    if (!userId) return;
    const socket = io(API_URL);

    socket.on(`assignment:new:${userId}`, () => fetchAssignments());
    socket.on(`assignment:responded:${userId}`, () => fetchAssignments());
    socket.on(`chat:unread:${userId}`, () => fetchAssignments());
    socket.on(`assignment:removed:${userId}`, () => fetchAssignments());

    return () => socket.disconnect();
  }, [userId]);

  const handleRespond = async (assignmentId: string, status: 'ACCEPTED' | 'REJECTED') => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/api/assignments/${assignmentId}/respond`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setAssignments((prev) =>
          prev.map((a) => (a.id === assignmentId ? { ...a, status } : a))
        );
      }
    } catch {}
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
    ACCEPTED: 'bg-green-900/40 text-green-300 border border-green-700',
    REJECTED: 'bg-red-900/40 text-red-300 border border-red-700',
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[60]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-zinc-950 border-l border-zinc-800 z-[70] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Notifications</h2>
            <p className="text-xs text-gray-400 mt-0.5">Campaign assignments</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Assignment list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-6">
              <svg className="w-12 h-12 text-zinc-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="text-gray-500 text-sm">No assignments yet</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="p-5 hover:bg-zinc-900/50 transition-colors">
                  {/* Campaign info */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white text-sm truncate">{assignment.campaign.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{assignment.campaign.brandName}</p>
                    </div>
                    <span className={`ml-2 flex-shrink-0 text-xs px-2 py-1 rounded-full font-medium ${statusColors[assignment.status]}`}>
                      {assignment.status}
                    </span>
                  </div>

                  {/* Assigned by / to */}
                  <p className="text-xs text-gray-400 mb-3">
                    {(userRole === 'ADMIN' || (userRole === 'AGENCY' && !assignment.assignedBy)) ? (
                      <>Assigned to <span className="text-gray-300 font-medium">{assignment.head?.name || 'Unknown'}</span>
                      {assignment.head?.designation && <span className="text-gray-500"> · {assignment.head.designation}</span>}</>
                    ) : (
                      <>Assigned by <span className="text-gray-300 font-medium">{assignment.assignedBy?.name || 'Unknown'}</span>
                      {assignment.assignedBy?.designation && <span className="text-gray-500"> · {assignment.assignedBy.designation}</span>}</>
                    )}
                  </p>

                  {/* Start date */}
                  <p className="text-xs text-gray-500 mb-4">
                    Start: {new Date(assignment.campaign.startDate).toLocaleDateString()}
                  </p>

                  {/* Action row */}
                  <div className="flex items-center gap-2">
                    {/* Chat button — always available */}
                    <button
                      onClick={() => setChatAssignment(assignment)}
                      className="relative flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/50 hover:bg-indigo-800 border border-indigo-700 text-indigo-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      Chat
                      {assignment.unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                          {assignment.unreadCount}
                        </span>
                      )}
                    </button>

                    {/* Accept / Reject — for AGENCY or EMPLOYEE with PENDING status */}
                    {(userRole === 'AGENCY' || userRole === 'EMPLOYEE') && assignment.status === 'PENDING' && assignment.assignedBy && (
                      <>
                        <button
                          onClick={() => handleRespond(assignment.id, 'ACCEPTED')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-900/50 hover:bg-green-800 border border-green-700 text-green-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Accept
                        </button>
                        <button
                          onClick={() => handleRespond(assignment.id, 'REJECTED')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat overlay */}
      {chatAssignment && (
        <AssignmentChat
          assignment={chatAssignment}
          onClose={() => {
            setChatAssignment(null);
            fetchAssignments(); // refresh unread counts
          }}
        />
      )}
    </>
  );
}
