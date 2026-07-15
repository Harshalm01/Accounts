import { useState, useEffect } from 'react';
import { API_URL } from '../config';

interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: 'ADMIN' | 'AGENCY' | 'BRAND' | 'EMPLOYEE';
  designation: string | null;
  createdAt: string;
}

interface CampaignSummary {
  id: string;
  name: string;
  brandName: string;
  status: string;
  startDate: string;
  endDate: string | null;
}

interface AssignmentSummary {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
  campaign: CampaignSummary;
  assignedBy: {
    id: string;
    name: string | null;
    designation: string | null;
  };
}

interface UserDetail extends User {
  campaigns: CampaignSummary[];
  assignmentsAsHead: AssignmentSummary[];
}

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'bg-purple-900 text-purple-200',
  AGENCY: 'bg-blue-900 text-blue-200',
  BRAND: 'bg-orange-900 text-orange-200',
  EMPLOYEE: 'bg-teal-900 text-teal-200',
};

const STATUS_BADGE: Record<string, string> = {
  Upcoming: 'bg-yellow-900/50 text-yellow-300',
  Active: 'bg-green-900/50 text-green-300',
  Completed: 'bg-zinc-700 text-zinc-300',
};

const ASSIGNMENT_BADGE: Record<string, string> = {
  PENDING: 'bg-yellow-900/50 text-yellow-300',
  ACCEPTED: 'bg-green-900/50 text-green-300',
  REJECTED: 'bg-red-900/50 text-red-300',
};

