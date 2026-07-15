import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_URL } from '../config';

interface TokenInfo {
  campaignId: string;
  campaignName: string;
  brandName: string;
  creatorEmail: string;
  creatorName: string | null;
  requestId: string;
  acceptedByUserId: string;
}

interface FormData {
  invoiceType: 'GST' | 'NON_GST';
  invoiceDate: string;
  invoiceNumber: string;
  campaignDetails: string;
  campaignAmount: string;
  tds: string;
  netPayable: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  upiId: string;
  // Non-GST specific
  panCard: string;
  // GST specific
  creatorGstin: string;
  placeOfSupply: string;
  taxableAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
}

const EMPTY_FORM: FormData = {
  invoiceType: 'NON_GST',
  invoiceDate: '',
  invoiceNumber: '',
  campaignDetails: '',
  campaignAmount: '',
  tds: '',
  netPayable: '',
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ifscCode: '',
  branchName: '',
  upiId: '',
  panCard: '',
  creatorGstin: '',
  placeOfSupply: '',
  taxableAmount: '',
  cgst: '',
  sgst: '',
  igst: '',
};

export default function CreatorInvoiceSubmit() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Upload mode state
  const [mode, setMode] = useState<'form' | 'upload'>('form');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFields, setUploadFields] = useState({ liveLink: '' });
  const [uploading, setUploading] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError('No token found in link. Please use the exact link from your email.');
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/creator-portal/submit/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error === 'expired') {
          setError('This link has expired. Please contact 3Folks Media to request a new one.');
        } else if (data.error) {
          setError('Invalid or unknown link. Please use the exact link from your email.');
        } else {
          setTokenInfo(data);
        }
      })
      .catch(() => setError('Unable to reach the server. Please try again.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/creator-portal/submit/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Submission failed. Please try again.');
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setError('Please select an invoice file');
      return;
    }
    if (!uploadFields.liveLink.trim()) {
      setError('Please provide the live link (Instagram/social media link)');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      Object.entries(uploadFields).forEach(([k, v]) => { if (v) fd.append(k, v); });
      const res = await fetch(`${API_URL}/api/creator-portal/submit/${token}/upload`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed. Please try again.');
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // ─── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Validating your link…</div>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Link Error</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // ─── Success state ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Invoice Submitted!</h2>
          <p className="text-gray-500 text-sm">
            Your invoice for <strong>{tokenInfo?.campaignName}</strong> has been submitted successfully.
            The team will review it and get back to you.
          </p>
        </div>
      </div>
    );
  }

  const isGST = form.invoiceType === 'GST';

  // ─── Form ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 mb-6 text-white">
          <p className="text-indigo-200 text-xs font-medium uppercase tracking-wide mb-1">3Folks Media — Creator Portal</p>
          <h1 className="text-2xl font-bold">{tokenInfo?.campaignName}</h1>
          <p className="text-indigo-200 text-sm mt-1">{tokenInfo?.brandName}</p>
          <div className="mt-3 text-sm">
            <span className="bg-white/20 rounded-full px-3 py-1">{tokenInfo?.creatorEmail}</span>
          </div>
        </div>

        {/* Mode switcher */}
        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={() => setMode('form')}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all flex items-center justify-center gap-2 ${mode === 'form' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Create Invoice
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all flex items-center justify-center gap-2 ${mode === 'upload' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Upload Invoice
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6" style={{ display: mode === 'form' ? undefined : 'none' }}>
          {/* Invoice Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Type</label>
            <div className="flex gap-3">
              {(['NON_GST', 'GST'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, invoiceType: t }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                    form.invoiceType === t
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  {t === 'NON_GST' ? 'Non-GST' : 'GST'}
                </button>
              ))}
            </div>
          </div>

          {/* Basic Details */}
          <Section title="Invoice Details">
            <Field label="Invoice Date" name="invoiceDate" type="date" value={form.invoiceDate} onChange={handleChange} />
            <Field label="Invoice Number" name="invoiceNumber" value={form.invoiceNumber} onChange={handleChange} placeholder="e.g. INV-2025-001" />
            <FullField label="Campaign / Description" name="campaignDetails" value={form.campaignDetails} onChange={handleChange} textarea />
          </Section>

          {/* Amount */}
          <Section title="Amount Details">
            <Field label="Total Amount (₹)" name="campaignAmount" value={form.campaignAmount} onChange={handleChange} placeholder="e.g. 25000" />
            {isGST && (
              <>
                <Field label="Taxable Amount (₹)" name="taxableAmount" value={form.taxableAmount} onChange={handleChange} />
                <Field label="CGST (₹)" name="cgst" value={form.cgst} onChange={handleChange} />
                <Field label="SGST (₹)" name="sgst" value={form.sgst} onChange={handleChange} />
                <Field label="IGST (₹)" name="igst" value={form.igst} onChange={handleChange} />
              </>
            )}
            <Field label="TDS (₹)" name="tds" value={form.tds} onChange={handleChange} placeholder="optional" />
            <Field label="Net Payable (₹)" name="netPayable" value={form.netPayable} onChange={handleChange} />
          </Section>

          {/* GST / PAN */}
          <Section title={isGST ? 'GST Details' : 'PAN Details'}>
            {isGST ? (
              <>
                <Field label="Your GSTIN" name="creatorGstin" value={form.creatorGstin} onChange={handleChange} placeholder="e.g. 27AAAPZ1234A1ZK" />
                <Field label="Place of Supply" name="placeOfSupply" value={form.placeOfSupply} onChange={handleChange} placeholder="e.g. Maharashtra" />
              </>
            ) : (
              <Field label="PAN Card Number" name="panCard" value={form.panCard} onChange={handleChange} placeholder="e.g. ABCDE1234F" required />
            )}
          </Section>

          {/* Bank Details */}
          <Section title="Bank Details">
            <Field label="Account Holder Name" name="accountHolderName" value={form.accountHolderName} onChange={handleChange} required />
            <Field label="Bank Name" name="bankName" value={form.bankName} onChange={handleChange} required />
            <Field label="Account Number" name="accountNumber" value={form.accountNumber} onChange={handleChange} required />
            <Field label="IFSC Code" name="ifscCode" value={form.ifscCode} onChange={handleChange} placeholder="e.g. HDFC0001234" required />
            <Field label="Branch Name" name="branchName" value={form.branchName} onChange={handleChange} />
            <Field label="UPI ID (optional)" name="upiId" value={form.upiId} onChange={handleChange} placeholder="e.g. name@upi" />
          </Section>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {submitting ? 'Submitting…' : 'Submit Invoice'}
          </button>
        </form>

        {/* Upload Invoice Form */}
        {mode === 'upload' && (
          <form onSubmit={handleUpload} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
            {/* File drop zone */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice File <span className="text-red-500">*</span></label>
              <label className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploadFile ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 bg-gray-50'}`}>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="hidden"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  required
                />
                {uploadFile ? (
                  <div className="text-center px-4">
                    <svg className="w-8 h-8 text-indigo-500 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-sm font-medium text-indigo-700">{uploadFile.name}</p>
                    <p className="text-xs text-gray-400">{(uploadFile.size / 1024).toFixed(0)} KB · Click to change</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    <p className="text-sm text-gray-500">Click to select your invoice file</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, Word · Max 15 MB</p>
                  </div>
                )}
              </label>
            </div>

            {/* Live Link */}
            <FullField label="Campaign Live Link (Instagram/Social Media) *" name="liveLink" type="url" value={uploadFields.liveLink} onChange={e => setUploadFields(p => ({ ...p, [e.target.name]: e.target.value }))} placeholder="e.g. https://www.instagram.com/p/..." required />

            <button
              type="submit"
              disabled={uploading || !uploadFile || !uploadFields.liveLink.trim()}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {uploading ? 'Uploading…' : 'Upload Invoice'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by 3Folks Media · This link is personal and unique to you
        </p>
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

interface FieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
}

function Field({ label, name, value, onChange, type = 'text', placeholder, required, textarea }: FieldProps) {
  const cls = 'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-gray-50';
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {textarea ? (
        <textarea name={name} value={value} onChange={onChange} placeholder={placeholder} rows={3} className={cls} />
      ) : (
        <input name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} className={cls} />
      )}
    </div>
  );
}

function FullField(props: FieldProps) {
  return (
    <div className="sm:col-span-2">
      <Field {...props} />
    </div>
  );
}
