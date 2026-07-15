import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import CampaignInfluencersModal from './CampaignInfluencersModal';
import AssignmentChat from './AssignmentChat';
import { API_URL } from '../config';

interface Campaign {
  id: string;
  name: string;
  contact?: string;
  brandName: string;
  campaignId?: string;
  budget?: number;
  internalCost: number;
  externalCost: number;
  status: string;
  startDate: string;
  endDate?: string;
  brief?: string;
  influencers: any[];
}

interface CampaignDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  onEdit: () => void;
  onDelete: () => void;
}

export default function CampaignDetailsModal({
  isOpen,
  onClose,
  campaign,
  onEdit,
  onDelete,
}: CampaignDetailsModalProps) {
  const [showInfluencers, setShowInfluencers] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [briefText, setBriefText] = useState(campaign?.brief || '');
  const [isTogglingBrand, setIsTogglingBrand] = useState(false);
  const [currentCampaign, setCurrentCampaign] = useState(campaign);
  const [isSaving, setIsSaving] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [chatAssignment, setChatAssignment] = useState<any | null>(null);
  const userRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return null; } })();
  const currentUserId = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; } })();
  const [employees, setEmployees] = useState<any[]>([]);
  const [showAssignEmployees, setShowAssignEmployees] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [assigningEmployees, setAssigningEmployees] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showStatus, setShowStatus] = useState(false);
  const [statusUpdates, setStatusUpdates] = useState<any[]>([]);
  const [statusText, setStatusText] = useState('');
  const [postingStatus, setPostingStatus] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);

  // Update briefText and currentCampaign when campaign changes
  useEffect(() => {
    if (campaign) {
      setBriefText(campaign.brief || '');
      setCurrentCampaign(campaign);
    }
  }, [campaign]);

  // Fetch assignment statuses when modal opens (admin/agency view)
  useEffect(() => {
    if (!isOpen || !campaign?.id) return;
    if (userRole !== 'ADMIN' && userRole !== 'AGENCY') return;
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/assignments/campaign/${campaign.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setAssignments(data); })
      .catch(() => {});
  }, [isOpen, campaign?.id, userRole]);

  // Fetch all employees for AGENCY assign-employee picker
  useEffect(() => {
    if (!isOpen || userRole !== 'AGENCY') return;
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/assignments/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setEmployees(data); })
      .catch(() => {});
  }, [isOpen, userRole]);

  // Fetch status updates when modal opens (ADMIN / AGENCY / EMPLOYEE)
  useEffect(() => {
    if (!isOpen || !campaign?.id) return;
    if (userRole !== 'ADMIN' && userRole !== 'AGENCY' && userRole !== 'EMPLOYEE') return;
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/campaigns/${campaign.id}/status-updates`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setStatusUpdates(data); })
      .catch(() => {});
  }, [isOpen, campaign?.id, userRole]);

  // Real-time: listen for new status updates and assignment changes
  useEffect(() => {
    if (!isOpen || !campaign?.id) return;
    const socket = io(API_URL);

    // Status updates (for ADMIN / AGENCY / EMPLOYEE)
    if (userRole === 'ADMIN' || userRole === 'AGENCY' || userRole === 'EMPLOYEE') {
      socket.on(`campaign:status:${campaign.id}`, (update: any) => {
        setStatusUpdates((prev) => [update, ...prev]);
      });
    }

    // Assignment list changes (for ADMIN / AGENCY — re-fetch so list stays accurate)
    if (userRole === 'ADMIN' || userRole === 'AGENCY') {
      socket.on(`assignment:updated:${campaign.id}`, () => {
        const token = localStorage.getItem('token');
        fetch(`${API_URL}/api/assignments/campaign/${campaign.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((data) => { if (Array.isArray(data)) setAssignments(data); })
          .catch(() => {});
      });
    }

    // Influencer list changes — update currentCampaign with fresh data
    const handleInfluencerEvent = ({ campaign: updated }: { campaign: any }) => {
      if (updated?.id === campaign.id) {
        setCurrentCampaign(updated);
      }
    };
    socket.on('campaign:influencer:added', handleInfluencerEvent);
    socket.on('campaign:influencers:added', handleInfluencerEvent);
    socket.on('campaign:influencer:removed', handleInfluencerEvent);

    return () => { socket.disconnect(); };
  }, [isOpen, campaign?.id, userRole]);

  if (!isOpen || !campaign) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-900 text-green-200 border border-green-700';
      case 'Completed':
        return 'bg-gray-700 text-gray-300 border border-gray-600';
      case 'Upcoming':
        return 'bg-yellow-900 text-yellow-200 border border-yellow-700';
      default:
        return 'bg-gray-700 text-gray-300 border border-gray-600';
    }
  };

  const handleSaveBrief = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/campaigns/${campaign.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: campaign.name,
          brandName: campaign.brandName,
          contact: campaign.contact,
          internalCost: campaign.internalCost,
          externalCost: campaign.externalCost,
          status: campaign.status,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          brief: briefText
        }),
      });

      if (response.ok) {
        alert('Brief saved successfully!');
        setShowBrief(false);
      }
    } catch (error) {
      console.error('Failed to save brief:', error);
      alert('Failed to save brief');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyBrief = () => {
    navigator.clipboard.writeText(briefText || campaign.brief || '');
    alert('Brief copied to clipboard!');
  };

  const handleToggleBrand = async () => {
    if (isTogglingBrand) {
      console.log('⚠️ Toggle already in progress, ignoring click');
      return;
    }
    
    try {
      setIsTogglingBrand(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        console.error('No token found');
        return;
      }

      console.log(`🔄 Toggling brand status for campaign ${campaign.id}, current status: ${currentCampaign?.addedToBrand}`);
      
      const response = await fetch(`${API_URL}/api/campaigns/${campaign.id}/toggle-brand`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to toggle brand visibility');
      }

      const updatedCampaign = await response.json();
      setCurrentCampaign(updatedCampaign);
      console.log('✅ Brand visibility toggled:', updatedCampaign.addedToBrand);
      alert(`Campaign ${updatedCampaign.addedToBrand ? 'added to' : 'removed from'} brands tab!`);
    } catch (error) {
      console.error('❌ Error toggling brand:', error);
      alert('Failed to update brand visibility');
    } finally {
      setIsTogglingBrand(false);
    }
  };

  const handleInfluencerRemoved = (influencerId: string) => {
    setCurrentCampaign((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        influencers: prev.influencers.filter((ci: any) => ci.influencer?.id !== influencerId),
      };
    });
  };

  const handlePostStatus = async () => {
    if (!statusText.trim() || !campaign?.id) return;
    setPostingStatus(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/campaigns/${campaign.id}/status-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: statusText.trim() }),
      });
      setStatusText('');
    } catch {
      // silent
    } finally {
      setPostingStatus(false);
    }
  };

  const handleAssignEmployees = async () => {
    if (!selectedEmployeeIds.length || !campaign?.id) return;
    setAssigningEmployees(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ campaignId: campaign.id, headIds: selectedEmployeeIds }),
      });
      if (res.ok) {
        setShowAssignEmployees(false);
        setSelectedEmployeeIds([]);
        // Refresh assignments
        fetch(`${API_URL}/api/assignments/campaign/${campaign.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((data) => { if (Array.isArray(data)) setAssignments(data); })
          .catch(() => {});
      }
    } catch {
      // silent
    } finally {
      setAssigningEmployees(false);
    }
  };

  const handleRemoveEmployee = async (assignmentId: string) => {
    if (!confirm('Remove this employee from the campaign?')) return;
    setRemovingAssignmentId(assignmentId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      }
    } catch {
      // silent
    } finally {
      setRemovingAssignmentId(null);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-black border border-zinc-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header - Fixed */}
        <div className="flex justify-between items-start p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-semibold text-white">{campaign.name}</h2>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-2 ${getStatusColor(campaign.status)}`}>
              {campaign.status}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-6">
        <div className="space-y-6">
          {/* Campaign Information Section */}
          <div className="border-b border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-white mb-3">Campaign Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-400">Campaign Name</label>
                <p className="text-base font-medium text-gray-200">{campaign.name}</p>
              </div>
              {campaign.campaignId && (
                <div>
                  <label className="text-sm font-medium text-gray-400">Campaign ID</label>
                  <p className="text-base font-medium text-gray-200">{campaign.campaignId}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-400">Status</label>
                <div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(campaign.status)}`}>
                    {campaign.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Brand & Contact Section */}
          <div className="border-b border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-white mb-3">Brand & Contact</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-400">Brand Name</label>
                <p className="text-base font-medium text-gray-200">{campaign.brandName}</p>
              </div>
              {campaign.contact && (
                <div>
                  <label className="text-sm font-medium text-gray-400">Contact</label>
                  <p className="text-base font-medium text-gray-200">{campaign.contact}</p>
                </div>
              )}
            </div>
          </div>

          {/* Financial Information Section */}
          <div className="border-b border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-white mb-3">Financial Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-400">Internal Cost</label>
                <p className="text-xl font-bold text-green-400">₹{campaign.internalCost.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400">External Cost</label>
                <p className="text-xl font-bold text-orange-400">₹{campaign.externalCost.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Timeline Section */}
          <div className="border-b border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-white mb-3">Timeline</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-400">Start Date</label>
                <p className="text-base font-medium text-gray-200">{new Date(campaign.startDate).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400">End Date</label>
                <p className="text-base font-medium text-gray-200">{campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : '-'}</p>
              </div>
            </div>
          </div>

          {/* Engagement Section */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Engagement</h3>
            <div>
              <label className="text-sm font-medium text-gray-400">Influencers</label>
              <p className="text-lg font-semibold text-purple-400">{currentCampaign?.influencers?.length || 0} influencers assigned</p>
            </div>
          </div>

          {/* Assigned Heads Section — visible to ADMIN */}
          {userRole === 'ADMIN' && assignments.filter(a => a.head?.role === 'AGENCY').length > 0 && (
            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-lg font-semibold text-white mb-3">Assigned Heads</h3>
              <div className="space-y-2">
                {assignments.filter(a => a.head?.role === 'AGENCY').map((a) => {
                  const statusStyle: Record<string, string> = {
                    PENDING: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
                    ACCEPTED: 'bg-green-900/40 text-green-300 border border-green-700',
                    REJECTED: 'bg-red-900/40 text-red-300 border border-red-700',
                  };
                  return (
                    <div key={a.id} className="flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">{a.head?.name || 'Unknown'}</p>
                        {a.head?.designation && (
                          <p className="text-xs text-gray-400">{a.head.designation}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyle[a.status] || 'bg-gray-800 text-gray-300'}`}>
                          {a.status}
                        </span>
                        <button
                          onClick={() => setChatAssignment({ ...a, campaign: { name: campaign.name, brandName: campaign.brandName } })}
                          className="relative flex items-center gap-1 px-2.5 py-1.5 bg-indigo-900/50 hover:bg-indigo-800 border border-indigo-700 text-indigo-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          Chat
                          {a.unreadCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                              {a.unreadCount}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Assigned Employees Section — visible to AGENCY heads */}
          {userRole === 'AGENCY' && (
            <div className="border-t border-gray-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">Assigned Employees</h3>
                <button
                  onClick={() => { setShowAssignEmployees(true); setSelectedEmployeeIds([]); setEmployeeSearch(''); }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  + Assign Employee
                </button>
              </div>
              {assignments.filter(a => a.head?.role === 'EMPLOYEE' && a.assignedBy?.id === currentUserId).length === 0 ? (
                <p className="text-sm text-gray-500 italic">No employees assigned yet.</p>
              ) : (
                <div className="space-y-2">
                  {assignments.filter(a => a.head?.role === 'EMPLOYEE' && a.assignedBy?.id === currentUserId).map((a) => {
                    const statusStyle: Record<string, string> = {
                      PENDING: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
                      ACCEPTED: 'bg-green-900/40 text-green-300 border border-green-700',
                      REJECTED: 'bg-red-900/40 text-red-300 border border-red-700',
                    };
                    return (
                      <div key={a.id} className="flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{a.head?.name || 'Unknown'}</p>
                          {a.head?.designation && (
                            <p className="text-xs text-gray-400">{a.head.designation}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyle[a.status] || 'bg-gray-800 text-gray-300'}`}>
                            {a.status}
                          </span>
                          <button
                            onClick={() => setChatAssignment({ ...a, campaign: { name: campaign.name, brandName: campaign.brandName } })}
                            className="relative flex items-center gap-1 px-2.5 py-1.5 bg-indigo-900/50 hover:bg-indigo-800 border border-indigo-700 text-indigo-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            Chat
                            {a.unreadCount > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                {a.unreadCount}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => handleRemoveEmployee(a.id)}
                            disabled={removingAssignmentId === a.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-300 hover:text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {removingAssignmentId === a.id ? '...' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        </div>

        {/* Footer Buttons - Fixed */}
        <div className="border-t border-zinc-800 p-6 flex gap-3 bg-black">
          {userRole !== 'EMPLOYEE' && (
            <button
              onClick={handleToggleBrand}
              disabled={isTogglingBrand}
              className={`flex-1 px-4 py-2 rounded-md ${
                currentCampaign?.addedToBrand
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              } ${isTogglingBrand ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isTogglingBrand ? 'Updating...' : (currentCampaign?.addedToBrand ? 'Remove from Brand' : 'Add to Brand')}
            </button>
          )}
          <button
            onClick={() => setShowBrief(true)}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Brief
          </button>
          {(userRole === 'AGENCY' || userRole === 'EMPLOYEE' || userRole === 'ADMIN') && (
            <button
              onClick={() => setShowStatus(true)}
              className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700"
            >
              Status
            </button>
          )}
          <button
            onClick={() => setShowInfluencers(true)}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Campaign Influencers
          </button>
          {userRole !== 'EMPLOYEE' && (
            <button
              onClick={onEdit}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Edit
            </button>
          )}
          {userRole !== 'EMPLOYEE' && (
            <button
              onClick={onDelete}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Delete
            </button>
          )}
        </div>

        {/* Status Modal */}
        {showStatus && (
          <div onClick={() => setShowStatus(false)} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div onClick={(e) => e.stopPropagation()} className="bg-black border border-zinc-800 rounded-lg w-full max-w-lg max-h-[85vh] flex flex-col">
              <div className="flex justify-between items-center p-5 border-b border-zinc-800 flex-shrink-0">
                <h3 className="text-xl font-semibold text-white">Campaign Status Updates</h3>
                <button onClick={() => setShowStatus(false)} className="text-gray-400 hover:text-gray-300">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Feed */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {statusUpdates.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-8">No status updates yet.</p>
                ) : (
                  statusUpdates.map((update) => {
                    const isEmployee = update.userRole === 'EMPLOYEE';
                    return (
                      <div key={update.id} className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isEmployee ? 'bg-teal-900 text-teal-200' : 'bg-blue-900 text-blue-200'}`}>
                            {isEmployee ? 'Employee' : 'Head'}
                          </span>
                          <span className="text-sm font-medium text-white">{update.user?.name || 'Unknown'}</span>
                          {update.user?.designation && (
                            <span className="text-xs text-gray-500">· {update.user.designation}</span>
                          )}
                          <span className="text-xs text-gray-600 ml-auto">
                            {new Date(update.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-200 leading-relaxed">{update.content}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Post input — AGENCY and EMPLOYEE only */}
              {(userRole === 'AGENCY' || userRole === 'EMPLOYEE') && (
                <div className="flex-shrink-0 border-t border-zinc-800 p-4">
                  <textarea
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostStatus(); } }}
                    placeholder="Write a status update... (Enter to post)"
                    rows={3}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none mb-3"
                  />
                  <button
                    onClick={handlePostStatus}
                    disabled={postingStatus || !statusText.trim()}
                    className="w-full px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    {postingStatus ? 'Posting...' : 'Post Status'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Brief Modal */}
        {showBrief && (
          <div onClick={() => setShowBrief(false)} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div onClick={(e) => e.stopPropagation()} className="bg-black border border-zinc-800 rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold text-white">Campaign Brief</h3>
                <button
                  onClick={() => setShowBrief(false)}
                  className="text-gray-400 hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Brief Content</label>
                <textarea
                  value={briefText}
                  onChange={(e) => setBriefText(e.target.value)}
                  placeholder="Enter campaign brief here..."
                  rows={15}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSaveBrief}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600"
                >
                  {isSaving ? 'Saving...' : 'Save Brief'}
                </button>
                <button
                  onClick={handleCopyBrief}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Copy Brief
                </button>
                <button
                  onClick={() => setShowBrief(false)}
                  className="flex-1 px-4 py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <CampaignInfluencersModal
          isOpen={showInfluencers}
          onClose={() => setShowInfluencers(false)}
          campaignId={campaign.id}
          campaignName={campaign.name}
          influencers={(currentCampaign?.influencers || []).map((ci: any) => ({
            ...ci.influencer,
            liveLink: ci.liveLink,
            invoices: ci.invoices,
            campaignInfluencerId: ci.id
          }))}
          onRemove={handleInfluencerRemoved}
        />
      </div>

      {/* Chat with a specific head/employee */}
      {chatAssignment && (
        <AssignmentChat
          assignment={chatAssignment}
          onClose={() => {
            setChatAssignment(null);
            // Refresh assignment unread counts
            const token = localStorage.getItem('token');
            fetch(`${API_URL}/api/assignments/campaign/${campaign.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => r.json())
              .then((data) => { if (Array.isArray(data)) setAssignments(data); })
              .catch(() => {});
          }}
        />
      )}

      {/* Assign Employee Picker Modal */}
      {showAssignEmployees && (
        <div onClick={() => setShowAssignEmployees(false)} className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
          <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-4">Select Employees to Assign</h3>
            {/* Search Bar */}
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search employees..."
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            {employees.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">No employees available.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                {employees
                  .filter((emp) => emp.name?.toLowerCase().includes(employeeSearch.toLowerCase()))
                  .map((emp) => {
                  const alreadyAssigned = assignments.some(
                    (a) => a.head?.id === emp.id && a.assignedBy?.id === currentUserId
                  );
                  return (
                    <label
                      key={emp.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        alreadyAssigned ? 'opacity-50 cursor-not-allowed bg-zinc-800' : 'hover:bg-zinc-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={alreadyAssigned}
                        checked={selectedEmployeeIds.includes(emp.id) || alreadyAssigned}
                        onChange={(e) => {
                          if (alreadyAssigned) return;
                          if (e.target.checked) {
                            setSelectedEmployeeIds((prev) => [...prev, emp.id]);
                          } else {
                            setSelectedEmployeeIds((prev) => prev.filter((id) => id !== emp.id));
                          }
                        }}
                        className="rounded border-gray-600 text-indigo-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-white">{emp.name}</p>
                        {emp.designation && <p className="text-xs text-gray-400">{emp.designation}</p>}
                        {alreadyAssigned && <p className="text-xs text-indigo-400">Already assigned</p>}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleAssignEmployees}
                disabled={assigningEmployees || selectedEmployeeIds.length === 0}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {assigningEmployees ? 'Assigning...' : `Assign (${selectedEmployeeIds.length})`}
              </button>
              <button
                onClick={() => setShowAssignEmployees(false)}
                className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