const emptyForm = { name: '', email: '', phone: '', password: '', role: 'AGENCY', designation: '' };

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const currentUserId = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null')?.id; } catch { return null; }
  })();

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load users'); return; }
      setUsers(data);
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }

  async function openUserDetail(user: User) {
    setSelectedUser(null);
    setDetailError('');
    setDetailLoading(true);
    // Open modal with basic data immediately, load full details
    setSelectedUser({ ...user, campaigns: [], assignmentsAsHead: [] });
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setDetailError(data.error || 'Failed to load user details'); return; }
      setSelectedUser(data);
    } catch {
      setDetailError('Failed to connect to server');
    } finally {
      setDetailLoading(false);
    }
  }

  function openAddModal() {
    setFormData({ ...emptyForm });
    setFormError('');
    setShowModal(true);
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!formData.email || !formData.password) {
      setFormError('Email and password are required');
      return;
    }
    if (formData.phone && !/^[6-9]\d{9}$/.test(formData.phone)) {
      setFormError('Enter a valid 10-digit Indian mobile number (starting with 6–9)');
      return;
    }

    setFormLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Failed to create user'); return; }
      setUsers(prev => [data, ...prev]);
      setShowModal(false);
    } catch {
      setFormError('Failed to connect to server');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to delete user'); return; }
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      alert('Failed to connect to server');
    } finally {
      setDeleteLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-400 mt-1">Manage all platform users</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-400">{error}</div>
        ) : users.length === 0 ? (
          <div className="text-center py-20 text-gray-500">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-4">Name</th>
                  <th className="text-left px-6 py-4">Email</th>
                  <th className="text-left px-6 py-4">Phone</th>
                  <th className="text-left px-6 py-4">Designation</th>
                  <th className="text-left px-6 py-4">Role</th>
                  <th className="text-left px-6 py-4">Joined</th>
                  <th className="text-right px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr
                    key={u.id}
                    onClick={() => openUserDetail(u)}
                    className={`border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors cursor-pointer ${i === users.length - 1 ? 'border-b-0' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                          {(u.name || u.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-100">{u.name || <span className="text-gray-500 italic">No name</span>}</span>
                        {u.id === currentUserId && (
                          <span className="text-xs bg-zinc-700 text-gray-300 px-2 py-0.5 rounded-full">You</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-300">{u.email || <span className="text-gray-600">—</span>}</td>
                    <td className="px-6 py-4 text-gray-300">{u.phone || <span className="text-gray-600">—</span>}</td>
                    <td className="px-6 py-4 text-gray-300">{u.designation || <span className="text-gray-600">—</span>}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${ROLE_BADGE[u.role]}`}>
                        {u.role === 'AGENCY' ? 'Head' : u.role === 'ADMIN' ? 'Admin' : u.role === 'EMPLOYEE' ? 'Employee' : 'Brand'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400">
                      {new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {u.id !== currentUserId && (
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteTarget(u); }}
                          className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded"
                          title="Delete user"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {!loading && !error && users.length > 0 && (
        <p className="text-xs text-gray-600 mt-3 text-right">{users.length} user{users.length !== 1 ? 's' : ''} total</p>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {(selectedUser.name || selectedUser.email || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">{selectedUser.name || <span className="text-gray-500 italic">No name</span>}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[selectedUser.role]}`}>
                      {selectedUser.role === 'AGENCY' ? 'Head' : selectedUser.role === 'ADMIN' ? 'Admin' : selectedUser.role === 'EMPLOYEE' ? 'Employee' : 'Brand'}
                    </span>
                    {selectedUser.designation && (
                      <span className="text-xs text-gray-400">{selectedUser.designation}</span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-gray-500 hover:text-gray-300 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Email</p>
                  <p className="text-sm text-gray-200">{selectedUser.email || <span className="text-gray-600">—</span>}</p>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Phone</p>
                  <p className="text-sm text-gray-200">{selectedUser.phone || <span className="text-gray-600">—</span>}</p>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Designation</p>
                  <p className="text-sm text-gray-200">{selectedUser.designation || <span className="text-gray-600">—</span>}</p>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Member Since</p>
                  <p className="text-sm text-gray-200">{formatDate(selectedUser.createdAt)}</p>
                </div>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : detailError ? (
                <div className="text-center text-red-400 text-sm py-4">{detailError}</div>
              ) : (
                <>
                  {/* Campaigns Created */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <h3 className="text-sm font-semibold text-gray-200">Campaigns Created</h3>
                      <span className="text-xs bg-zinc-700 text-gray-400 px-2 py-0.5 rounded-full">{selectedUser.campaigns.length}</span>
                    </div>
                    {selectedUser.campaigns.length === 0 ? (
                      <p className="text-xs text-gray-600 pl-6">No campaigns created</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedUser.campaigns.map(c => (
                          <div key={c.id} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-100 truncate">{c.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{c.brandName}</p>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[c.status] || 'bg-zinc-700 text-zinc-300'}`}>
                                {c.status}
                              </span>
                              <span className="text-xs text-gray-500">{formatDate(c.startDate)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Campaigns Assigned */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-sm font-semibold text-gray-200">Campaigns Assigned</h3>
                      <span className="text-xs bg-zinc-700 text-gray-400 px-2 py-0.5 rounded-full">{selectedUser.assignmentsAsHead.length}</span>
                    </div>
                    {selectedUser.assignmentsAsHead.length === 0 ? (
                      <p className="text-xs text-gray-600 pl-6">No campaigns assigned</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedUser.assignmentsAsHead.map(a => (
                          <div key={a.id} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-100 truncate">{a.campaign.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{a.campaign.brandName}</p>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[a.campaign.status] || 'bg-zinc-700 text-zinc-300'}`}>
                                  {a.campaign.status}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${ASSIGNMENT_BADGE[a.status]}`}>
                                  {a.status}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-2">
                              <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <p className="text-xs text-gray-500">
                                Assigned by{' '}
                                <span className="text-gray-300 font-medium">{a.assignedBy.name || 'Admin'}</span>
                                {a.assignedBy.designation && (
                                  <span className="text-gray-600"> · {a.assignedBy.designation}</span>
                                )}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">Add New User</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-3 rounded-lg">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder="John Doe"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                  placeholder="user@example.com"
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={e => setFormData(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder="10-digit mobile number"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Password <span className="text-red-400">*</span></label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  placeholder="Min. 6 characters"
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Designation</label>
                <input
                  type="text"
                  value={formData.designation}
                  onChange={e => setFormData(p => ({ ...p, designation: e.target.value }))}
                  placeholder="e.g. Account Director, Visual Head"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData(p => ({ ...p, role: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="AGENCY">Head</option>
                  <option value="ADMIN">Admin</option>
                  <option value="BRAND">Brand</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-zinc-700 text-gray-300 rounded-lg text-sm hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {formLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Delete User</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Are you sure you want to delete <span className="text-white font-medium">{deleteTarget.name || deleteTarget.email}</span>? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 border border-zinc-700 text-gray-300 rounded-lg text-sm hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
