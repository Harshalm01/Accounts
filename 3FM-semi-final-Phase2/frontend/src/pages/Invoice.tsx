import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../config';
import { Loading3DCube, Empty3DState } from '../components/Loading3D';
import { fireCelebration } from '../utils/confetti';
import ConfirmModal from '../components/ConfirmModal';

// ─── Types ─────────────────────────────────────────────────────────────
interface FieldResult {
  value: string;
  detected: boolean;
}

interface InvoiceItem {
  id: string;
  type: 'GST' | 'NON_GST';
  status: 'UPLOADED' | 'SCANNED' | 'APPROVED' | 'REJECTED';
  fileName: string;
  originalName: string;
  fileSize: number | null;
  mimeType: string | null;
  scanResults: Record<string, FieldResult> | null;
  invoiceDate: string | null;
  campaignDetails: string | null;
  campaignAmount: string | null;
  bankName: string | null;
  accountHolderName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  branchName: string | null;
  branchAddress: string | null;
  panCard: string | null;
  upiId: string | null;
  signatureDetected: boolean;
  creatorAddress: string | null;
  creatorGstin: string | null;
  folksAddress: string | null;
  folksGstin: string | null;
  invoiceNumber: string | null;
  folder: string;
  uploadedBy: { id: string; name: string | null; email: string | null };
  campaign: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Field label maps ──────────────────────────────────────────────────
const NON_GST_FIELDS: Record<string, string> = {
  bankName: 'Bank Name',
  accountHolderName: 'Account Holder Name',
  accountNumber: 'Account Number',
  ifscCode: 'IFSC Code',
  branchName: 'Branch Name',
  branchAddress: 'Branch Address',
  panCard: 'PAN Card',
  upiId: 'UPI ID',
  signature: 'Signature',
  invoiceDate: 'Invoice Date',
  campaignDetails: 'Campaign Details',
  campaignAmount: 'Amount',
  tds: 'TDS Deduction',
  netPayable: 'Net Payable',
};

const GST_FIELDS: Record<string, string> = {
  creatorAddress: "Creator's Address",
  creatorGstin: "Creator's GSTIN",
  folksAddress: '3Folks Media Address',
  folksGstin: '3Folks Media GSTIN',
  invoiceNumber: 'Invoice Number',
  invoiceDate: 'Invoice Date',
  placeOfSupply: 'Place of Supply',
  hsnCode: 'HSN / SAC Code',
  campaignDetails: 'Campaign Details',
  taxableAmount: 'Taxable Amount',
  cgst: 'CGST',
  sgst: 'SGST',
  igst: 'IGST',
  campaignAmount: 'Total Amount',
  tds: 'TDS Deduction',
  netPayable: 'Net Payable',
  bankName: 'Bank Name',
  branchName: 'Branch Name',
  branchAddress: 'Branch Address',
  accountHolderName: 'Account Holder Name',
  accountNumber: 'Account Number',
  ifscCode: 'IFSC Code',
  panCard: 'PAN Card',
  upiId: 'UPI ID',
  signature: 'Signature',
};

// ─── Helpers ───────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/** Convert camelCase key to a human-readable title, e.g. "dueDate" → "Due Date" */
function camelToTitle(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

/** Keys in scanResults that are internal metadata and should not be rendered as rows */
const SKIP_DISPLAY_KEYS = new Set([
  'signatureImage', 'datePatternId', 'amountPatternId',
]);

const statusColors: Record<string, string> = {
  UPLOADED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  SCANNED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

// ════════════════════════════════════════════════════════════════════════
//  COMPONENT
// ════════════════════════════════════════════════════════════════════════
export default function Invoice() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [allInvoices, setAllInvoices] = useState<InvoiceItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'upload' | 'history'>('list');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [filterFolder, setFilterFolder] = useState('all');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  // Upload state
  const [uploadType, setUploadType] = useState<'GST' | 'NON_GST'>('NON_GST');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFolder, setUploadFolder] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Approve state
  const [approveFolder, setApproveFolder] = useState('');
  const [approveNewFolder, setApproveNewFolder] = useState('');

  // Post-approval folder state
  const [postApproveMode, setPostApproveMode] = useState<'choice' | 'create' | 'existing' | 'done'>('choice');
  const [newFolderName, setNewFolderName] = useState('');
  const [physicalFolders, setPhysicalFolders] = useState<string[]>([]);
  const [savingToFolder, setSavingToFolder] = useState(false);
  const [showCreateFolderInput, setShowCreateFolderInput] = useState(false);
  const [createFolderName, setCreateFolderName] = useState('');
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  // Move to folder state
  const [moveFolder, setMoveFolder] = useState('');
  const [moveNewFolder, setMoveNewFolder] = useState('');
  const [movingFolder, setMovingFolder] = useState(false);

  // Edit fields state
  const [editingFields, setEditingFields] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);

  // Document preview state
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [showSignaturePreview, setShowSignaturePreview] = useState(false);

  // Campaign details modal
  const [campaignDetailOpen, setCampaignDetailOpen] = useState(false);
  const [campaignDetailText, setCampaignDetailText] = useState('');

  // Duplicate detection warning
  const [duplicateWarning, setDuplicateWarning] = useState<{
    matches: Array<{
      id: string;
      originalName: string;
      invoiceDate: string | null;
      campaignAmount: string | null;
      invoiceNumber: string | null;
      folder: string;
      createdAt: string;
    }>;
  } | null>(null);

