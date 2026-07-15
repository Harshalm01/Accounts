import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';

interface Message {
  id: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  sender: {
    id: string;
    name: string;
    designation: string;
    role: string;
  };
}

interface AssignmentChatProps {
  assignment: {
    id: string;
    status: string;
    campaign: {
      name: string;
      brandName: string;
    };
    assignedBy?: {
      name: string;
    };
    head?: {
      name: string;
    };
  };
  onClose: () => void;
}

export default function AssignmentChat({ assignment, onClose }: AssignmentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentUserId = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; }
  })();

  const fetchMessages = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/api/assignments/${assignment.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchMessages();

    const socket = io(API_URL);
    socket.on(`chat:message:${assignment.id}`, (msg: Message) => {
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    return () => socket.disconnect();
  }, [assignment.id]);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/api/assignments/${assignment.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        setInput('');
        const msg = await res.json();
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    } catch {}
    setSending(false);
  };

  const statusColors: Record<string, string> = {
    PENDING: 'text-yellow-400',
    ACCEPTED: 'text-green-400',
    REJECTED: 'text-red-400',
  };

  return (
    <>
      {/* Backdrop — stopPropagation prevents bubbling to any parent modal's onClick */}
      <div
        className="fixed inset-0 bg-black/70 z-[80]"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />

      {/* Chat window — stopPropagation prevents all child clicks from bubbling up */}
      <div
        className="fixed right-0 top-0 h-full w-full max-w-md bg-zinc-950 border-l border-zinc-800 z-[90] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex-shrink-0 bg-zinc-900">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-white text-sm truncate">{assignment.campaign.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{assignment.campaign.brandName}</p>
              <span className={`text-xs font-medium ${statusColors[assignment.status] || 'text-gray-400'}`}>
                {assignment.status}
              </span>
            </div>
            <button
              onClick={onClose}
              className="ml-3 p-1.5 text-gray-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <svg className="w-10 h-10 text-zinc-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-gray-500 text-sm">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.sender.id === currentUserId;
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                    {!isOwn && (
                      <span className="text-xs text-gray-500 mb-1 px-1">
                        {msg.sender.name}
                        {msg.sender.designation && <span className="text-gray-600"> · {msg.sender.designation}</span>}
                      </span>
                    )}
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isOwn
                          ? 'bg-indigo-600 text-white rounded-tr-sm'
                          : 'bg-zinc-800 text-gray-100 rounded-tl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                    <span className="text-xs text-gray-600 mt-1 px-1">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-4 border-t border-zinc-800 flex-shrink-0 bg-zinc-950">
          <form onSubmit={handleSend} className="flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-zinc-900 border border-zinc-700 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
