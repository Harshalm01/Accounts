import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';

interface CampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (campaign: any) => void;
  editingCampaign?: any;
}

interface Head {
  id: string;
  name: string;
  designation: string;
}

export default function CampaignModal({ isOpen, onClose, onSave, editingCampaign }: CampaignModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    contactDetails: '',
    brandName: '',
    campaignId: '',
    campaignPassword: '',
    internalCost: '',
    externalCost: '',
    status: 'Upcoming',
    startDate: '',
    endDate: '',
  });

  const [heads, setHeads] = useState<Head[]>([]);
  const [selectedHeadIds, setSelectedHeadIds] = useState<string[]>([]);
  const [showHeadDropdown, setShowHeadDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const userRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return null; } })();

  useEffect(() => {
    if (editingCampaign) {
      setFormData({
        name: editingCampaign.name || '',
        contact: editingCampaign.contact || '',
        contactDetails: editingCampaign.contactDetails || '',
        brandName: editingCampaign.brandName || '',
        campaignId: editingCampaign.campaignId || '',
        campaignPassword: editingCampaign.campaignPassword || '',
        internalCost: editingCampaign.internalCost?.toString() || '',
        externalCost: editingCampaign.externalCost?.toString() || '',
        status: editingCampaign.status || 'Upcoming',
        startDate: editingCampaign.startDate ? new Date(editingCampaign.startDate).toISOString().split('T')[0] : '',
        endDate: editingCampaign.endDate ? new Date(editingCampaign.endDate).toISOString().split('T')[0] : '',
      });
    } else {
      setFormData({
        name: '',
        contact: '',
        contactDetails: '',
        brandName: '',
        campaignId: '',
        campaignPassword: '',
        internalCost: '',
        externalCost: '',
        status: 'Upcoming',
        startDate: '',
        endDate: '',
      });
      setSelectedHeadIds([]);
    }
  }, [editingCampaign, isOpen]);

  // Fetch AGENCY heads when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((users: any[]) => {
        const agencyHeads = users.filter((u) => u.role === 'AGENCY');
        setHeads(agencyHeads);
      })
      .catch(() => {});
  }, [isOpen]);

  // Prefill already-assigned heads when editing
  useEffect(() => {
    if (!isOpen || !editingCampaign?.id) return;
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/api/assignments/campaign/${editingCampaign.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((assignments: any[]) => {
        if (Array.isArray(assignments)) {
          setSelectedHeadIds(assignments.map((a) => a.headId));
        }
      })
      .catch(() => {});
  }, [isOpen, editingCampaign]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowHeadDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    console.log('CampaignModal render - isOpen:', isOpen, 'editingCampaign:', editingCampaign);
  }, [isOpen, editingCampaign]);

  if (!isOpen) return null;

  const toggleHead = (id: string) => {
    setSelectedHeadIds((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Please login first');
        return;
      }

      const url = editingCampaign
        ? `${API_URL}/api/campaigns/${editingCampaign.id}`
        : `${API_URL}/api/campaigns`;
      const method = editingCampaign ? 'PUT' : 'POST';

      console.log('Submitting campaign:', { url, method, formData });

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          internalCost: parseFloat(formData.internalCost),
          externalCost: parseFloat(formData.externalCost),
          campaignId: formData.campaignId || null,
          campaignPassword: formData.campaignPassword || null,
        }),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error:', errorData);
        alert(`Failed to save campaign: ${errorData.error || response.statusText}`);
        return;
      }

      const data = await response.json();
      console.log('Campaign saved successfully:', data);

      // Assign selected heads after saving campaign
      if (selectedHeadIds.length > 0) {
        try {
          await fetch(`${API_URL}/api/assignments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ campaignId: data.id, headIds: selectedHeadIds }),
          });
        } catch (err) {
          console.error('Failed to assign heads:', err);
        }
      }

      onSave(data);
      onClose();
    } catch (error) {
      console.error('Failed to save campaign:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div onClick={(e) => e.stopPropagation()} className="bg-black border border-zinc-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="px-4 md:px-8 py-4 md:py-6 border-b border-zinc-800 sticky top-0 bg-black z-10">
          <h2 className="text-xl md:text-2xl font-bold text-white">
            {editingCampaign ? 'Edit Campaign' : 'Add Campaign'}
          </h2>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-5 md:space-y-8">
          {/* Campaign Information Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Campaign Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">Campaign Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter campaign name"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">Brand Name *</label>
                <input
                  type="text"
                  required
                  value={formData.brandName}
                  onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter brand name"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">Contact Person *</label>
                <input
                  type="text"
                  required
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter contact person name"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">Phone Number *</label>
                <input
                  type="tel"
                  required
                  pattern="[0-9]{10}"
                  value={formData.contactDetails}
                  onChange={(e) => setFormData({ ...formData, contactDetails: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter 10-digit phone number"
                  title="Please enter a valid 10-digit phone number"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Upcoming" className="bg-zinc-900 text-white">Upcoming</option>
                  <option value="Active" className="bg-zinc-900 text-white">Active</option>
                  <option value="Completed" className="bg-zinc-900 text-white">Completed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Security</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">Campaign ID *</label>
                <input
                  type="text"
                  required
                  value={formData.campaignId}
                  onChange={(e) => setFormData({ ...formData, campaignId: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter campaign ID for access control"
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">Campaign Password *</label>
                <input
                  type="password"
                  required
                  value={formData.campaignPassword}
                  onChange={(e) => setFormData({ ...formData, campaignPassword: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter campaign password"
                />
              </div>
            </div>
          </div>

          {/* Assign to Heads Section — ADMIN only */}
          {userRole === 'ADMIN' && (
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Assign to Heads</h3>
            <div ref={dropdownRef} className="relative">
              {/* Selected heads chips */}
              {selectedHeadIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedHeadIds.map((id) => {
                    const head = heads.find((h) => h.id === id);
                    if (!head) return null;
                    return (
                      <span
                        key={id}
                        className="flex items-center gap-1 px-3 py-1 bg-indigo-900 border border-indigo-700 rounded-full text-sm text-indigo-200"
                      >
                        {head.name}
                        {head.designation && <span className="text-indigo-400 text-xs">· {head.designation}</span>}
                        <button
                          type="button"
                          onClick={() => toggleHead(id)}
                          className="ml-1 text-indigo-400 hover:text-white leading-none"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Assign button / trigger */}
              <button
                type="button"
                onClick={() => setShowHeadDropdown((v) => !v)}
                className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 border border-zinc-700 hover:border-indigo-500 rounded text-sm text-gray-300 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {selectedHeadIds.length === 0 ? 'Assign to Head(s)' : `${selectedHeadIds.length} head(s) assigned — click to change`}
              </button>

              {/* Dropdown list */}
              {showHeadDropdown && (
                <div className="absolute left-0 mt-1 w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto">
                  {heads.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-400">No heads available</p>
                  ) : (
                    heads.map((head) => {
                      const checked = selectedHeadIds.includes(head.id);
                      return (
                        <button
                          key={head.id}
                          type="button"
                          onClick={() => toggleHead(head.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors ${
                            checked ? 'bg-indigo-900/40' : ''
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                            checked ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-600'
                          }`}>
                            {checked && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{head.name}</p>
                            {head.designation && (
                              <p className="text-xs text-gray-400">{head.designation}</p>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Budget & Costs Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Budget & Costs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">Internal Cost (INR) *</label>
                <input
                  type="number"
                  required
                  value={formData.internalCost}
                  onChange={(e) => setFormData({ ...formData, internalCost: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">External Cost (INR) *</label>
                <input
                  type="number"
                  required
                  value={formData.externalCost}
                  onChange={(e) => setFormData({ ...formData, externalCost: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>
          </div>

          {/* Timeline Section */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 pb-2 md:pb-3 border-b border-zinc-800">Timeline</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">Start Date *</label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="block text-sm md:text-base font-medium text-gray-300 mb-2">End Date</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base bg-zinc-900 border border-zinc-800 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col md:flex-row gap-3 md:gap-4 pt-4">
            <button
              type="submit"
              className="flex-1 px-4 md:px-6 py-2.5 md:py-3 bg-blue-600 text-white text-sm md:text-base font-medium rounded hover:bg-blue-700 transition-colors"
            >
              {editingCampaign ? 'Update Campaign' : 'Create Campaign'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 md:px-6 py-2.5 md:py-3 bg-zinc-900 text-white text-sm md:text-base font-medium rounded hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