  // ─── Fetch data ──────────────────────────────────────────────────────
  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterFolder && filterFolder !== 'all') params.set('folder', filterFolder);
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('type', filterType);
      const res = await fetch(`${API_URL}/api/invoices?${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) setInvoices(data);
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [filterFolder, filterStatus, filterType]);

  const fetchAllInvoices = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/invoices`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) setAllInvoices(data);
    } catch (err) {
      console.error('Error fetching all invoices:', err);
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/invoices/folders`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) setFolders(data);
    } catch (err) {
      console.error('Error fetching folders:', err);
    }
  }, []);

  const fetchPhysicalFolders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/invoices/physical-folders`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) setPhysicalFolders(data);
    } catch (err) {
      console.error('Error fetching physical folders:', err);
    }
  }, []);

  useEffect(() => { fetchInvoices(); fetchFolders(); fetchPhysicalFolders(); fetchAllInvoices(); }, [fetchInvoices, fetchFolders, fetchPhysicalFolders, fetchAllInvoices]);

  // Close folder menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setFolderMenuOpen(null);
    if (folderMenuOpen) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [folderMenuOpen]);

  // ─── Handlers ────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('type', uploadType);
      form.append('folder', newFolder.trim() || uploadFolder || 'Uncategorized');
      const res = await fetch(`${API_URL}/api/invoices/upload`, { method: 'POST', headers: getAuthHeaders(), body: form });
      const data = await res.json();
      if (res.ok) {
        setSelectedInvoice(data.invoice);
        setMoveFolder(data.invoice.folder || 'Uncategorized');
        setMoveNewFolder('');
        setShowDocPreview(false);
        setShowSignaturePreview(false);
        if (data.isDuplicate && data.potentialMatches?.length > 0) {
          setDuplicateWarning({ matches: data.potentialMatches });
        } else {
          setDuplicateWarning(null);
        }
        fetchInvoices();
        fetchAllInvoices();
        fetchFolders();
        setUploadFile(null);
        if (fileRef.current) fileRef.current.value = '';
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async (inv: InvoiceItem) => {
    try {
      const res = await fetch(`${API_URL}/api/invoices/${inv.id}/approve`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: inv.folder }),
      });
      if (res.ok) {
        const d = await res.json();
        setSelectedInvoice(d.invoice);
        setPostApproveMode('choice');
        fireCelebration('invoice-approved');
        fetchInvoices();
        fetchAllInvoices();
        fetchFolders();
        fetchPhysicalFolders();
      }
    } catch (err) { console.error('Approve error:', err); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setSavingToFolder(true);
    try {
      const res = await fetch(`${API_URL}/api/invoices/create-folder`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: newFolderName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        // Move invoice to the new folder
        if (selectedInvoice) {
          const moveRes = await fetch(`${API_URL}/api/invoices/${selectedInvoice.id}/move-to-folder`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: data.folder }),
          });
          if (moveRes.ok) {
            const moveData = await moveRes.json();
            setSelectedInvoice(moveData.invoice);
          }
        }
        setPostApproveMode('done');
        setNewFolderName('');
        fetchFolders();
        fetchPhysicalFolders();
        fetchInvoices();
        fetchAllInvoices();
      } else {
        alert(data.error || 'Failed to create folder');
      }
    } catch (err) { console.error('Create folder error:', err); alert('Failed to create folder'); }
    finally { setSavingToFolder(false); }
  };

  const handleMoveToExistingFolder = async (folderName: string) => {
    if (!selectedInvoice) return;
    setSavingToFolder(true);
    try {
      const res = await fetch(`${API_URL}/api/invoices/${selectedInvoice.id}/move-to-folder`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folderName }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data.invoice);
        setPostApproveMode('done');
        fetchInvoices();
        fetchAllInvoices();
        fetchFolders();
        fetchPhysicalFolders();
      } else {
        alert('Failed to move invoice');
      }
    } catch (err) { console.error('Move to folder error:', err); alert('Failed to move to folder'); }
    finally { setSavingToFolder(false); }
  };

  const handleReject = async (inv: InvoiceItem) => {
    try {
      const res = await fetch(`${API_URL}/api/invoices/${inv.id}/reject`, { method: 'PUT', headers: getAuthHeaders() });
      if (res.ok) { const d = await res.json(); setSelectedInvoice(d.invoice); fetchInvoices(); fetchAllInvoices(); }
    } catch (err) { console.error('Reject error:', err); }
  };

  const handleDelete = (inv: InvoiceItem) => {
    setConfirmState({
      open: true,
      title: 'Delete Invoice',
      message: `Delete invoice "${inv.invoiceNumber || inv.id}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        try {
          const res = await fetch(`${API_URL}/api/invoices/${inv.id}`, { method: 'DELETE', headers: getAuthHeaders() });
          if (res.ok) { setSelectedInvoice(null); fetchInvoices(); fetchAllInvoices(); }
        } catch (err) {
          console.error('Delete invoice error:', err);
        }
      },
    });
  };

  const handleSaveFields = async (inv: InvoiceItem) => {
    try {
      // Build clean payload: send all edited fields except non-editable/internal ones
      const payload: Record<string, string> = {};
      for (const [key, val] of Object.entries(editingFields)) {
        if (key !== 'signature' && !SKIP_DISPLAY_KEYS.has(key)) {
          payload[key] = val;
        }
      }
      console.log('[SaveFields] Sending:', Object.keys(payload));
      const res = await fetch(`${API_URL}/api/invoices/${inv.id}/fields`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const d = await res.json();
        setSelectedInvoice(d.invoice);
        setIsEditing(false);
        setEditingFields({});
        fetchInvoices();
        fetchAllInvoices();
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        console.error('[SaveFields] Server error:', err);
        alert(`Save failed: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Save fields error:', err);
      alert('Save failed: Network error');
    }
  };

  const handleMoveToFolder = async (inv: InvoiceItem) => {
    const targetFolder = moveNewFolder.trim() || moveFolder;
    if (!targetFolder || targetFolder === inv.folder) return;
    setMovingFolder(true);
    try {
      const res = await fetch(`${API_URL}/api/invoices/${inv.id}/fields`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: targetFolder }),
      });
      if (res.ok) {
        const d = await res.json();
        setSelectedInvoice(d.invoice);
        setMoveFolder(targetFolder);
        setMoveNewFolder('');
        fetchInvoices();
        fetchAllInvoices();
        fetchFolders();
      } else {
        alert('Failed to move invoice');
      }
    } catch (err) {
      console.error('Move folder error:', err);
      alert('Failed to move invoice');
    } finally {
      setMovingFolder(false);
    }
  };

  const handleDownload = (inv: InvoiceItem) => {
    const token = localStorage.getItem('token');
    window.open(`${API_URL}/api/invoices/${inv.id}/download?token=${token}`, '_blank');
  };

  // Drag & Drop
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) setUploadFile(e.dataTransfer.files[0]); };

  // ─── Scan Results Panel ──────────────────────────────────────────────
  const renderScanResults = (inv: InvoiceItem) => {
    const predefinedMap = inv.type === 'GST' ? GST_FIELDS : NON_GST_FIELDS;
    const results = inv.scanResults || {};

    // A field is worth showing only if it was actually found in the invoice
    // (detected=true) or has been manually filled in (non-empty value).
    // This filters out legacy scanResults entries that are {detected:false, value:''}.
    const hasContent = (k: string) => {
      const r = results[k] as FieldResult | undefined;
      return r !== undefined && !SKIP_DISPLAY_KEYS.has(k) && (r.detected || (r.value || '').trim() !== '');
    };

    // Predefined keys that actually have content, in their defined order
    const predefinedKeysPresent = Object.keys(predefinedMap).filter(hasContent);
    // Extra dynamic keys (not in predefined map) that have content
    const extraKeys = Object.keys(results).filter(
      k => !predefinedMap[k] && hasContent(k)
    );
    const allKeys = [...predefinedKeysPresent, ...extraKeys];

    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Detected Fields ({inv.type === 'GST' ? 'GST Invoice' : 'Non-GST Invoice'})
        </h4>
        <div className="grid gap-2">
          {allKeys.map((key) => {
            const label = predefinedMap[key] ?? camelToTitle(key);
            const result = results[key] as FieldResult | undefined;
            const detected = result?.detected || false;
            const value = result?.value || '';
            return (
              <div key={key} className={`flex items-start gap-3 p-3 rounded-lg border ${detected ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
                <span className="mt-0.5 text-lg flex-shrink-0">{detected ? '✅' : '❌'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
                  {isEditing && key !== 'signature' ? (
                    key === 'campaignDetails' ? (
                      <textarea
                        className="mt-1 w-full text-sm border border-gray-300 dark:border-zinc-600 rounded px-2 py-1.5 bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 resize-y min-h-[60px]"
                        rows={3}
                        value={editingFields[key] ?? value}
                        onChange={(e) => setEditingFields(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    ) : (
                      <input type="text" className="mt-1 w-full text-sm border border-gray-300 dark:border-zinc-600 rounded px-2 py-1 bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200" value={editingFields[key] ?? value} onChange={(e) => setEditingFields(prev => ({ ...prev, [key]: e.target.value }))} />
                    )
                  ) : (
                    key === 'signature' ? (
                      <div>
                        <div className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">
                          {detected ? 'Signature detected' : <span className="italic text-gray-400">Not detected</span>}
                        </div>
                        {detected && (() => {
                          const sigImage = (inv.scanResults as any)?.signatureImage?.value as string | undefined;
                          if (sigImage) {
                            // Show rendered page image, cropped via CSS to the bottom (signature area)
                            return (
                              <div className="mt-2 space-y-1">
                                <div
                                  className="rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700"
                                  style={{ height: showSignaturePreview ? 'auto' : '260px' }}
                                >
                                  <img
                                    src={`${API_URL}${sigImage}`}
                                    alt="Signature area"
                                    className="w-full"
                                    style={showSignaturePreview ? {} : {
                                      objectFit: 'cover',
                                      objectPosition: 'bottom',
                                      height: '260px',
                                    }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowSignaturePreview(v => !v)}
                                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2 transition-colors"
                                >
                                  {showSignaturePreview ? 'Show signature area only' : 'View full page'}
                                </button>
                              </div>
                            );
                          }
                          // Fallback: no rendered image — embed the original document
                          return (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setShowSignaturePreview(v => !v)}
                                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline underline-offset-2 transition-colors"
                              >
                                {showSignaturePreview ? 'Hide document' : '🔍 View signature in document'}
                              </button>
                              {showSignaturePreview && (() => {
                                const fileUrl = `${API_URL}/uploads/invoice-files/${inv.fileName}`;
                                const isImage = (inv.mimeType || '').startsWith('image/');
                                return (
                                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
                                    {isImage ? (
                                      <img src={fileUrl} alt={inv.originalName} className="w-full object-contain max-h-[500px]" />
                                    ) : (
                                      <iframe src={fileUrl} title={inv.originalName} className="w-full" style={{ height: '500px' }} />
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </div>
                    ) : key === 'campaignDetails' && value ? (
                      <button
                        type="button"
                        onClick={() => { setCampaignDetailText(value); setCampaignDetailOpen(true); }}
                        className="mt-0.5 text-sm text-left text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 underline underline-offset-2 decoration-dotted break-words transition-colors"
                      >
                        {value.length > 60 ? value.substring(0, 60) + '…' : value}
                        <span className="ml-1 no-underline text-xs text-gray-400">(click to view)</span>
                      </button>
                    ) : (
                      <div className={`text-sm text-gray-800 dark:text-gray-200 break-words`}>
                        {value || <span className="italic text-gray-400">Not detected</span>}
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Parse campaign details into structured rows ─────────────────────
  const parseCampaignDetails = (raw: string) => {
    const pairs: { name: string; amount: string }[] = [];

    // Helper: check if ALL words in a name are table-header words (skip these)
    const HDR = /^(quantity|rate|per|amount|s\.?no|sr|sl|no|description|particular|particulars|item|items|total|grand|net|sub|unit|price|gst|tax|cgst|sgst|igst|hsn|sac|date|invoice|number|bank|branch|account|ifsc|pan|upi)$/i;
    const isHeaderOnly = (n: string) => n.trim().split(/\s+/).every(w => HDR.test(w));

    let m;

    // Strategy 0: GST structured format — "LABEL: DESCRIPTION_TEXT ₹AMOUNT"
    // e.g. "CREATOR: AISHWARYA HARISHANKAR ₹35,000 SONG: CHANEL ₹6,300"
    const gstStructuredRegex = /([A-Z][A-Z\s]*?:\s*[A-Za-z][A-Za-z\s.&']*?)\s+(?:Rs\.?\s*|INR\s*|₹\s*)([\d,]+\.?\d*\s*[kKmM]?)\/?-?/g;
    while ((m = gstStructuredRegex.exec(raw)) !== null) {
      const name = m[1].trim();
      // Skip if it's a header-only match or too short
      if (name.length >= 3 && !isHeaderOnly(name.split(':')[0].trim())) {
        pairs.push({ name, amount: m[2].trim() });
      }
    }

    // Strategy 1: "Name :- Amount" or "Name: Amount" or "Name - Amount"
    if (pairs.length === 0) {
      const colonDashRegex = /([A-Za-z][A-Za-z\s.]*?)\s*[:]+\s*-?\s*(?:Rs\.?\s*|INR\s*|₹\s*)?([\d,]+\.?\d*\s*[kKmM]?)\/?-?/g;
      while ((m = colonDashRegex.exec(raw)) !== null) {
        const name = m[1].trim();
        if (isHeaderOnly(name)) continue;
        if (name.length >= 2) pairs.push({ name, amount: m[2].trim() });
      }
    }

    // Strategy 2: Tabular "Name Amount" — handles "14000/-" format
    if (pairs.length === 0) {
      const tabularRegex = /(?:^|\s)(\d+\s+)?([A-Za-z][A-Za-z\s.]{1,30}?)\s+(?:Rs\.?\s*|INR\s*|₹\s*)?([\d,]+\.?\d*\s*[kKmM]?)\/?-?(?=\s|$)/g;
      while ((m = tabularRegex.exec(raw)) !== null) {
        const name = m[2].trim();
        if (isHeaderOnly(name)) continue;
        if (name.length >= 2) pairs.push({ name, amount: m[3].trim() });
      }
    }

    // Strategy 3: Line-by-line parsing
    if (pairs.length === 0 && raw.includes('\n')) {
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const lineMatch = line.match(/^(?:\d+[.\s)]+)?([A-Za-z][A-Za-z\s.]+?)\s+(?:Rs\.?\s*|INR\s*|₹\s*)?([\d,]+\.?\d*\s*[kKmM]?)\/?-?\s*$/);
        if (lineMatch) {
          const name = lineMatch[1].trim();
          if (!isHeaderOnly(name) && name.length >= 2) {
            pairs.push({ name, amount: lineMatch[2].trim() });
          }
        }
      }
    }

    // Strategy 4: If no pairs yet, try ₹-amount extraction with any preceding text
    if (pairs.length === 0) {
      const anyAmountRegex = /([A-Za-z][A-Za-z\s.:&']{2,40}?)\s+(?:Rs\.?\s*|INR\s*|₹)\s*([\d,]+\.?\d*)\/?-?/g;
      while ((m = anyAmountRegex.exec(raw)) !== null) {
        const name = m[1].trim();
        if (!isHeaderOnly(name) && name.length >= 3) {
          pairs.push({ name, amount: m[2].trim() });
        }
      }
    }

    // Extract total — try multiple patterns
    const totalMatch = raw.match(/([\d,]+\.?\d*)\/?-?\s*(?:total|Total|TOTAL)/i)
      || raw.match(/(?:total|Total|TOTAL)\s*[:\-]?\s*(?:Rs\.?\s*|INR\s*|₹\s*)?([\d,]+\.?\d*)/i)
      || raw.match(/(?:grand\s*total|net\s*(?:amount|payable))\s*[:\-]?\s*(?:Rs\.?\s*|INR\s*|₹\s*)?([\d,]+\.?\d*)/i);
    let total = totalMatch ? (totalMatch[1] || totalMatch[2] || '').trim() : null;

    // If no explicit total found but we have ₹ amounts, compute the largest as total
    if (!total && pairs.length >= 2) {
      const amounts = pairs.map(p => parseFloat(p.amount.replace(/,/g, ''))).filter(n => !isNaN(n));
      if (amounts.length > 0) {
        const maxAmount = Math.max(...amounts);
        // Check if the last pair's amount equals the max (likely the total row)
        const lastAmount = parseFloat(pairs[pairs.length - 1].amount.replace(/,/g, ''));
        if (lastAmount === maxAmount && pairs.length > 1) {
          total = pairs[pairs.length - 1].amount;
          pairs.pop(); // Remove the total row from line items
        }
      }
    }

    // Also try to find standalone ₹ total if no pairs extracted it
    if (!total) {
      const allAmounts = [...raw.matchAll(/(?:Rs\.?\s*|INR\s*|₹)\s*([\d,]+\.?\d*)/gi)];
      if (allAmounts.length >= 2) {
        const parsed = allAmounts.map(m2 => parseFloat(m2[1].replace(/,/g, ''))).filter(n => !isNaN(n) && n > 0);
        if (parsed.length > 0) {
          const maxVal = Math.max(...parsed);
          total = allAmounts.find(m2 => parseFloat(m2[1].replace(/,/g, '')) === maxVal)?.[1]?.trim() || null;
        }
      }
    }

    return { pairs, total };
  };

  // ════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-50 dark:bg-black min-h-screen">

      {/* ── Glassmorphism Invoice Scanner Overlay ── */}
      {uploading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div
            className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden border border-white/20 shadow-2xl"
            style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(24px)' }}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-400/30 flex items-center justify-center scan-pulse">
                  <span className="text-xl">🔍</span>
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">AI Extracting Fields…</h3>
                  <p className="text-white/50 text-xs mt-0.5 truncate max-w-[260px]">
                    {uploadFile?.name ?? 'Processing document'}
                  </p>
                </div>
              </div>
            </div>

            {/* Document preview strip with laser */}
            <div
              className="relative mx-6 mt-4 h-32 rounded-xl overflow-hidden border border-white/10"
              style={{ background: 'rgba(0,0,0,0.3)' }}
            >
              {/* Simulated document lines */}
              {[...Array(7)].map((_, i) => (
                <div
                  key={i}
                  className="absolute left-4 right-4 h-2 rounded-full bg-white/10"
                  style={{ top: `${12 + i * 13}%` }}
                />
              ))}
              {/* Laser line */}
              <div
                className="scanner-laser absolute left-0 right-0 h-0.5 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, #22c55e 20%, #86efac 50%, #22c55e 80%, transparent 100%)',
                  boxShadow: '0 0 12px 3px rgba(34,197,94,0.6)',
                }}
              />
              {/* Corner brackets */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-green-400/60 rounded-tl" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-green-400/60 rounded-tr" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-green-400/60 rounded-bl" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-green-400/60 rounded-br" />
            </div>

            {/* Field detection chips */}
            <div className="px-6 py-4 space-y-2">
              {(uploadType === 'GST'
                ? ['Invoice Number', 'Creator GSTIN', 'Taxable Amount', 'CGST / SGST', 'Bank Details', 'PAN Card']
                : ['Invoice Date', 'Bank Name', 'Account Number', 'IFSC Code', 'PAN Card', 'Signature']
              ).map((field, i) => (
                <div
                  key={field}
                  className="scanner-field flex items-center gap-2.5"
                  style={{ animationDelay: `${i * 220}ms` }}
                >
                  <div className="w-4 h-4 rounded-full bg-green-500/20 border border-green-400/40 flex items-center justify-center flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  </div>
                  <span className="text-white/60 text-xs">{field}</span>
                  <div className="flex-1 h-px bg-white/10 rounded" />
                  <span className="text-green-400/60 text-[10px]">scanning…</span>
                </div>
              ))}
            </div>

            {/* Footer progress bar */}
            <div className="px-6 pb-5">
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
                  style={{ animation: 'progress-fill 3s ease-out forwards' }}
                />
              </div>
              <p className="text-white/30 text-[10px] mt-1.5 text-center">OCR processing in progress</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Campaign Details Modal ───────────────────────────── */}
      {campaignDetailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setCampaignDetailOpen(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-700 w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-700 bg-green-50 dark:bg-green-900/20">
              <div className="flex items-center gap-2">
                <span className="text-xl">📋</span>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">Campaign Details</h3>
              </div>
              <button onClick={() => setCampaignDetailOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-500 dark:text-gray-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Parsed breakdown */}
              {(() => {
                const { pairs, total } = parseCampaignDetails(campaignDetailText);
                if (pairs.length > 0) {
                  return (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Breakdown</h4>
                      <div className="rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-zinc-800">
                              <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-300">Name</th>
                              <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-300">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                            {pairs.map((p, i) => (
                              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                                <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{p.name}</td>
                                <td className="px-4 py-2.5 text-right font-semibold text-gray-800 dark:text-gray-200">₹{p.amount}</td>
                              </tr>
                            ))}
                          </tbody>
                          {total && (
                            <tfoot>
                              <tr className="bg-green-50 dark:bg-green-900/20 border-t-2 border-green-200 dark:border-green-800">
                                <td className="px-4 py-2.5 font-bold text-gray-800 dark:text-white">Total</td>
                                <td className="px-4 py-2.5 text-right font-bold text-green-700 dark:text-green-400">₹{total}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Raw text */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Raw Text</h4>
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                  {campaignDetailText}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 flex justify-end">
              <button onClick={() => setCampaignDetailOpen(false)} className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800 px-8 py-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Invoice</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Upload, scan & manage GST and Non-GST invoices</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setActiveTab('list'); setSelectedInvoice(null); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'list' ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'}`}>
              📋 All Invoices
            </button>
            <button onClick={() => { setActiveTab('history'); setSelectedInvoice(null); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'}`}>
              📜 History
            </button>
            <button onClick={() => { setActiveTab('upload'); setSelectedInvoice(null); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'upload' ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'}`}>
              ⬆️ Upload Invoice
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {/* ─── UPLOAD TAB ─────────────────────────────────────────── */}
        {activeTab === 'upload' && !selectedInvoice && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Type selector */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Invoice Type</h3>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setUploadType('NON_GST')} className={`p-4 rounded-xl border-2 text-left transition-all ${uploadType === 'NON_GST' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'}`}>
                  <div className="text-lg font-bold text-gray-800 dark:text-white">Non-GST</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Bank details, PAN, signature, campaign info</div>
                </button>
                <button onClick={() => setUploadType('GST')} className={`p-4 rounded-xl border-2 text-left transition-all ${uploadType === 'GST' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'}`}>
                  <div className="text-lg font-bold text-gray-800 dark:text-white">GST</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">GSTIN, addresses, invoice number, bank details</div>
                </button>
              </div>
            </div>

            {/* File Upload */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Upload Document</h3>
              <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={() => fileRef.current?.click()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-zinc-600 hover:border-green-400 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}>
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                {uploadFile ? (
                  <div>
                    <div className="text-4xl mb-2">📄</div>
                    <div className="text-sm font-medium text-gray-800 dark:text-white">{uploadFile.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{formatSize(uploadFile.size)} — Click or drop to replace</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-2">📎</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400"><span className="text-green-600 font-medium">Click to browse</span> or drag and drop</div>
                    <div className="text-xs text-gray-400 mt-1">PDF, Word, JPG, PNG — Max 15 MB</div>
                  </div>
                )}
              </div>
            </div>

            {/* Folder selection */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Save to Folder</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {['Uncategorized', ...folders.filter(f => f !== 'Uncategorized')].map(f => (
                  <button key={f} onClick={() => { setUploadFolder(f); setNewFolder(''); }} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${uploadFolder === f && !newFolder ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'}`}>
                    📁 {f}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="Or create new folder…" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400" />
            </div>

            {/* Upload button */}
            <button onClick={handleUpload} disabled={!uploadFile || uploading} className="w-full py-3.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-zinc-700 text-white font-semibold rounded-xl transition-colors shadow-sm text-sm">
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Uploading & Scanning…
                </span>
              ) : `Upload & Scan ${uploadType === 'GST' ? 'GST' : 'Non-GST'} Invoice`}
            </button>
          </div>
        )}

        {/* ─── INVOICE LIST TAB ───────────────────────────────────── */}
        {activeTab === 'list' && !selectedInvoice && (
          <div className="space-y-4">
            {/* Folders Grid */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">📂 Folders</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {physicalFolders.map(f => {
                    const count = allInvoices.filter(inv => inv.folder === f).length;
                    return (
                      <div key={f} className="relative">
                        {/* Three-dot menu */}
                        <div className="absolute top-1 right-1 z-10">
                          <button
                            onClick={(e) => { e.stopPropagation(); setFolderMenuOpen(folderMenuOpen === f ? null : f); }}
                            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <circle cx="10" cy="4" r="1.5" />
                              <circle cx="10" cy="10" r="1.5" />
                              <circle cx="10" cy="16" r="1.5" />
                            </svg>
                          </button>
                          {folderMenuOpen === f && (
                            <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 z-20">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setConfirmState({
                                    open: true,
                                    title: 'Delete Folder',
                                    message: `Delete folder "${f}"? Invoices inside will be moved to Uncategorized.`,
                                    onConfirm: async () => {
                                      setConfirmState(prev => ({ ...prev, open: false }));
                                      try {
                                        const res = await fetch(`${API_URL}/api/invoices/delete-folder`, {
                                          method: 'DELETE',
                                          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ folderName: f }),
                                        });
                                        if (res.ok) {
                                          fetchFolders();
                                          fetchInvoices();
                                          fetchAllInvoices();
                                        }
                                      } catch (err) { console.error('Failed to delete folder:', err); }
                                      setFolderMenuOpen(null);
                                    },
                                  });
                                  setFolderMenuOpen(null);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                              >
                                🗑️ Delete Folder
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setFilterFolder(f === filterFolder ? 'all' : f)}
                          className={`w-full flex flex-col items-center p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                            filterFolder === f
                              ? 'border-green-500 bg-green-50 dark:bg-green-900/20 shadow-sm'
                              : 'border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-gray-300 dark:hover:border-zinc-600'
                          }`}
                        >
                          <span className="text-3xl mb-2">📁</span>
                          <span className="text-sm font-medium text-gray-800 dark:text-white truncate w-full text-center">{f}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">{count} invoice{count !== 1 ? 's' : ''}</span>
                        </button>
                      </div>
                    );
                  })}
                  {/* Create Folder Card */}
                  {showCreateFolderInput ? (
                    <div className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900">
                      <input
                        type="text"
                        value={createFolderName}
                        onChange={(e) => setCreateFolderName(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && createFolderName.trim()) {
                            try {
                              const res = await fetch(`${API_URL}/api/invoices/create-folder`, {
                                method: 'POST',
                                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                                body: JSON.stringify({ folderName: createFolderName.trim() }),
                              });
                              const data = await res.json();
                              if (res.ok) {
                                fetchPhysicalFolders();
                                fetchFolders();
                                setCreateFolderName('');
                                setShowCreateFolderInput(false);
                              } else {
                                alert(data.error || 'Failed to create folder');
                              }
                            } catch (err) { alert('Failed to create folder'); }
                          } else if (e.key === 'Escape') {
                            setShowCreateFolderInput(false);
                            setCreateFolderName('');
                          }
                        }}
                        placeholder="Folder name…"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 text-center mb-2"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!createFolderName.trim()) return;
                            try {
                              const res = await fetch(`${API_URL}/api/invoices/create-folder`, {
                                method: 'POST',
                                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                                body: JSON.stringify({ folderName: createFolderName.trim() }),
                              });
                              const data = await res.json();
                              if (res.ok) {
                                fetchPhysicalFolders();
                                fetchFolders();
                                setCreateFolderName('');
                                setShowCreateFolderInput(false);
                              } else {
                                alert(data.error || 'Failed to create folder');
                              }
                            } catch (err) { alert('Failed to create folder'); }
                          }}
                          className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => { setShowCreateFolderInput(false); setCreateFolderName(''); }}
                          className="px-3 py-1 text-xs font-medium bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCreateFolderInput(true)}
                      className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 hover:border-green-400 dark:hover:border-green-600 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all hover:shadow-md cursor-pointer"
                    >
                      <span className="text-3xl mb-2">➕</span>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Create Folder</span>
                    </button>
                  )}
                </div>
              </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <select value={filterFolder} onChange={(e) => setFilterFolder(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200">
                <option value="all">All Folders</option>
                {folders.map(f => <option key={f} value={f}>📁 {f}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200">
                <option value="">All Statuses</option>
                <option value="UPLOADED">Uploaded</option>
                <option value="SCANNED">Scanned</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200">
                <option value="">All Types</option>
                <option value="GST">GST</option>
                <option value="NON_GST">Non-GST</option>
              </select>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loading3DCube size={36} color="bg-green-500" label="Loading invoices..." />
              </div>
            ) : invoices.length === 0 ? (
              <Empty3DState
                title="No invoices found"
                subtitle="No invoices match the current filters"
                icon={
                  <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              />
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">File</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Folder</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                    {invoices.map(inv => (
                      <tr key={inv.id} onClick={() => { setSelectedInvoice(inv); setApproveFolder(inv.folder); setApproveNewFolder(''); setMoveFolder(inv.folder); setMoveNewFolder(''); setIsEditing(false); setShowDocPreview(false); setShowSignaturePreview(false); }} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800 dark:text-white truncate max-w-[200px]">{inv.originalName}</div>
                          <div className="text-xs text-gray-400">{formatSize(inv.fileSize)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${inv.type === 'GST' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>{inv.type === 'GST' ? 'GST' : 'Non-GST'}</span>
                        </td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[inv.status]}`}>{inv.status}</span></td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">📁 {inv.folder}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{inv.campaignAmount ? `₹${inv.campaignAmount}` : '—'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{inv.invoiceDate || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(inv.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── HISTORY TAB ────────────────────────────────────────── */}
        {activeTab === 'history' && !selectedInvoice && (() => {
          const historyInvoices = invoices.filter(inv => inv.status === 'UPLOADED' || inv.status === 'SCANNED' || inv.status === 'REJECTED');
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">📜 Invoice History</h3>
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded">Uploaded, Scanned & Rejected invoices</span>
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{historyInvoices.length} invoice{historyInvoices.length !== 1 ? 's' : ''}</span>
                  {historyInvoices.length > 0 && (
                    <button
                      onClick={async () => {
                        setConfirmState({
                          open: true,
                          title: 'Clear Invoice History',
                          message: 'This will permanently delete all uploaded, scanned & rejected invoices and their files. This cannot be undone.',
                          confirmLabel: 'Clear All',
                          onConfirm: async () => {
                            setConfirmState(prev => ({ ...prev, open: false }));
                            try {
                              const res = await fetch(`${API_URL}/api/invoices/clear-all`, { method: 'DELETE', headers: getAuthHeaders() });
                              if (res.ok) {
                                fetchInvoices();
                                fetchAllInvoices();
                                fetchFolders();
                              }
                            } catch (err) { console.error('Failed to clear history:', err); }
                          },
                        });
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 rounded-lg transition-colors"
                    >
                      🗑️ Clear History
                    </button>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loading3DCube size={36} color="bg-green-500" label="Loading history..." />
                </div>
              ) : historyInvoices.length === 0 ? (
                <Empty3DState
                  title="No history"
                  subtitle="No uploaded, scanned or rejected invoices found"
                />
              ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
                        <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">File</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Folder</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Date</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Uploaded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                      {historyInvoices.map(inv => (
                        <tr key={inv.id} onClick={() => { setSelectedInvoice(inv); setApproveFolder(inv.folder); setApproveNewFolder(''); setMoveFolder(inv.folder); setMoveNewFolder(''); setIsEditing(false); setShowDocPreview(false); setShowSignaturePreview(false); }} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800 dark:text-white truncate max-w-[200px]">{inv.originalName}</div>
                            <div className="text-xs text-gray-400">{formatSize(inv.fileSize)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${inv.type === 'GST' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>{inv.type === 'GST' ? 'GST' : 'Non-GST'}</span>
                          </td>
                          <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[inv.status]}`}>{inv.status}</span></td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">📁 {inv.folder}</td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{inv.campaignAmount ? `₹${inv.campaignAmount}` : '—'}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{inv.invoiceDate || '—'}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(inv.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── INVOICE DETAIL / SCAN RESULTS ──────────────────────── */}
        {selectedInvoice && (
          <div className="space-y-6">
            <button onClick={() => { setSelectedInvoice(null); setIsEditing(false); setDuplicateWarning(null); setShowDocPreview(false); setShowSignaturePreview(false); }} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1">
              ← Back to {activeTab === 'upload' ? 'Upload' : activeTab === 'history' ? 'History' : 'List'}
            </button>

            {duplicateWarning && duplicateWarning.matches.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4 flex items-start gap-3">
                <span className="text-xl flex-shrink-0">⚠️</span>
                <div className="flex-1">
                  <h4 className="font-semibold text-amber-800 dark:text-amber-300 text-sm">Possible Duplicate Invoice</h4>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    This invoice may be a duplicate of {duplicateWarning.matches.length} existing invoice(s):
                  </p>
                  <ul className="mt-2 space-y-1">
                    {duplicateWarning.matches.map(m => (
                      <li key={m.id} className="text-xs text-amber-700 dark:text-amber-400">
                        • {m.originalName} — Amount: {m.campaignAmount || 'N/A'} — Date: {m.invoiceDate || 'N/A'} — Folder: {m.folder}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => setDuplicateWarning(null)} className="mt-2 text-xs text-amber-600 dark:text-amber-400 underline hover:text-amber-800 dark:hover:text-amber-200">
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Invoice Info */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-5">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Invoice Info</h3>
                  <div className="space-y-3 text-sm">
                    <div><span className="text-gray-500 dark:text-gray-400">File:</span><span className="ml-2 text-gray-800 dark:text-white font-medium">{selectedInvoice.originalName}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Type:</span><span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${selectedInvoice.type === 'GST' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>{selectedInvoice.type === 'GST' ? 'GST' : 'Non-GST'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Status:</span><span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${statusColors[selectedInvoice.status]}`}>{selectedInvoice.status}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Size:</span><span className="ml-2 text-gray-700 dark:text-gray-300">{formatSize(selectedInvoice.fileSize)}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Folder:</span><span className="ml-2 text-gray-700 dark:text-gray-300">📁 {selectedInvoice.folder}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Uploaded by:</span><span className="ml-2 text-gray-700 dark:text-gray-300">{selectedInvoice.uploadedBy?.name || selectedInvoice.uploadedBy?.email}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Uploaded:</span><span className="ml-2 text-gray-700 dark:text-gray-300">{formatDate(selectedInvoice.createdAt)}</span></div>
                  </div>
                  <div className="mt-6 space-y-2">
                    <button onClick={() => handleDownload(selectedInvoice)} className="w-full py-2 text-sm bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors font-medium">📥 Download Original</button>
                    <button onClick={() => handleDelete(selectedInvoice)} className="w-full py-2 text-sm bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 rounded-lg transition-colors font-medium">🗑️ Delete Invoice</button>
                  </div>
                </div>


              </div>

              {/* Right: Scan Results */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Scan Results</h3>
                    {selectedInvoice.status !== 'APPROVED' && (
                      <button onClick={() => {
                        if (isEditing) { handleSaveFields(selectedInvoice); } else {
                          // Populate editing fields from scanResults + DB column fallback
                          const fieldMap = selectedInvoice.type === 'GST' ? GST_FIELDS : NON_GST_FIELDS;
                          const results = selectedInvoice.scanResults || {};
                          const fields: Record<string, string> = {};

                          // Predefined fields (with DB column fallback)
                          for (const key of Object.keys(fieldMap)) {
                            if (key === 'signature') continue; // not editable
                            const sr = results[key] as FieldResult | undefined;
                            const srValue = sr?.value || '';
                            // Fallback to DB column value if scanResults is empty
                            const dbValue = (selectedInvoice as any)[key] || '';
                            fields[key] = srValue || dbValue;
                          }

                          // Extra dynamic fields from scanResults (no DB column)
                          for (const key of Object.keys(results)) {
                            if (fieldMap[key] || SKIP_DISPLAY_KEYS.has(key) || key === 'signature') continue;
                            const sr = results[key] as FieldResult | undefined;
                            fields[key] = sr?.value || '';
                          }

                          setEditingFields(fields);
                          setIsEditing(true);
                        }
                      }} className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50">
                        {isEditing ? '💾 Save Changes' : '✏️ Edit Fields'}
                      </button>
                    )}
                  </div>
                  {selectedInvoice.scanResults ? renderScanResults(selectedInvoice) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <div className="text-3xl mb-2">🔍</div>
                      <p>No scan data available. The document might be an image without extractable text.</p>
                    </div>
                  )}
                </div>

                {/* Document Preview (shows invoice inline so signature is visible) */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">📄 Document Preview</h3>
                    <button
                      onClick={() => setShowDocPreview(v => !v)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
                    >
                      {showDocPreview ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {showDocPreview && (() => {
                    const fileUrl = `${API_URL}/uploads/invoice-files/${selectedInvoice.fileName}`;
                    const mime = selectedInvoice.mimeType || '';
                    const isImage = mime.startsWith('image/');
                    return (
                      <div className="mt-4">
                        {isImage ? (
                          <img
                            src={fileUrl}
                            alt={selectedInvoice.originalName}
                            className="w-full rounded-lg border border-gray-200 dark:border-zinc-700 object-contain max-h-[800px]"
                          />
                        ) : (
                          <iframe
                            src={fileUrl}
                            title={selectedInvoice.originalName}
                            className="w-full rounded-lg border border-gray-200 dark:border-zinc-700"
                            style={{ height: '800px' }}
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Approve / Reject section */}
                {(selectedInvoice.status === 'SCANNED' || selectedInvoice.status === 'UPLOADED') && (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-5">
                    <div className="flex gap-3">
                      <button onClick={() => handleApprove(selectedInvoice)} className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors text-sm">✅ Approve Invoice</button>
                      <button onClick={() => handleReject(selectedInvoice)} className="flex-1 py-2.5 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 font-semibold rounded-lg transition-colors text-sm">❌ Reject Invoice</button>
                    </div>
                  </div>
                )}

                {selectedInvoice.status === 'APPROVED' && (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-2xl">✅</span>
                      <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">Invoice Approved</h3>
                    </div>

                    {postApproveMode === 'done' ? (
                      <div className="text-center py-4">
                        <div className="text-3xl mb-2">📁</div>
                        <div className="font-semibold text-gray-800 dark:text-white">Saved to folder</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">📁 {selectedInvoice.folder}</div>
                      </div>
                    ) : postApproveMode === 'create' ? (
                      <div className="space-y-3">
                        <button onClick={() => setPostApproveMode('choice')} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">← Back</button>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New folder name:</label>
                        <input
                          type="text"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
                          placeholder="Enter folder name…"
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400"
                          autoFocus
                        />
                        <button
                          onClick={handleCreateFolder}
                          disabled={!newFolderName.trim() || savingToFolder}
                          className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-zinc-700 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          {savingToFolder ? 'Creating…' : '📁 Create Folder & Save'}
                        </button>
                      </div>
                    ) : postApproveMode === 'existing' ? (
                      <div className="space-y-3">
                        <button onClick={() => setPostApproveMode('choice')} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">← Back</button>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Choose a folder:</label>
                        {physicalFolders.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">No folders found. Create one first.</p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {physicalFolders.map(f => (
                              <button
                                key={f}
                                onClick={() => handleMoveToExistingFolder(f)}
                                disabled={savingToFolder}
                                className="w-full text-left px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-400 transition-colors"
                              >
                                📁 {f}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Where would you like to save this invoice?</p>
                        <button
                          onClick={() => setPostApproveMode('create')}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          📁 Create Folder
                        </button>
                        <button
                          onClick={() => { fetchPhysicalFolders(); setPostApproveMode('existing'); }}
                          className="w-full py-2.5 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors text-sm"
                        >
                          📂 Upload to Existing Folder
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {selectedInvoice.status === 'REJECTED' && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">❌</div>
                    <div className="font-semibold text-red-700 dark:text-red-400">Invoice Rejected</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}
