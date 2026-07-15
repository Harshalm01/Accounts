import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';
import ConfirmModal from '../components/ConfirmModal';


interface RoasterRecord {
  id: string;
  month: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt: string;
  data?: any[];
}

export default function Roaster() {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [roasterRecords, setRoasterRecords] = useState<RoasterRecord[]>([]);
  const [viewingRecord, setViewingRecord] = useState<RoasterRecord | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  const userRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return null; } })();

  // Fetch all roaster records
  const fetchRoasterRecords = async () => {
    setLoadingRecords(true);
    try {
      const response = await fetch(`${API_URL}/api/roaster`);
      if (response.ok) {
        const data = await response.json();
        setRoasterRecords(data);
      }
    } catch (error) {
      console.error('Failed to fetch roaster records:', error);
    } finally {
      setLoadingRecords(false);
    }
  };

  // Load records on component mount
  useEffect(() => {
    fetchRoasterRecords();
  }, []);

  // Live sync: refetch when roaster records change on any client
  useEffect(() => {
    const socket = io(API_URL);
    const handleRoasterChange = () => fetchRoasterRecords();
    socket.on('roaster:uploaded', handleRoasterChange);
    socket.on('roaster:deleted', handleRoasterChange);
    return () => {
      socket.off('roaster:uploaded', handleRoasterChange);
      socket.off('roaster:deleted', handleRoasterChange);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCsvFile(e.target.files[0]);
      setUploadMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!csvFile || !selectedMonth) {
      setUploadMessage({ type: 'error', text: 'Please select both month and file' });
      return;
    }

    setUploading(true);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('month', selectedMonth);

      const response = await fetch(`${API_URL}/api/roaster/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        const isPdf = data.roaster?.mimeType === 'application/pdf';
        setUploadMessage({
          type: 'success',
          text: isPdf
            ? 'File uploaded successfully!'
            : `File uploaded successfully! ${data.roaster.rowCount} rows processed.`
        });
        // Reset form
        setSelectedMonth('');
        setCsvFile(null);
        // Reset file input
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        // Refresh records list
        fetchRoasterRecords();
      } else {
        setUploadMessage({
          type: 'error',
          text: data.error || 'Failed to upload file'
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadMessage({
        type: 'error',
        text: 'Failed to upload file. Please try again.'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleViewRecord = async (recordId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/roaster/${recordId}`);
      if (response.ok) {
        const data = await response.json();
        setViewingRecord(data);
      }
    } catch (error) {
      console.error('Failed to fetch record details:', error);
    }
  };

  const handleDeleteRecord = (recordId: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Record',
      message: 'This roster record will be permanently deleted. This action cannot be undone.',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));
        try {
          const response = await fetch(`${API_URL}/api/roaster/${recordId}`, {
            method: 'DELETE',
          });
          if (response.ok) {
            fetchRoasterRecords();
            setUploadMessage({ type: 'success', text: 'Record deleted successfully' });
          }
        } catch (error) {
          console.error('Failed to delete record:', error);
          setUploadMessage({ type: 'error', text: 'Failed to delete record' });
        }
      },
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    const mb = kb / 1024;
    return mb >= 1 ? `${mb.toFixed(2)} MB` : `${kb.toFixed(2)} KB`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header Section */}
      <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800 px-8 py-6 shadow-sm mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
              Roaster Management
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Upload and manage your monthly influencer roasters</p>
          </div>
          <div className="px-6 py-3 bg-gradient-to-br from-indigo-50 to-purple-100 rounded-lg shadow-sm border border-indigo-200">
            <div className="text-xs text-gray-600 font-medium">Total Uploads</div>
            <div className="text-2xl font-bold text-indigo-600">{roasterRecords.length}</div>
          </div>
        </div>
      </div>

      <div className="px-8">
        {/* Important Notice — hidden from BRAND */}
        {userRole !== 'BRAND' && (
        <div className="mb-6 bg-amber-50 border border-amber-200 border-l-4 p-4 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-amber-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-amber-900 font-bold text-base">Important Reminder</h3>
              <p className="text-amber-800 text-sm mt-1">
                Make sure to update every month between <span className="font-bold">1st-5th</span> to maintain accurate records
              </p>
            </div>
          </div>
        </div>
        )}

        {/* Upload Section — hidden from BRAND */}
        {userRole !== 'BRAND' && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-5">
            <h2 className="text-xl font-bold text-white flex items-center">
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload New File
            </h2>
            <p className="text-indigo-100 mt-1 text-sm">Select a month and upload your roaster data file</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Month Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                Select Month *
              </label>
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-white dark:bg-zinc-900 dark:text-white dark:border-zinc-800 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 font-medium appearance-none cursor-pointer hover:border-indigo-300 transition-colors"
                >
                  <option value="">Choose a month</option>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                    <option key={month} value={month}>{month}</option>
                  ))}
                </select>
                <svg className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                Upload File *
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf,.csv,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={handleFileChange}
                  required
                  className="w-full px-4 py-3 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 font-medium file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-900 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-800 cursor-pointer hover:border-indigo-300 transition-colors"
                />
              </div>
              {csvFile && (
                <div className="flex items-center mt-3 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-green-700">{csvFile.name}</span>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">Supported formats: PDF, CSV, Excel (.pdf, .csv, .xls, .xlsx)</p>
            </div>
          </div>

          {/* Success/Error Message */}
          {uploadMessage && (
            <div className={`mt-6 p-4 rounded-lg border ${uploadMessage.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center">
                {uploadMessage.type === 'success' ? (
                  <svg className="w-5 h-5 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <p className={`font-semibold text-sm ${uploadMessage.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
                  {uploadMessage.text}
                </p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="mt-6">
            <button
              type="submit"
              disabled={uploading}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploading...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Roaster Data
                </span>
              )}
            </button>
          </div>
        </form>
        </div>
        )}

        {/* Uploaded Records Section */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <div className="bg-white dark:bg-black px-8 py-5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Uploaded Records
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mt-1 text-sm">View and manage your uploaded roaster files</p>
          </div>

        <div className="p-6">
          {loadingRecords ? (
            <div className="flex flex-col items-center justify-center py-16">
              <svg className="animate-spin h-12 w-12 text-indigo-600 mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-gray-600 font-medium">Loading records...</p>
            </div>
          ) : roasterRecords.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No Records Yet</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Upload your first roaster file to get started</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {roasterRecords.map((record) => (
                <div
                  key={record.id}
                  className="group bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-5 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-5 flex-1">
                      <div className="flex-shrink-0">
                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-50 to-purple-100 rounded-lg flex items-center justify-center border border-indigo-200">
                          <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold">
                            {record.month}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                            {formatFileSize(record.fileSize)}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{record.fileName}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {new Date(record.uploadedAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {record.mimeType === 'application/pdf' ? (
                        <a
                          href={`${API_URL}/api/roaster/${record.id}/file`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors shadow-sm"
                        >
                          View PDF
                        </a>
                      ) : (
                        <button
                          onClick={() => handleViewRecord(record.id)}
                          className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors shadow-sm"
                        >
                          View Data
                        </button>
                      )}
                      {userRole !== 'BRAND' && (
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        className="px-5 py-2 bg-red-50 text-red-600 rounded-lg font-semibold hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors border border-red-200"
                      >
                        Delete
                      </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>

      {viewingRecord && (
        <div onClick={() => setViewingRecord(null)} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-5">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="px-3 py-1 bg-white/20 backdrop-blur-sm text-white rounded-full text-sm font-semibold">
                      {viewingRecord.month}
                    </span>
                    <span className="text-white/90 text-sm">
                      {new Date(viewingRecord.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-white">{viewingRecord.fileName}</h2>
                  {viewingRecord.data && (
                    <p className="text-indigo-100 mt-1 text-sm">
                      {viewingRecord.data.length} rows • {formatFileSize(viewingRecord.fileSize)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setViewingRecord(null)}
                  className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-all"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-zinc-800">
              {viewingRecord.data && viewingRecord.data.length > 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-800">
                      <thead className="bg-gray-50 dark:bg-zinc-800">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-zinc-800 sticky top-0">
                            #
                          </th>
                          {Object.keys(viewingRecord.data[0]).map((header) => (
                            <th key={header} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-zinc-800 sticky top-0">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-zinc-900 divide-y divide-gray-200 dark:divide-zinc-800">
                        {viewingRecord.data.map((row, idx) => (
                          <tr key={idx} className="hover:bg-purple-50 dark:hover:bg-zinc-800 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-500">
                              {idx + 1}
                            </td>
                            {Object.values(row).map((value: any, cellIdx) => (
                              <td key={cellIdx} className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                {value}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="mt-4 text-gray-500 font-medium">No data available</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 dark:border-zinc-800 px-8 py-4 bg-gray-50 dark:bg-zinc-900 flex justify-end space-x-3">
              <button
                onClick={() => setViewingRecord(null)}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom CSS for animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}
