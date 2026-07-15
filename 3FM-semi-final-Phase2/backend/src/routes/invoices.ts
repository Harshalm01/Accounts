import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mammoth from 'mammoth';
import { authenticate } from '../middleware/auth';
import { attachUserRole, requireRole, RoleAuthRequest } from '../middleware/roleMiddleware';
import { detectDateBoosted, learnFromCorrection, confirmPattern } from '../services/dateBooster';
import { detectFieldBoosted, learnFieldCorrection, getBoostingStats } from '../services/fieldBooster';
import { sendInvoiceApprovedEmail, sendInvoiceRejectedEmail } from '../services/emailService';

// pdf-parse v2+ exports a PDFParse class (not a default function)
const { PDFParse } = require('pdf-parse');

// ─── PDF-to-image rendering (for signature extraction) ─────────────────
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = '';
const { createCanvas } = require('canvas');

const router = Router();
const prisma = new PrismaClient();

// ─── Upload directory setup ────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads/invoice-files');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const signaturesDir = path.join(__dirname, '../../uploads/invoice-sigs');
if (!fs.existsSync(signaturesDir)) {
  fs.mkdirSync(signaturesDir, { recursive: true });
}

// ─── Multer config ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'inv-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowedExt = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents, and images are allowed'));
    }
  },
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

// ─── Text extraction helpers ───────────────────────────────────────────
async function extractTextFromPDF(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return cleanExtractedText(result.text);
}

async function extractTextFromWord(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return cleanExtractedText(result.value);
}

/**
 * Clean PDF/Word extraction artifacts and restore structure:
 * - Removes spaces in character-spam sequences (like "B i l l e d")
 * - Preserves legitimate word breaks (like "LOVDUO MEDIA")
 * - Handles spaced digits and special characters
 * - Restores line breaks at section boundaries
 * - Normalizes whitespace
 */
function cleanExtractedText(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Step 1: Remove spaces in character-spam sequences iteratively
  // Strategy: Detect ongoing spam sequences via lookahead, iterate until clean
  // Key: The lookahead must allow both mid-sequence AND end-of-sequence patterns
  let prev = '';
  let iterations = 0;
  while (prev !== cleaned && iterations < 10) {
    prev = cleaned;

    // Pattern 1: Remove spaces between digits (always safe)
    // "7 6 , 7 0 0" -> "76,700"
    cleaned = cleaned.replace(/(\d)\s+(?=\d)/g, '$1');

    // Pattern 2: Remove space when the next char is also spaced (spam) or at end
    // Lookahead (?=[a-zA-Z0-9](?:\s|$)) means: next is alphanumeric followed by space OR end
    // This catches both middle patterns like "i l " and end patterns like "e d" (at line end)
    cleaned = cleaned.replace(/([a-zA-Z0-9])\s+(?=[a-zA-Z0-9](?:\s|$))/g, '$1');

    iterations++;
  }

  // Step 2: Fix spaced digits: "7 6 , 7 0 0" → "76,700"
  cleaned = cleaned.replace(/(\d)\s+(\d)/g, '$1$2');
  cleaned = cleaned.replace(/(\d)\s+(,)/g, '$1$2');
  cleaned = cleaned.replace(/(,)\s+(\d)/g, '$1$2');

  // Step 3: Fix spaced special characters in amounts: "₹ 7 6 , 7 0 0" → "₹76,700"
  cleaned = cleaned.replace(/(₹|Rs\.?|INR)\s+/g, '$1 ');

  // Step 4: Restore line breaks at section boundaries (major headers)
  const sectionHeaders = [
    'Terms and Conditions',
    'Authorized Signatory',
    'Declaration',
    'Bank Details',
    'Payment Details',
    'Payment Information',
    'Account Information',
    'HSN/SAC',
    'GST Details',
    'IGST',
    'CGST',
    'SGST',
    'Billed To',
    'Shipped To',
  ];

  for (const header of sectionHeaders) {
    // Insert newline before section headers (case-insensitive, allowing spacing)
    const regex = new RegExp(`([^ ])\\s*${header.replace(/\s+/g, '\\s*')}(?=\\s|$|:)`, 'gi');
    cleaned = cleaned.replace(regex, '$1\n' + header);
  }

  // Step 5: Restore line breaks before common field labels (expanded list)
  const fieldPatterns = [
    'Account',
    'A/C',
    'IFSC',
    'IFC',
    'Bank Name',
    'Branch Name',
    'Branch Address',
    'Account Holder',
    'Beneficiary',
    'PAN',
    'GSTIN',
    'Invoice',
    'Amount',
    'Receiver',
    'Signature',
    'Signatory',
    'Name',
    'For',
  ];

  for (const field of fieldPatterns) {
    // Match: (end of word with 2+ chars) + space + field label
    // This inserts a line break before field labels that appear mid-text
    const regex = new RegExp(`([^ ][^ ]{2,})\\s+${field}`, 'gi');
    cleaned = cleaned.replace(regex, '$1\n' + field);
  }

  // Step 5b: Add line breaks before contact information fields
  const contactFields = [
    'Tel',
    'Telephone',
    'Phone',
    'Mobile',
    'Cell',
    'Email',
    'Website',
    'Web',
    'URL',
    'Fax',
    'Contact',
    'CIN',
  ];

  for (const field of contactFields) {
    // Match: (end of word) + field label (with optional colon/hyphen after)
    // Allows: "ACE-4123Tel." or "ACE-4123Tel :" or "ACE-4123Tel:"
    const regex = new RegExp(`([^ ][^ ]{2,})${field}(?:\\.?\\s*[:-]?)`, 'gi');
    cleaned = cleaned.replace(regex, '$1\n' + field + '.');
  }

  // Step 5c: Add line breaks before common section/closure phrases
  const closingPhrases = [
    'Seal of',
    'Authorized by',
    'Certified by',
    'For and on behalf',
    'Managing Director',
    'Company Seal',
  ];

  for (const phrase of closingPhrases) {
    const regex = new RegExp(`([^ ])\\s+${phrase.replace(/\s+/g, '\\s+')}`, 'gi');
    cleaned = cleaned.replace(regex, '$1\n' + phrase);
  }

  // Step 6: Clean up multiple consecutive spaces
  cleaned = cleaned.replace(/  +/g, ' ');

  // Step 7: Clean up multiple consecutive newlines
  cleaned = cleaned.replace(/\n\n+/g, '\n');

  return cleaned;
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractTextFromPDF(filePath);
  if (ext === '.doc' || ext === '.docx') return extractTextFromWord(filePath);
  // For images we return empty – image OCR can be added later
  return '';
}

// ─── Render last PDF page to PNG (for signature preview) ───────────────
async function renderPDFLastPage(filePath: string): Promise<Buffer | null> {
  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    const page = await doc.getPage(doc.numPages);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toBuffer('image/png');
  } catch (err) {
    console.error('[SignatureRender] Failed to render PDF page:', (err as Error).message);
    return null;
  }
}

// ─── Field detection (regex-based scanning) ────────────────────────────
interface FieldResult {
  value: string;
  detected: boolean;
}

interface DetectionResult {
  fields: Record<string, FieldResult>;
  datePatternId: string; // which booster pattern detected the date
}

// ─── Keys that are purely internal metadata — not returned as generic fields ──
const INTERNAL_SCAN_KEYS = new Set([
  'signatureImage', 'datePatternId', 'amountPatternId',
]);

// Keys already covered by predefined detection functions (excluded from generic)
const PREDEFINED_KEYS = new Set([
  'bankName', 'accountHolderName', 'accountNumber', 'ifscCode', 'branchName',
  'branchAddress', 'panCard', 'upiId', 'signature', 'invoiceDate',
  'campaignDetails', 'campaignAmount', 'tds', 'netPayable',
  'creatorAddress', 'creatorGstin', 'folksAddress', 'folksGstin',
  'invoiceNumber', 'placeOfSupply', 'hsnCode', 'taxableAmount',
  'cgst', 'sgst', 'igst',
]);

/** Convert a human label like "Invoice No" → "invoiceNo", "Place Of Supply" → "placeOfSupply" */
function labelToCamelCase(label: string): string {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  return words[0] + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/**
 * Scan raw (multiline) invoice text for ANY "Label : Value" pairs not already
 * covered by predefined detectors.  Each unique label becomes a camelCase key.
 * Predefined keys are skipped here — their dedicated detectors take priority.
 */
function extractGenericFields(text: string): Record<string, FieldResult> {
  const result: Record<string, FieldResult> = {};
  const lines = text.split('\n');

  // Track whether we're inside a line-items / description block.
  // Lines in such blocks look like label:value but are actually item details
  // (e.g. CREATOR: John, SONG: XYZ inside a DESCRIPTION section).
  let inDescriptionBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // ── Section-header detection (no colon — pure header lines) ────────
    // Entering a description/items block
    if (/^(?:description|particulars|services?\s*rendered?|deliverables?|items?|line\s*items?|work\s*(?:done|order)|scope)\s*$/i.test(trimmed)) {
      inDescriptionBlock = true;
      continue;
    }
    // Exiting back to metadata territory (bank / payment / total section)
    if (/^(?:bank\s*(?:details?|info)?|payment\s*(?:details?|info)?|sub\s*total|grand\s*total|note|notes|regards|terms\s*(?:and|&)\s*conditions?|authorized|signature)\s*$/i.test(trimmed)) {
      inDescriptionBlock = false;
    }

    // Skip all lines while inside a description/items block
    if (inDescriptionBlock) continue;

    // ── Label : Value matching ──────────────────────────────────────────
    // Label: letters and spaces only (no digits — prevents "Reel x 3 : 30,000")
    // Max 30 chars for the label
    const match = trimmed.match(/^([A-Za-z][A-Za-z\s\-]{1,30}?)\s*[:–]\s*(.{1,300})$/);
    if (!match) continue;

    const rawLabel = match[1].trim();
    const value   = match[2].trim();

    if (!rawLabel || !value) continue;

    // Skip if value side is just a single generic word (table column header)
    if (/^(?:name|no|number|code|amount|total|bank|account|branch|pan|gst|invoice|bill|date|address|details|description|quantity|qty|rate|hsn|sac|upi|id|type|place|supply|nil|na|n\/a)$/i.test(value)) continue;

    // Skip if value is a pure currency/number (likely a line-item amount leaked through)
    if (/^[₹$€£Rs.]*\s*[\d,]+\.?\d*\s*(?:only|\/\-)?$/i.test(value)) continue;

    const key = labelToCamelCase(rawLabel);
    if (!key || key.length < 2) continue;

    // Skip if already handled by a predefined detector
    if (PREDEFINED_KEYS.has(key)) continue;

    // Skip internal metadata keys
    if (INTERNAL_SCAN_KEYS.has(key)) continue;

    // First occurrence wins
    if (result[key]) continue;

    result[key] = { value, detected: true };
  }

  return result;
}

async function detectNonGSTFields(text: string): Promise<DetectionResult> {
  const t = text.replace(/\s+/g, ' ');

  // Use boosted detection for date
  const dateResult = await detectDateBoosted(t);

  // Use boosted detection for key fields (amount, bank, account, IFSC)
  const [amountResult, bankResult, accountResult, ifscResult] = await Promise.all([
    detectFieldBoosted('campaignAmount', t,
      /(?:total|amount|grand\s*total|net\s*(?:amount|payable))\s*(?:\(?₹?\)?\.?)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]{2,}\.?\d*)/i),
    detectFieldBoosted('bankName', t,
      /bank\s*(?:name)?\s*[:\-]?\s*([A-Za-z\s&]+(?:bank|ltd|limited))/i),
    detectFieldBoosted('accountNumber', t,
      /(?:account|a\/c)\s*(?:no|number|num|#)?\s*[:\-]?\s*(\d[\d\s\-]{5,17}\d)/i),
    detectFieldBoosted('ifscCode', t,
      /(?:ifsc|ifc)\s*(?:code)?\s*[:\-]?\s*([A-Z]{4}[0O][A-Z0-9]{6})/i),
  ]);

  // ── Enhanced total amount detection (4-strategy, same as GST) ────────
  const totalAmountResult = detectTotalAmount(t, text);
  const finalAmount = totalAmountResult.detected ? totalAmountResult : amountResult;

  // Standalone fallbacks for PDF table extraction issues
  const standaloneIfsc = ifscResult.detected ? ifscResult : detectStandaloneIFSC(t, text);
  const standaloneAccount = accountResult.detected ? accountResult : detectStandaloneAccountNumber(t, text);
  const standaloneBankName = detectStandaloneBankName(t);
  const bestBank = bankResult.detected ? bankResult : standaloneBankName;
  // Sequential parser — extracts branch/holder from original line-ordered payment section
  const seqPayment = detectPaymentSectionSequential(text);

  const predefinedFields = {
    bankName: { value: bestBank.value, detected: bestBank.detected },
    accountHolderName: (() => {
      const d = detectAccountHolderName(t);
      return (d.detected && d.value) ? d : seqPayment.accountHolderName;
    })(),
    accountNumber: { value: standaloneAccount.value, detected: standaloneAccount.detected },
    ifscCode: { value: standaloneIfsc.value, detected: standaloneIfsc.detected },
    branchName: (() => {
      const d = detect(t, /branch\s*(?:name)?\s*[:\-]?\s*([A-Za-z\s,.\-]+?)(?=\s+(?:branch\s*address|account|a\/c|ifsc|pan|payment|sign|$))/i);
      return (d.detected && !isColumnHeaderGarbage(d.value)) ? d : seqPayment.branchName;
    })(),
    branchAddress: (() => {
      const d = detect(t, /branch\s*(?:address)\s*[:\-]?\s*(.{10,200}?)(?=\s+(?:account|a\/c|ifsc|pan|sign|$))/i);
      return (d.detected && !isColumnHeaderGarbage(d.value)) ? d : seqPayment.branchAddress;
    })(),
    panCard: detectPAN(t),
    upiId: detectUPI(t),
    signature: detectPresence(t, /sign(?:ature|ed)|authorized|authorised|\bfor\s+\(?[A-Za-z][A-Za-z\s]*\)?/i, 'signature'),
    invoiceDate: { value: dateResult.value, detected: dateResult.detected },
    campaignDetails: detectCampaignDetails(t),
    campaignAmount: { value: finalAmount.value, detected: finalAmount.detected },
    tds: detectTDS(t),
    netPayable: detectNetPayable(t),
  };
  // Merge generic fields extracted line-by-line (predefined detectors win on same key)
  const genericNonGst = extractGenericFields(text);

  // Post-filter: drop generic fields whose values appear inside campaign details text
  const campaignTextNonGst = (predefinedFields.campaignDetails?.value || '').toLowerCase();
  const filteredGenericNonGst = Object.fromEntries(
    Object.entries(genericNonGst).filter(([, r]) =>
      !(campaignTextNonGst && r.value && campaignTextNonGst.includes(r.value.toLowerCase()))
    )
  );

  return {
    fields: { ...filteredGenericNonGst, ...predefinedFields },
    datePatternId: dateResult.patternId,
  };
}

async function detectGSTFields(text: string): Promise<DetectionResult> {
  const t = text.replace(/\s+/g, ' ');

  // Use boosted detection for date
  const dateResult = await detectDateBoosted(t);

  // Use boosted detection for key GST fields
  const [amountResult, bankResult, accountResult, ifscResult, gstinResult, invNumResult] = await Promise.all([
    detectFieldBoosted('campaignAmount', t,
      /(?:total|amount|grand\s*total|net\s*(?:amount|payable))\s*(?:\(?₹?\)?\.?)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]{2,}\.?\d*)/i),
    detectFieldBoosted('bankName', t,
      /bank\s*(?:name)?\s*[:\-]?\s*([A-Za-z\s&]+(?:bank|ltd|limited))/i),
    detectFieldBoosted('accountNumber', t,
      /(?:account|a\/c)\s*(?:no|number|num|#)?\s*[:\-]?\s*(\d[\d\s\-]{5,17}\d)/i),
    detectFieldBoosted('ifscCode', t,
      /(?:ifsc|ifc)\s*(?:code)?\s*[:\-]?\s*([A-Z]{4}[0O][A-Z0-9]{6})/i),
    detectFieldBoosted('creatorGstin', t,
      /(?:gstin|gst\s*(?:no\.?|n\.?o\.?|number|in)?)\s*[:\-]\s*(\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d])/i),
    detectFieldBoosted('invoiceNumber', t,
      /(?:invoice\s*(?:no|number|#|num))\s*[:\-]?\s*([A-Za-z0-9\-\/.]+)/i),
  ]);

  // ── Enhanced total amount detection for GST invoices ─────────────
  // GST invoices often have "AMOUNT (₹)" column headers with multiple
  // line items. The boosted regex may grab the first item, not the total.
  const totalAmountResult = detectTotalAmount(t, text);
  // Prefer explicit total if found; otherwise use boosted result
  const finalAmount = totalAmountResult.detected ? totalAmountResult : amountResult;

  // ── Enhanced bank details from PAYMENT DETAILS table ─────────────
  const paymentBankName = detectPaymentTableField(t, /bank\s*name\s*[:\-]?\s*([A-Za-z\s&]+?)(?=\s+(?:branch|account|a\/c|ifsc|pan|$))/i);
  const paymentBranchName = detectPaymentTableField(t, /branch\s*name\s*[:\-]?\s*([A-Za-z\s,.\-–]+?)(?=\s+(?:branch\s*address|account|a\/c|ifsc|pan|$))/i);
  const paymentBranchAddress = detectPaymentTableField(t, /branch\s*address\s*[:\-]?\s*(.{10,200}?)(?=\s+(?:account|a\/c|ifsc|pan|sign|$))/i);
  const paymentAccountHolder = detectPaymentTableField(t, /(?:account\s*holder\s*name|a\/c\s*holder\s*name|beneficiary\s*name?)\s*[:\-]?\s*([A-Za-z.]+(?:\s+[A-Za-z.]+)*?)(?=\s+(?:account\s*(?:no|number)|a\/c\s*(?:no|number)|ifsc|pan|bank|\d)|$)/i);
  const paymentAccountNum = detectPaymentTableField(t, /(?:account|a\/c)\s*(?:no|number|num|#)?\s*[:\-]?\s*(\d[\d\s\-]{5,17}\d)/i);
  const paymentIfsc = detectPaymentTableField(t, /(?:ifsc|ifc)\s*(?:code)?\s*[:\-]?\s*([A-Z]{4}[0O][A-Z0-9]{6})/i);

  // ── Standalone fallbacks for when PDF extracts table columns separately ──
  const standaloneIfsc = detectStandaloneIFSC(t, text);
  const standaloneAccount = detectStandaloneAccountNumber(t, text);
  const standaloneBankName = detectStandaloneBankName(t);
  // Sequential parser — extracts branch/holder from original line-ordered payment section
  const seqPayment = detectPaymentSectionSequential(text);

  // Pick the best result for each field: boosted > payment table > sequential > standalone
  const bestIfsc = ifscResult.detected ? ifscResult
    : paymentIfsc.detected ? paymentIfsc
    : standaloneIfsc;
  const bestAccount = accountResult.detected ? accountResult
    : paymentAccountNum.detected ? paymentAccountNum
    : standaloneAccount;
  const bestBank = bankResult.detected ? bankResult
    : paymentBankName.detected ? paymentBankName
    : standaloneBankName;

  const predefinedGstFields = {
    creatorAddress: detect(t, /(?:address|from)\s*[:\-]?\s*(.{10,120})/i),
    creatorGstin: { value: gstinResult.value, detected: gstinResult.detected },
    folksAddress: detectPresence(t, /3\s*folks|three\s*folks/i, '3Folks Media address'),
    folksGstin: detectSecondGSTIN(t),
    invoiceNumber: { value: invNumResult.value, detected: invNumResult.detected },
    invoiceDate: { value: dateResult.value, detected: dateResult.detected },
    campaignDetails: detectCampaignDetails(t),
    campaignAmount: { value: finalAmount.value, detected: finalAmount.detected },
    bankName: { value: bestBank.value, detected: bestBank.detected },
    branchName: (() => {
      const d = detect(t, /branch\s*(?:name)?\s*[:\-]?\s*([A-Za-z\s,.\-–]+?)(?=\s+(?:branch\s*address|account|a\/c|ifsc|pan|payment|sign|$))/i);
      if (d.detected && !isColumnHeaderGarbage(d.value)) return d;
      if (paymentBranchName.detected) return paymentBranchName;
      return seqPayment.branchName;
    })(),
    branchAddress: (() => {
      const d = detect(t, /branch\s*(?:address)\s*[:\-]?\s*(.{10,200}?)(?=\s+(?:account|a\/c|ifsc|pan|sign|$))/i);
      if (d.detected && !isColumnHeaderGarbage(d.value)) return d;
      if (paymentBranchAddress.detected) return paymentBranchAddress;
      return seqPayment.branchAddress;
    })(),
    accountHolderName: (() => {
      const d = detectAccountHolderName(t);
      if (d.detected) return d;
      if (paymentAccountHolder.detected && paymentAccountHolder.value) return paymentAccountHolder;
      return seqPayment.accountHolderName;
    })(),
    accountNumber: { value: bestAccount.value, detected: bestAccount.detected },
    ifscCode: { value: bestIfsc.value, detected: bestIfsc.detected },
    panCard: detectPAN(t),
    upiId: detectUPI(t),
    signature: detectPresence(t, /sign(?:ature|ed)|authorized|authorised|\bfor\s+\(?[A-Za-z][A-Za-z\s]*\)?/i, 'signature'),
    // ── Tax and financial breakdown ──────────────────────────────────
    placeOfSupply: detectPlaceOfSupply(t),
    hsnCode: detectHSNCode(t),
    taxableAmount: detectTaxableAmount(t),
    cgst: detectCGST(t),
    sgst: detectSGST(t),
    igst: detectIGST(t),
    tds: detectTDS(t),
    netPayable: detectNetPayable(t),
  };
  // Merge generic fields extracted line-by-line (predefined detectors win on same key)
  const genericGst = extractGenericFields(text);

  // Post-filter: drop generic fields whose values appear inside campaign details text
  const campaignTextGst = (predefinedGstFields.campaignDetails?.value || '').toLowerCase();
  const filteredGenericGst = Object.fromEntries(
    Object.entries(genericGst).filter(([, r]) =>
      !(campaignTextGst && r.value && campaignTextGst.includes(r.value.toLowerCase()))
    )
  );

  return {
    fields: { ...filteredGenericGst, ...predefinedGstFields },
    datePatternId: dateResult.patternId,
  };
}

function detect(text: string, regex: RegExp): FieldResult {
  const match = text.match(regex);
  return {
    value: match ? match[1].trim() : '',
    detected: !!match,
  };
}

/**
 * Returns true when a detected value is actually a PDF column header captured from
 * the invoice layout (e.g. "BRANCH ADDRESS", "ACCOUNT HOLDER NAME").
 * Multi-page PDFs render column headers as plain text lines before their values,
 * and collapsed text causes them to bleed into labeled-regex captures.
 */
function isColumnHeaderGarbage(val: string): boolean {
  const v = val.trim();
  return (
    /^(?:bank\s*(?:name|details)?|branch\s*(?:name|address)?|account\s*(?:holder|name|number|no\.?)?|a\/c\s*(?:holder|number|no\.?)?|ifsc\s*(?:code)?|pan\s*(?:card|no\.?)?|upi\s*(?:id|no|address)?|number|details|code|address|holder|name|payment\s*details?)$/i.test(v)
    || /\b(?:account\s*(?:holder\s*name|n(?:o\.?|umber))|branch\s*(?:name|address)|ifsc\s*code|pan\s*card|bank\s*name)\b/i.test(v)
  );
}

/**
 * Detect campaign details — captures the full particulars/description block
 * including all line items and total. Grabs up to 500 chars, stops at
 * bank details / payment section.
 */
function detectCampaignDetails(text: string): FieldResult {
  // Try labeled capture first (captures everything after the label up to bank/payment section)
  const stopWords = `(?:bank\s*(?:name|details|account)|a\/c\s*(?:no|holder)|account\s*(?:no|number|holder)|ifsc|pan\s*(?:card|no)|payment\s*(?:details|mode)|sign(?:ature|ed)|authorized|authorised)`;

  const labeledPatterns = [
    // "DESCRIPTION" header followed by content (GST table format)
    // Handles: DESCRIPTION [AMOUNT (₹)] CREATOR: ... SONG: ... CONTENT: ... PLATFORM: ...
    new RegExp(`(?:description)\\s*(?:of\\s*(?:goods|services))?(?:\\s*amount\\s*(?:\\(?₹?\\)?))?\\s*[:\\-]?\\s*(.{5,800}?)(?=\\s*${stopWords})`, 'is'),
    // "Description of Goods / Services: ..." or "Particulars: ..."
    new RegExp(`(?:description\\s*(?:of\\s*(?:goods|services))?|particulars|campaign\\s*(?:details|name)?|project\\s*(?:details|name)?|service\\s*(?:details)?)\\s*[:\\-]?\\s*(.{5,500}?)(?=\\s*${stopWords})`, 'is'),
    // "Quantity Rate per Amount ..." (table header format)
    /(?:quantity|item|sl\.?\s*no|s\.?\s*no|sr\.?\s*no)\s*(?:rate|description|particular|detail|name)?\s*(?:per|amount|total)?\s*(.{5,500}?)(?=\s*(?:bank\s*(?:name|details|account)|a\/c|account\s*(?:no|number|holder)|ifsc|pan|payment|sign(?:ature|ed)|authorized|authorised))/is,
  ];

  for (const rx of labeledPatterns) {
    const m = text.match(rx);
    if (m && m[1]) {
      const val = m[1].replace(/\s+/g, ' ').trim();
      if (val.length >= 5) return { value: val, detected: true };
    }
  }

  // Try to find structured key-value description lines (CREATOR:, SONG:, CONTENT:, PLATFORM:, etc.)
  const structuredFields = ['creator', 'song', 'content', 'platform', 'influencer', 'artist', 'channel', 'deliverables', 'campaign\\s*type'];
  const structuredRegex = new RegExp(`((?:${structuredFields.join('|')})\\s*[:\\-]\\s*.+?)(?=\\s*(?:${stopWords}|$))`, 'is');
  const structuredMatch = text.match(structuredRegex);
  if (structuredMatch && structuredMatch[1]) {
    // Capture everything from the first structured field to the stop words
    const startIdx = text.indexOf(structuredMatch[1]);
    const beforeStart = text.substring(Math.max(0, startIdx - 100), startIdx);
    // Check if there's a DESCRIPTION header nearby
    const hasDescHeader = /description/i.test(beforeStart);
    const val = structuredMatch[1].replace(/\s+/g, ' ').trim();
    if (val.length >= 5) return { value: val, detected: true };
  }

  // Fallback: shorter capture (80 chars)
  const fallback = text.match(/(?:campaign|project|description|particulars|service|detail)\s*(?:details|name)?\s*[:\-]?\s*(.{5,80})/i);
  if (fallback && fallback[1]) {
    return { value: fallback[1].replace(/\s+/g, ' ').trim(), detected: true };
  }

  return { value: '', detected: false };
}

/**
 * Detect total campaign amount — multi-strategy approach for GST invoices.
 * Handles "AMOUNT (₹)" column headers, explicit Total rows, and ₹-prefixed amounts.
 * Returns the total/final amount from the invoice.
 */
function detectTotalAmount(collapsedText: string, originalText: string): FieldResult {
  const t = collapsedText;

  // Strategy 1: Explicit total/grand total labels with amount
  const totalPatterns = [
    /(?:grand\s*total|total\s*amount|total\s*payable|net\s*payable|total\s*invoice\s*(?:value|amount)?|invoice\s*total|amount\s*payable|total\s*value)\s*(?:\(?₹?\)?\.?)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]{2,}\.?\d*)/i,
    /(?:^|\s)total\s+(?:\(?₹?\)?\.?)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]{2,}\.?\d*)/im,
    // Amount before "Total": "₹40,600 Total" or "40,600/- Total"
    /(?:Rs\.?|INR|₹)\s*([\d,]{2,}\.?\d*)\s*\/?-?\s*(?:total|grand\s*total)/i,
  ];

  for (const rx of totalPatterns) {
    const m = t.match(rx);
    if (m && m[1]) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (val > 0) return { value: m[1].trim(), detected: true };
    }
  }

  // Strategy 2: Find all ₹-prefixed amounts and pick the largest (typically the total)
  const allAmounts = [...t.matchAll(/(?:Rs\.?\s*|INR\s*|₹)\s*([\d,]{2,}\.?\d*)/gi)];
  if (allAmounts.length >= 2) {
    const parsed = allAmounts.map(m => ({
      raw: m[1].trim(),
      numeric: parseFloat(m[1].replace(/,/g, ''))
    })).filter(a => !isNaN(a.numeric) && a.numeric > 0);

    if (parsed.length > 0) {
      // The largest amount is typically the total in GST invoices
      const largest = parsed.reduce((max, a) => a.numeric > max.numeric ? a : max, parsed[0]);
      return { value: largest.raw, detected: true };
    }
  }

  // Strategy 3: "AMOUNT (₹)" or "AMOUNT(₹)" header — grab last number before payment section
  const headerMatch = t.match(/amount\s*\(?₹\)?/i);
  if (headerMatch) {
    const afterIdx = (t.indexOf(headerMatch[0]) || 0) + headerMatch[0].length;
    const restText = t.substring(afterIdx);
    const stopIdx = restText.search(/(?:payment\s*details|bank\s*(?:name|details|account)|a\/c\s|account\s*(?:holder|no|number)|ifsc|pan\s*(?:card|no))/i);
    const searchText = stopIdx > 0 ? restText.substring(0, stopIdx) : restText.substring(0, 600);

    const nums = [...searchText.matchAll(/([\d,]{3,}\.?\d*)/g)];
    if (nums.length > 0) {
      // Last number before payment section is typically the total
      const lastNum = nums[nums.length - 1][1];
      const val = parseFloat(lastNum.replace(/,/g, ''));
      if (val > 0) return { value: lastNum.trim(), detected: true };
    }
  }

  // Strategy 4: On original text (with line breaks), find last ₹ amount before payment section
  if (originalText) {
    const paymentIdx = originalText.search(/payment\s*details|bank\s*(?:name|details)/i);
    const searchArea = paymentIdx > 0 ? originalText.substring(0, paymentIdx) : originalText;
    const lineAmounts = [...searchArea.matchAll(/(?:Rs\.?\s*|INR\s*|₹)\s*([\d,]{2,}\.?\d*)/gi)];
    if (lineAmounts.length > 0) {
      // Pick the largest amount
      const parsed = lineAmounts.map(m => ({
        raw: m[1].trim(),
        numeric: parseFloat(m[1].replace(/,/g, ''))
      })).filter(a => !isNaN(a.numeric) && a.numeric > 0);
      if (parsed.length > 0) {
        const largest = parsed.reduce((max, a) => a.numeric > max.numeric ? a : max, parsed[0]);
        return { value: largest.raw, detected: true };
      }
    }
  }

  return { value: '', detected: false };
}

/**
 * Helper: detect a field from the PAYMENT DETAILS table section.
 * Many GST invoices have a structured "PAYMENT DETAILS" table.
 */
function detectPaymentTableField(text: string, regex: RegExp): FieldResult {
  // Try within the payment details section first
  // Stop pattern uses [\s(*]* to handle "(AUTHORISED SIGNATORY)" style endings
  // Now also stops at line breaks (\n) to prevent cross-field contamination
  const paymentSection = text.match(/payment\s*details\s*(.{10,1500}?)(?=[\s(*\n]*(?:sign(?:ature|ed)|authorized|authorised|for\s+[A-Za-z]|declaration|terms|account|hsn|gst|\*\s*$|\n--|\n[A-Z]{3})|$)/is);
  if (paymentSection && paymentSection[1]) {
    const m = paymentSection[1].match(regex);
    if (m && m[1]) {
      const value = m[1].trim();
      // Stop at line break if found
      const lineBreakIdx = value.indexOf('\n');
      const finalValue = lineBreakIdx > 0 ? value.substring(0, lineBreakIdx) : value;
      if (!isColumnHeaderGarbage(finalValue)) return { value: finalValue, detected: true };
    }
  }
  // Fallback: try against full text — but reject column-header garbage from page-1 table labels
  const m = text.match(regex);
  if (m && m[1]) {
    const value = m[1].trim();
    // Stop at line break if found
    const lineBreakIdx = value.indexOf('\n');
    const finalValue = lineBreakIdx > 0 ? value.substring(0, lineBreakIdx) : value;
    if (!isColumnHeaderGarbage(finalValue)) return { value: finalValue, detected: true };
  }
  return { value: '', detected: false };
}

/**
 * Standalone IFSC detection — searches for the distinctive IFSC pattern
 * anywhere in the text without requiring a label prefix.
 * IFSC format: 4 letters + 0 + 6 alphanumeric (e.g., HDFC0000526)
 * Used as fallback when PDF table extraction separates labels from values.
 */
function detectStandaloneIFSC(collapsedText: string, originalText: string): FieldResult {
  // Collect all GSTIN matches to exclude them
  const gstinMatches = new Set<string>();
  const gstinRx = /\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z\d]/gi;
  let gm;
  while ((gm = gstinRx.exec(collapsedText)) !== null) {
    gstinMatches.add(gm[0].toUpperCase());
  }

  // Search for IFSC pattern in both collapsed and original text
  for (const searchText of [collapsedText, originalText]) {
    if (!searchText) continue;
    const matches = [...searchText.matchAll(/\b([A-Z]{4}[0O][A-Z0-9]{6})\b/gi)];
    for (const m of matches) {
      const candidate = m[1].toUpperCase();
      // Skip if it's part of a GSTIN
      if (gstinMatches.has(candidate)) continue;
      // Extra validation: first 4 chars must be letters (not digits)
      if (/^[A-Z]{4}/.test(candidate)) {
        console.log(`[IFSC Standalone] Detected: ${candidate}`);
        return { value: candidate, detected: true };
      }
    }
  }

  return { value: '', detected: false };
}

/**
 * Standalone account number detection — searches for long digit sequences
 * (9-18 digits) in the payment details section or full text.
 * Used as fallback when PDF table extraction separates labels from values.
 */
function detectStandaloneAccountNumber(collapsedText: string, originalText: string): FieldResult {
  // Try to find account numbers near "payment details" section
  for (const searchText of [collapsedText, originalText]) {
    if (!searchText) continue;
    const paymentIdx = searchText.search(/payment\s*details/i);
    const searchArea = paymentIdx >= 0 ? searchText.substring(paymentIdx) : searchText;
    // Look for long digit sequences (9-18 digits) that aren't phone numbers or PINs
    const matches = [...searchArea.matchAll(/\b(\d{9,18})\b/g)];
    for (const m of matches) {
      const num = m[1];
      // Skip 10-digit mobile numbers and 6-digit PINs; prefer 11+ digit bank account numbers
      if (num.length >= 11) {
        return { value: num, detected: true };
      }
    }
    // If no 11+ digit found, try 9-10 digit accounts
    for (const m of matches) {
      if (m[1].length >= 9) {
        return { value: m[1], detected: true };
      }
    }
  }
  return { value: '', detected: false };
}

/**
 * Standalone bank name detection — searches for known Indian bank names.
 */
function detectStandaloneBankName(text: string): FieldResult {
  const bankNames = [
    // Large nationalised / private banks
    'HDFC BANK', 'ICICI BANK', 'STATE BANK OF INDIA', 'SBI',
    'AXIS BANK', 'KOTAK MAHINDRA BANK', 'KOTAK BANK', 'YES BANK', 'IDBI BANK',
    'PUNJAB NATIONAL BANK', 'PNB', 'BANK OF BARODA', 'BOB',
    'CANARA BANK', 'UNION BANK OF INDIA', 'CENTRAL BANK OF INDIA',
    'INDIAN BANK', 'BANK OF INDIA', 'BOI', 'INDIAN OVERSEAS BANK',
    'UCO BANK', 'FEDERAL BANK', 'SOUTH INDIAN BANK', 'KARUR VYSYA BANK',
    'BANDHAN BANK', 'IDFC FIRST BANK', 'IDFC BANK', 'RBL BANK', 'INDUSIND BANK',
    'CITY UNION BANK', 'KARNATAKA BANK', 'DCB BANK', 'UJJIVAN',
    'AU SMALL FINANCE BANK', 'AU BANK', 'EQUITAS', 'JANA SMALL FINANCE', 'DBS BANK',
    // Additional banks common with Indian creators
    'BANK OF MAHARASHTRA', 'PUNJAB & SIND BANK', 'VIJAYA BANK',
    'DENA BANK', 'ALLAHABAD BANK', 'ANDHRA BANK', 'CORPORATION BANK',
    'NAINITAL BANK', 'SARASWAT BANK', 'SHAMRAO VITHAL BANK', 'SVC BANK',
    'BASSEIN CATHOLIC BANK', 'COSMOS BANK', 'ABHYUDAYA BANK',
    'JALGAON JANATA SAHAKARI BANK', 'JANATA SAHAKARI BANK',
    'KERALA GRAMIN BANK', 'KARNATAKA VIKAS GRAMEENA BANK',
    'CITI BANK', 'CITIBANK', 'STANDARD CHARTERED BANK', 'HSBC BANK', 'HSBC',
    'PAYTM PAYMENTS BANK', 'AIRTEL PAYMENTS BANK', 'FINO PAYMENTS BANK',
    'INDIA POST PAYMENTS BANK', 'IPPB',
    'SURYODAY SMALL FINANCE BANK', 'CAPITAL SMALL FINANCE BANK',
    'NORTHEAST SMALL FINANCE BANK', 'ESAF SMALL FINANCE BANK',
  ];
  const upper = text.toUpperCase();
  for (const bank of bankNames) {
    if (upper.includes(bank)) {
      return {
        value: bank.split(' ').map(w => w[0] + w.slice(1).toLowerCase())
          .join(' ').replace(/\bOf\b/g, 'of').replace(/\bAnd\b/g, 'and')
          .replace(/\b&\b/g, '&').replace(/\bSbi\b/g, 'SBI').replace(/\bPnb\b/g, 'PNB')
          .replace(/\bBoi\b/g, 'BOI').replace(/\bBob\b/g, 'BOB').replace(/\bHsbc\b/g, 'HSBC')
          .replace(/\bIppb\b/g, 'IPPB').replace(/\bDbs\b/g, 'DBS').replace(/\bRbl\b/g, 'RBL'),
        detected: true,
      };
    }
  }
  return { value: '', detected: false };
}

/**
 * Sequential parser for the PAYMENT DETAILS section using original (multi-line) text.
 * Many Indian invoices list payment fields as standalone lines in order:
 *   BANK NAME → BRANCH NAME → BRANCH ADDRESS (1-2 lines) → ACCOUNT HOLDER NAME → ACCOUNT NO → IFSC
 * This function extracts branchName, branchAddress, and accountHolderName from that structure.
 */
function detectPaymentSectionSequential(originalText: string): {
  branchName: FieldResult;
  branchAddress: FieldResult;
  accountHolderName: FieldResult;
} {
  const empty = (): FieldResult => ({ value: '', detected: false });

  // Find the payment details section (with original line breaks)
  const paymentMatch = originalText.match(/payment\s*details\s*\n([\s\S]*?)(?=\n--\s|\n\s*$|$)/i);
  if (!paymentMatch) return { branchName: empty(), branchAddress: empty(), accountHolderName: empty() };

  const lines = paymentMatch[1]
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Find the bank name line — contains a known bank keyword, but NOT an IFSC code
  let bankLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    if (/[A-Z]{4}0[A-Z0-9]{6}/.test(upper)) continue; // skip IFSC codes
    if (/\b(BANK|HDFC|ICICI|SBI|AXIS|KOTAK|CANARA|PNB|BOI|BOB|FEDERAL|INDUSIND|BANDHAN|IDFC|YES\b|RBL|UCO|UNION|CENTRAL|INDIAN\s+BANK|KARUR|SOUTH\s+INDIAN|CITI|HSBC|STANDARD\s+CHARTERED|DCB|UJJIVAN|EQUITAS|AU\s+BANK|DBS)\b/i.test(upper)) {
      bankLineIdx = i;
      break;
    }
  }

  // Find account number line — pure digits, 11–18 chars (avoids 10-digit phone numbers)
  let accountLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\d{11,18}$/.test(lines[i])) {
      accountLineIdx = i;
      break;
    }
  }
  // If no 11+ digit number, try 9-10 digits that aren't standalone phone numbers
  if (accountLineIdx < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\d{9,10}$/.test(lines[i]) && lines[i].length !== 10) {
        accountLineIdx = i;
        break;
      }
    }
  }

  let branchName = '';
  let branchAddress = '';
  let accountHolderName = '';

  // Branch name is the line immediately after the bank name line
  if (bankLineIdx >= 0 && bankLineIdx + 1 < lines.length) {
    const candidate = lines[bankLineIdx + 1];
    // Branch name is typically a short city/area name (no IFSC pattern, no long digit run)
    if (candidate.length < 60 && !/[A-Z]{4}0[A-Z0-9]{6}/.test(candidate) && !/^\d{6,18}$/.test(candidate)) {
      branchName = candidate;
    }
  }

  // Account holder is the line just before the account number
  if (accountLineIdx > 0) {
    const candidate = lines[accountLineIdx - 1];
    if (candidate.length >= 2 && !/^\d+$/.test(candidate) && !/[A-Z]{4}0[A-Z0-9]{6}/.test(candidate)) {
      accountHolderName = candidate;
    }
  }

  // Branch address is the lines between branch-name line and account-holder line
  if (bankLineIdx >= 0 && accountLineIdx > bankLineIdx + 2) {
    const addrStart = bankLineIdx + 2; // skip bank line and branch-name line
    const addrEnd = accountLineIdx - 1; // stop before account holder line
    if (addrEnd >= addrStart) {
      branchAddress = lines.slice(addrStart, addrEnd).map(l => l.replace(/,\s*$/, '')).join(', ');
    }
  }

  return {
    branchName: branchName ? { value: branchName, detected: true } : empty(),
    branchAddress: branchAddress ? { value: branchAddress, detected: true } : empty(),
    accountHolderName: accountHolderName ? { value: accountHolderName, detected: true } : empty(),
  };
}

function detectPresence(text: string, regex: RegExp, label: string): FieldResult {
  const found = regex.test(text);
  return { value: found ? `${label} detected` : '', detected: found };
}

function detectSecondGSTIN(text: string): FieldResult {
  const matches = text.match(/\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]/gi);
  if (matches && matches.length >= 2) {
    return { value: matches[1], detected: true };
  }
  return { value: '', detected: false };
}

/** Detect PAN — handles both contiguous (ABCDE1234F) and spaced-out (A B C D E 1 2 3 4 F) */
function detectPAN(text: string): FieldResult {
  // Try spaced-out PAN first (e.g. "PAN/IT No: G V X P P 9 2 1 3 A") — usually the submitter's
  const spaced = text.match(/(?:pan|permanent\s*account)[\/\w]*\s*(?:card|no|number)?\s*[:\-]?\s*((?:[A-Z]\s+){4}[A-Z]\s+(?:\d\s+){3}\d\s+[A-Z])/i);
  if (spaced) {
    const pan = spaced[1].replace(/\s+/g, '');
    return { value: pan, detected: true };
  }

  // Try contiguous PAN (e.g. "PAN: AACFZ6393B")
  const contiguous = text.match(/(?:pan|permanent\s*account)[\/\w]*\s*(?:card|no|number)?\s*[:\-]?\s*([A-Z]{5}\d{4}[A-Z])/i);
  if (contiguous) return { value: contiguous[1].trim(), detected: true };

  return { value: '', detected: false };
}

/**
 * Detect UPI ID — handles labelled and standalone UPI formats.
 * Common Indian UPI handles: @upi, @okicici, @oksbi, @okhdfcbank, @okaxis,
 * @ybl, @ibl, @axisbank, @paytm, @apl, @waicici, @ptyes, @pnb, @sbi, @cnrb, @boi, etc.
 */
function detectUPI(text: string): FieldResult {
  // Labelled UPI (e.g., "UPI ID: name@upi" / "UPI: 9876543210@ybl")
  const labelled = text.match(/(?:upi\s*(?:id|no|address|handle)?|virtual\s*(?:payment\s*)?address|vpa)\s*[:\-]?\s*([a-zA-Z0-9.\-_+]{2,50}@[a-zA-Z]{2,30})/i);
  if (labelled) return { value: labelled[1].trim(), detected: true };

  // Standalone UPI handle — recognise known bank handles
  const standalone = text.match(/\b([a-zA-Z0-9.\-_+]{2,30}@(?:upi|okicici|oksbi|okhdfcbank|okaxis|ybl|ibl|axisbank|paytm|apl|waicici|ptyes|pnb|sbi|cnrb|boi|icici|hdfc|axis|kotak|upi|oksbi|okhdfcbank|okaxis|idfcbank|indus|rbl|federal|juspay|fbl|airtel|slice))\b/i);
  if (standalone) return { value: standalone[1].trim(), detected: true };

  return { value: '', detected: false };
}

/**
 * Detect account holder / beneficiary name — multi-pattern approach.
 * Covers: "Account Holder Name", "A/C Holder", "Beneficiary Name",
 *         "Payee Name", "In Favour Of", "Pay To", "Name" (in payment section).
 */
function detectAccountHolderName(text: string): FieldResult {
  const stopWords = 'Bank|IFSC|IFC|UPI|Account|A\\/c|Email|PAN|Phone|Mobile|Address|Branch|GSTIN|\\d';
  const namePattern = `([A-Za-z.]+(?:\\s+[A-Za-z.]+){0,5})`;

  const patterns: RegExp[] = [
    // Standard labels
    new RegExp(`(?:account\\s*(?:holder|name)|a\\/c\\s*(?:holder|name)|beneficiary\\s*(?:name)?)\\s*[:\\-]?\\s*${namePattern}(?=\\s+(?:${stopWords})|$)`, 'i'),
    // "Payee Name" / "Name of Payee"
    new RegExp(`(?:payee\\s*(?:name)?|name\\s*of\\s*payee)\\s*[:\\-]?\\s*${namePattern}(?=\\s+(?:${stopWords})|$)`, 'i'),
    // "In favour of" / "In favor of"
    new RegExp(`in\\s+favou?r\\s*of\\s*[:\\-]?\\s*${namePattern}(?=\\s+(?:${stopWords})|$)`, 'i'),
    // "Pay to" / "Payment to"
    new RegExp(`pay(?:ment)?\\s+to\\s*[:\\-]?\\s*${namePattern}(?=\\s+(?:${stopWords})|$)`, 'i'),
    // "Receiver Name" / "Recipient Name"
    new RegExp(`(?:receiver|recipient)\\s*(?:name)?\\s*[:\\-]?\\s*${namePattern}(?=\\s+(?:${stopWords})|$)`, 'i'),
    // "Name:" appearing inside/near payment section (last resort)
    new RegExp(`(?:^|[\\n\\r])\\s*name\\s*[:\\-]\\s*${namePattern}`, 'im'),
  ];

  for (const rx of patterns) {
    const m = text.match(rx);
    if (m && m[1]) {
      const val = m[1].replace(/\s+/g, ' ').trim();
      // Reject values that are or contain banking column header phrases
      const isColumnHeader = /^(?:account\s*(?:no\.?|number|holder|name|details)?|a\/c\s*(?:no\.?|number)?|branch\s*(?:name|address)?|ifsc\s*(?:code)?|pan\s*(?:card|no\.?)|bank\s*(?:name|details)?|number|details|code|address|holder|name|payment\s*details?)$/i.test(val)
        || /\b(?:account\s*n(?:o\.?|umber)|branch\s*(?:name|address)|ifsc\s*code|pan\s*card|bank\s*name)\b/i.test(val);
      if (isColumnHeader) continue;
      // Sanity check: must have at least one space (full name) or be 4+ chars
      if (val.length >= 4 && !/^\d+$/.test(val)) {
        return { value: val, detected: true };
      }
    }
  }

  return { value: '', detected: false };
}

/**
 * Detect invoice date — robust against many Indian invoice variations:
 *   Labels:  Date, Dated, Invoice Date, Bill Date, Inv. Date, Inv Date, Dt, Dt., Date of Invoice
 *   Formats: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD\MM\YYYY,
 *            DD Mon YYYY, DD Mon -YYYY, DD Mon, YYYY, DD-Mon-YYYY, DD/Mon/YYYY,
 *            DDth Mon YYYY (ordinal), Month DD YYYY, Mon DD, YYYY,
 *            YYYY-MM-DD (ISO), standalone date on its own, multi-line label+value,
 *            DD Mon / Mon DD without year → defaults to current year
 */
function detectDate(text: string): FieldResult {
  const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

  // ── All possible label prefixes (optional) ──────────────────────────
  // Matches: "Invoice Date", "Inv. Date", "Inv Date", "Bill Date", "Date of Invoice",
  //          "Dated", "Date", "Dt.", "Dt", and their colon/hyphen suffixes
  const LABEL = `(?:(?:invoice|inv\\.?|bill)\\s+)?(?:date(?:\\s*of\\s*invoice)?|date)[d]?|dt\\.?`;
  const LABEL_PREFIX = `(?:${LABEL})\\s*[:\\-]?\\s*`;

  // Helper: try a regex with label prefix first, then without (standalone fallback)
  function tryMatch(withLabelRx: RegExp, withoutLabelRx?: RegExp): FieldResult | null {
    const m = text.match(withLabelRx);
    if (m) return { value: cleanDate(m[1]), detected: true };
    if (withoutLabelRx) {
      const m2 = text.match(withoutLabelRx);
      if (m2) return { value: cleanDate(m2[1]), detected: true };
    }
    return null;
  }

  // Clean up extracted date string
  function cleanDate(raw: string): string {
    return raw.replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim();
  }

  // ── 1. Numeric: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD\MM\YYYY (2 or 4 digit year) ──
  const numSep = `[\\/.\\\\-]`;              // separator: / . \ -
  const numDate = `(\\d{1,2}${numSep}\\d{1,2}${numSep}\\d{2,4})`;
  const r1 = tryMatch(
    new RegExp(`${LABEL_PREFIX}${numDate}`, 'i'),
    new RegExp(`(?:^|\\s)${numDate}(?:\\s|$)`, 'im')   // standalone on a line
  );
  if (r1) return r1;

  // ── 2. Named month (day first): DD Mon YYYY, DD Mon -YYYY, DD-Mon-YYYY, DD/Mon/YYYY ──
  //    Also handles ordinals: 8th Dec 2025, 1st Jan 2025
  //    Also handles comma before year: 08 Dec, 2025
  const dayFirst = `(\\d{1,2}(?:st|nd|rd|th)?\\s*[\\/.\\-]?\\s*(?:${MONTHS})[,.]?\\s*[\\/.\\-]?\\s*\\d{2,4})`;
  const r2 = tryMatch(
    new RegExp(`${LABEL_PREFIX}${dayFirst}`, 'i'),
    new RegExp(`(?:^|\\s)${dayFirst}(?:\\s|$)`, 'im')
  );
  if (r2) return r2;

  // ── 3. Named month (month first): Dec 08, 2025 / December 08 2025 ──
  const monthFirst = `((?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?[,.]?\\s+\\d{2,4})`;
  const r3 = tryMatch(
    new RegExp(`${LABEL_PREFIX}${monthFirst}`, 'i'),
    new RegExp(`(?:^|\\s)${monthFirst}(?:\\s|$)`, 'im')
  );
  if (r3) return r3;

  // ── 4. ISO format: YYYY-MM-DD ──
  const isoDate = `(\\d{4}-\\d{1,2}-\\d{1,2})`;
  const r4 = tryMatch(
    new RegExp(`${LABEL_PREFIX}${isoDate}`, 'i'),
    new RegExp(`(?:^|\\s)${isoDate}(?:\\s|$)`, 'im')
  );
  if (r4) return r4;

  // ── 5. Day + month only (no year): "1 January", "08 DEC", "8th Dec" → append current year ──
  const dayMonthOnly = `(\\d{1,2}(?:st|nd|rd|th)?\\s*[\\/.\\-]?\\s*(?:${MONTHS}))`;
  const r5label = text.match(new RegExp(`${LABEL_PREFIX}${dayMonthOnly}(?:\\s|,|$)`, 'i'));
  if (r5label) return { value: cleanDate(r5label[1]) + ' ' + new Date().getFullYear(), detected: true };
  const r5standalone = text.match(new RegExp(`(?:^|\\s)${dayMonthOnly}\\s*$`, 'im'));
  if (r5standalone) return { value: cleanDate(r5standalone[1]) + ' ' + new Date().getFullYear(), detected: true };

  // ── 5b. Month-first without year: "January 1", "Dec 08" → append current year ──
  const monthDayOnly = `((?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?)`;
  const r5b = text.match(new RegExp(`${LABEL_PREFIX}${monthDayOnly}(?:\\s|,|$)`, 'i'));
  if (r5b) return { value: cleanDate(r5b[1]) + ' ' + new Date().getFullYear(), detected: true };
  const r5bStandalone = text.match(new RegExp(`(?:^|\\s)${monthDayOnly}\\s*$`, 'im'));
  if (r5bStandalone) return { value: cleanDate(r5bStandalone[1]) + ' ' + new Date().getFullYear(), detected: true };

  return { value: '', detected: false };
}

// ─── Tax & financial field detection ──────────────────────────────────────

function detectTaxableAmount(text: string): FieldResult {
  const m = text.match(/taxable\s*(?:value|amount|amt\.?)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i)
    || text.match(/sub\s*-?\s*total\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i)
    || text.match(/base\s*(?:amount|value)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i);
  return m ? { value: m[1].trim(), detected: true } : { value: '', detected: false };
}

function detectCGST(text: string): FieldResult {
  const m = text.match(/cgst\s*(?:@\s*[\d.]+\s*%?)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i);
  return m ? { value: m[1].trim(), detected: true } : { value: '', detected: false };
}

function detectSGST(text: string): FieldResult {
  const m = text.match(/sgst\s*(?:@\s*[\d.]+\s*%?)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i);
  return m ? { value: m[1].trim(), detected: true } : { value: '', detected: false };
}

function detectIGST(text: string): FieldResult {
  const m = text.match(/igst\s*(?:@\s*[\d.]+\s*%?)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i);
  return m ? { value: m[1].trim(), detected: true } : { value: '', detected: false };
}

function detectTDS(text: string): FieldResult {
  const m = text.match(/tds\s*(?:deducted\s*at\s*source|deduction|@\s*[\d.]+\s*%?|u\/s\s*[\d]+[a-z]?)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i)
    || text.match(/tax\s*deducted\s*at\s*source\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i)
    || text.match(/(?:less\s*[:\-]?\s*)?tds\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i);
  return m ? { value: m[1].trim(), detected: true } : { value: '', detected: false };
}

function detectNetPayable(text: string): FieldResult {
  const m = text.match(/net\s*(?:amount\s*)?payable\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i)
    || text.match(/(?:amount\s*payable|payable\s*amount)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i)
    || text.match(/total\s*(?:amount\s*)?(?:due|payable)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i);
  return m ? { value: m[1].trim(), detected: true } : { value: '', detected: false };
}

function detectHSNCode(text: string): FieldResult {
  const m = text.match(/(?:hsn\s*\/?\s*sac|hsn|sac)\s*(?:code\s*)?[:\-]?\s*([\d]{4,8})/i);
  return m ? { value: m[1].trim(), detected: true } : { value: '', detected: false };
}

function detectPlaceOfSupply(text: string): FieldResult {
  const m = text.match(/place\s*of\s*supply\s*[:\-]?\s*([A-Za-z][A-Za-z\s/,()\-–]{2,60}?)(?=\s*(?:invoice|date|gstin|cgst|sgst|igst|tax|amount|hsn|reverse|$))/i);
  if (m && m[1].trim().length >= 3) return { value: m[1].trim(), detected: true };
  return { value: '', detected: false };
}

// ─── Helper: Learn field corrections on approve (positive reinforcement) ──
/**
 * When an invoice is approved, any field values that weren't changed
 * by the user are implicitly confirmed as correct. This logs the
 * confirmation so the booster can reinforce those patterns.
 */
async function learnFieldCorrectionsOnApprove(invoice: any): Promise<void> {
  // Fields that can be boosted — if the value exists and user didn't change it,
  // the detection was implicitly correct. We don't have explicit "confirmed" tracking
  // per field yet, but we can log positive signals for the database.
  // For now, this is a no-op placeholder that can be expanded later to call
  // confirmFieldPattern for each field's detected pattern if we store them.
  // The key insight: NOT changing a field = implicit confirmation.
  console.log(`[FieldBooster] Invoice ${invoice.id} approved — field detections implicitly confirmed`);
}

// ─── Duplicate detection helper ─────────────────────────────────────────
async function checkDuplicates(
  uploadedById: string,
  invoiceType: 'GST' | 'NON_GST',
  fieldValues: Record<string, any>
): Promise<Array<{ id: string; originalName: string; invoiceDate: string | null; campaignAmount: string | null; invoiceNumber: string | null; folder: string; createdAt: Date }>> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const conditions: any[] = [];

  // Same amount + date from same user in last 30 days
  if (fieldValues.campaignAmount && fieldValues.invoiceDate) {
    conditions.push({
      uploadedById,
      campaignAmount: fieldValues.campaignAmount,
      invoiceDate: fieldValues.invoiceDate,
      createdAt: { gte: thirtyDaysAgo },
    });
  }

  // Same invoice number for GST invoices (any time)
  if (invoiceType === 'GST' && fieldValues.invoiceNumber) {
    conditions.push({
      invoiceNumber: fieldValues.invoiceNumber,
    });
  }

  if (conditions.length === 0) return [];

  return prisma.invoice.findMany({
    where: { OR: conditions },
    select: { id: true, originalName: true, invoiceDate: true, campaignAmount: true, invoiceNumber: true, folder: true, createdAt: true },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });
}

// ════════════════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════════════════

// ─── POST /upload – Upload & scan an invoice ───────────────────────────
router.post(
  '/upload',
  authenticate,
  attachUserRole,
  upload.single('file'),
  async (req: RoleAuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const { type, campaignId, folder } = req.body as {
        type: string;
        campaignId?: string;
        folder?: string;
      };

      if (!type || !['GST', 'NON_GST'].includes(type)) {
        res.status(400).json({ error: 'Invoice type must be GST or NON_GST' });
        return;
      }

      const invoiceType = type as 'GST' | 'NON_GST';

      // Extract text from uploaded file
      let extractedText = '';
      try {
        extractedText = await extractText(req.file.path);
      } catch (err) {
        console.error('Text extraction error:', err);
      }

      // Debug: log raw extracted text for troubleshooting GST invoices
      if (extractedText) {
        console.log(`[Invoice Scan] Type: ${invoiceType}, File: ${req.file.originalname}`);
        console.log(`[Invoice Scan] Extracted text (first 1000 chars):\n${extractedText.substring(0, 1000)}`);
      }

      // Run field detection (async — uses boosted date detection)
      const detection: DetectionResult =
        invoiceType === 'GST'
          ? await detectGSTFields(extractedText)
          : await detectNonGSTFields(extractedText);

      const scanResults = detection.fields;
      const datePatternId = detection.datePatternId;

      // Determine status based on extraction
      const hasText = extractedText.length > 0;
      const status = hasText ? 'SCANNED' : 'UPLOADED';

      // Build field values from scan
      const fieldValues: Record<string, any> = {};
      for (const [key, result] of Object.entries(scanResults)) {
        if (result.detected && result.value) {
          fieldValues[key] = result.value;
        }
      }

      // ─── Render signature image (last PDF page) ────────────────────
      if (scanResults.signature?.detected && path.extname(req.file.path).toLowerCase() === '.pdf') {
        const sigFileName = `sig-${path.basename(req.file.filename, path.extname(req.file.filename))}.png`;
        const sigFilePath = path.join(signaturesDir, sigFileName);
        const imgBuffer = await renderPDFLastPage(req.file.path);
        if (imgBuffer) {
          fs.writeFileSync(sigFilePath, imgBuffer);
          (scanResults as any).signatureImage = {
            value: `/uploads/invoice-sigs/${sigFileName}`,
            detected: true,
          };
          console.log(`[SignatureRender] Saved signature image: ${sigFileName}`);
        }
      }

      // Check for potential duplicates (advisory only)
      const potentialDuplicates = await checkDuplicates(req.userId!, invoiceType, fieldValues);

      // Create invoice record
      const invoice = await prisma.invoice.create({
        data: {
          type: invoiceType,
          status,
          fileName: req.file.filename,
          originalName: req.file.originalname,
          filePath: req.file.path,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          scanResults: scanResults as any,
          extractedText: extractedText.substring(0, 8000) || null,
          folder: folder || 'Uncategorized',
          uploadedById: req.userId!,
          campaignId: campaignId || null,
          datePatternId: datePatternId || null,
          // Populate detected fields
          invoiceDate: fieldValues.invoiceDate || null,
          campaignDetails: fieldValues.campaignDetails || null,
          campaignAmount: fieldValues.campaignAmount || null,
          bankName: fieldValues.bankName || null,
          accountHolderName: fieldValues.accountHolderName || null,
          accountNumber: fieldValues.accountNumber || null,
          ifscCode: fieldValues.ifscCode || null,
          branchName: fieldValues.branchName || null,
          branchAddress: fieldValues.branchAddress || null,
          panCard: fieldValues.panCard || null,
          signatureDetected: scanResults.signature?.detected || false,
          creatorAddress: fieldValues.creatorAddress || null,
          creatorGstin: fieldValues.creatorGstin || null,
          folksAddress: fieldValues.folksAddress || null,
          folksGstin: fieldValues.folksGstin || null,
          invoiceNumber: fieldValues.invoiceNumber || null,
          upiId: fieldValues.upiId || null,
        },
        include: { uploadedBy: { select: { id: true, name: true, email: true } }, campaign: { select: { id: true, name: true } } },
      });

      res.status(201).json({
        message: 'Invoice uploaded and scanned',
        invoice,
        extractedText: extractedText.substring(0, 1000), // Preview of raw text
        isDuplicate: potentialDuplicates.length > 0,
        potentialMatches: potentialDuplicates,
      });
    } catch (error) {
      console.error('Invoice upload error:', error);
      res.status(500).json({ error: 'Failed to upload invoice' });
    }
  }
);

// ─── POST /create-folder – Create a physical folder in invoice-files ───
router.post(
  '/create-folder',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const { folderName } = req.body;
      if (!folderName || !folderName.trim()) {
        res.status(400).json({ error: 'Folder name is required' });
        return;
      }
      const sanitized = folderName.trim().replace(/[^a-zA-Z0-9\-_ ]/g, '');
      if (!sanitized) {
        res.status(400).json({ error: 'Invalid folder name' });
        return;
      }
      const folderPath = path.join(uploadsDir, sanitized);
      if (fs.existsSync(folderPath)) {
        res.status(409).json({ error: 'Folder already exists', folder: sanitized });
        return;
      }
      fs.mkdirSync(folderPath, { recursive: true });
      res.json({ message: 'Folder created', folder: sanitized });
    } catch (error) {
      console.error('Create folder error:', error);
      res.status(500).json({ error: 'Failed to create folder' });
    }
  }
);

// ─── DELETE /delete-folder – Delete a physical folder ─────────────────
router.delete(
  '/delete-folder',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const { folderName } = req.body;
      if (!folderName || !folderName.trim()) {
        res.status(400).json({ error: 'Folder name is required' });
        return;
      }
      const sanitized = folderName.trim();
      const folderPath = path.join(uploadsDir, sanitized);
      if (!fs.existsSync(folderPath)) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      // Move any files in this folder to Uncategorized
      const uncatPath = path.join(uploadsDir, 'Uncategorized');
      if (!fs.existsSync(uncatPath)) fs.mkdirSync(uncatPath, { recursive: true });

      const files = fs.readdirSync(folderPath);
      for (const file of files) {
        const src = path.join(folderPath, file);
        const dest = path.join(uncatPath, file);
        if (fs.statSync(src).isFile()) {
          fs.renameSync(src, dest);
        }
      }

      // Update database records
      await prisma.invoice.updateMany({
        where: { folder: sanitized },
        data: { folder: 'Uncategorized' },
      });

      // Remove the empty folder
      fs.rmdirSync(folderPath);

      res.json({ message: `Folder "${sanitized}" deleted. Files moved to Uncategorized.` });
    } catch (error) {
      console.error('Delete folder error:', error);
      res.status(500).json({ error: 'Failed to delete folder' });
    }
  }
);

// ─── GET /physical-folders – List physical folders in invoice-files ────
router.get(
  '/physical-folders',
  authenticate,
  attachUserRole,
  async (_req: RoleAuthRequest, res: Response) => {
    try {
      if (!fs.existsSync(uploadsDir)) {
        res.json([]);
        return;
      }
      const entries = fs.readdirSync(uploadsDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
      res.json(dirs);
    } catch (error) {
      console.error('List physical folders error:', error);
      res.status(500).json({ error: 'Failed to list folders' });
    }
  }
);

// ─── DELETE /clear-all – Delete all invoices (admin or own) ────────────
router.delete(
  '/clear-all',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const where: any = {};
      if (req.userRole !== 'ADMIN') {
        where.uploadedById = req.userId;
      }

      const invoices = await prisma.invoice.findMany({ where, select: { id: true, filePath: true } });

      // Delete files from disk
      for (const inv of invoices) {
        if (fs.existsSync(inv.filePath)) {
          try { fs.unlinkSync(inv.filePath); } catch (e) { /* ignore */ }
        }
      }

      // Delete from DB
      const result = await prisma.invoice.deleteMany({ where });

      res.json({ message: `Cleared ${result.count} invoice(s)`, count: result.count });
    } catch (error) {
      console.error('Clear all invoices error:', error);
      res.status(500).json({ error: 'Failed to clear invoices' });
    }
  }
);

// ─── PUT /:id/move-to-folder – Move invoice file to a folder ───────────
router.put(
  '/:id/move-to-folder',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const { folder } = req.body;
      if (!folder || !folder.trim()) {
        res.status(400).json({ error: 'Folder name is required' });
        return;
      }
      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }
      const sanitized = folder.trim().replace(/[^a-zA-Z0-9\-_ ]/g, '');
      const folderDir = path.join(uploadsDir, sanitized);
      if (!fs.existsSync(folderDir)) {
        fs.mkdirSync(folderDir, { recursive: true });
      }
      let newFilePath = invoice.filePath;
      if (fs.existsSync(invoice.filePath)) {
        const newPath = path.join(folderDir, invoice.fileName);
        fs.copyFileSync(invoice.filePath, newPath);
        fs.unlinkSync(invoice.filePath);
        newFilePath = newPath;
      }
      const updated = await prisma.invoice.update({
        where: { id },
        data: { folder: sanitized, filePath: newFilePath },
        include: { uploadedBy: { select: { id: true, name: true, email: true } }, campaign: { select: { id: true, name: true } } },
      });
      res.json({ message: 'Invoice moved to folder', invoice: updated });
    } catch (error) {
      console.error('Move to folder error:', error);
      res.status(500).json({ error: 'Failed to move invoice' });
    }
  }
);

// ─── PUT /:id/fields – Update scanned fields manually ──────────────────
router.put(
  '/:id/fields',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const updates = req.body;

      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      // Build update object from allowed fields
      const allowedFields = [
        'invoiceDate', 'campaignDetails', 'campaignAmount',
        'bankName', 'accountHolderName', 'accountNumber', 'ifscCode',
        'branchName', 'branchAddress', 'panCard', 'upiId',
        'creatorAddress', 'creatorGstin', 'folksAddress', 'folksGstin',
        'invoiceNumber', 'folder',
      ];
      // These fields live only in scanResults JSON (no dedicated DB column)
      const scanResultsOnlyFields = [
        'taxableAmount', 'cgst', 'sgst', 'igst', 'tds', 'netPayable',
        'hsnCode', 'placeOfSupply',
      ];

      console.log('[PUT /:id/fields] Received keys:', Object.keys(updates));

      const updateData: Record<string, any> = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      }

      // Also update scanResults if provided
      if (updates.scanResults) {
        updateData.scanResults = updates.scanResults;
      }

      // ── Sync scanResults JSON with edited field values ────────────
      // The frontend renders from scanResults, so we must mirror edits there
      const existingScanResults = (invoice.scanResults as Record<string, any>) || {};
      let scanResultsChanged = false;
      for (const field of allowedFields) {
        if (updates[field] !== undefined && existingScanResults[field]) {
          existingScanResults[field] = {
            ...existingScanResults[field],
            value: updates[field],
            detected: !!updates[field],
          };
          scanResultsChanged = true;
        } else if (updates[field] !== undefined && !existingScanResults[field]) {
          // Field wasn't in scanResults before — add it
          existingScanResults[field] = { value: updates[field], detected: !!updates[field] };
          scanResultsChanged = true;
        }
      }
      if (scanResultsChanged && !updates.scanResults) {
        updateData.scanResults = existingScanResults;
      }

      // ── Sync scanResults-only fields (no DB column) ────────────────
      for (const field of scanResultsOnlyFields) {
        if (updates[field] !== undefined) {
          existingScanResults[field] = {
            ...(existingScanResults[field] || {}),
            value: updates[field],
            detected: !!updates[field],
          };
          updateData.scanResults = existingScanResults;
        }
      }

      // ── Generic dynamic fields (extracted from invoice text, no DB column) ─
      const knownFields = new Set([...allowedFields, ...scanResultsOnlyFields, 'scanResults']);
      for (const [field, val] of Object.entries(updates)) {
        if (!knownFields.has(field) && typeof val === 'string') {
          existingScanResults[field] = {
            ...(existingScanResults[field] || {}),
            value: val,
            detected: !!val,
          };
          updateData.scanResults = existingScanResults;
        }
      }

      console.log('[PUT /:id/fields] Updating columns:', Object.keys(updateData).filter(k => k !== 'scanResults'));
      console.log('[PUT /:id/fields] ScanResults synced:', scanResultsChanged);

      // ── BOOSTING: Learn from date corrections ──────────────────────
      // If the user is changing invoiceDate, trigger the learning engine
      if (updates.invoiceDate && updates.invoiceDate !== invoice.invoiceDate) {
        try {
          await learnFromCorrection({
            invoiceId: id,
            extractedText: (invoice as any).extractedText || '',
            wrongValue: invoice.invoiceDate || null,
            correctValue: updates.invoiceDate,
          });
          console.log(`[DateBooster] Correction logged for invoice ${id}: "${invoice.invoiceDate}" → "${updates.invoiceDate}"`);
        } catch (boostErr) {
          console.error('[DateBooster] Failed to learn from correction:', boostErr);
          // Don't block the update — learning is best-effort
        }
      }

      // ── BOOSTING: Learn from ALL field corrections ─────────────────
      const boostableFields = [
        'campaignAmount', 'bankName', 'accountNumber', 'ifscCode',
        'branchName', 'panCard', 'accountHolderName', 'upiId',
        'creatorGstin', 'invoiceNumber',
      ];
      for (const field of boostableFields) {
        if (updates[field] && updates[field] !== (invoice as any)[field]) {
          try {
            await learnFieldCorrection({
              fieldName: field,
              invoiceId: id,
              extractedText: (invoice as any).extractedText || '',
              wrongValue: (invoice as any)[field] || null,
              correctValue: updates[field],
            });
            console.log(`[FieldBooster] Correction logged for ${field} on invoice ${id}`);
          } catch (boostErr) {
            console.error(`[FieldBooster] Failed to learn ${field} correction:`, boostErr);
          }
        }
      }

      const updated = await prisma.invoice.update({
        where: { id },
        data: updateData,
        include: { uploadedBy: { select: { id: true, name: true, email: true } }, campaign: { select: { id: true, name: true } } },
      });

      res.json({ message: 'Invoice fields updated', invoice: updated });
    } catch (error) {
      console.error('Update fields error:', error);
      res.status(500).json({ error: 'Failed to update invoice fields' });
    }
  }
);

// ─── PUT /:id/approve – Approve an invoice ─────────────────────────────
router.put(
  '/:id/approve',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const { folder } = req.body;

      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      // Move file to folder-organized directory if folder specified
      let newFilePath = invoice.filePath;
      if (folder) {
        const folderDir = path.join(uploadsDir, folder.replace(/[^a-zA-Z0-9\-_ ]/g, ''));
        if (!fs.existsSync(folderDir)) {
          fs.mkdirSync(folderDir, { recursive: true });
        }
        const newPath = path.join(folderDir, invoice.fileName);
        if (fs.existsSync(invoice.filePath)) {
          fs.copyFileSync(invoice.filePath, newPath);
          fs.unlinkSync(invoice.filePath);
          newFilePath = newPath;
        }
      }

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          status: 'APPROVED',
          folder: folder || invoice.folder,
          filePath: newFilePath,
        },
        include: { uploadedBy: { select: { id: true, name: true, email: true } }, campaign: { select: { id: true, name: true } } },
      });

      // ── BOOSTING: Positive reinforcement ───────────────────────────
      // If the date wasn't corrected (user approved as-is), confirm the pattern
      const patternId = (invoice as any).datePatternId as string | null;
      if (patternId) {
        try {
          await confirmPattern(patternId);
          console.log(`[DateBooster] Pattern confirmed on approve: ${patternId}`);
        } catch (boostErr) {
          console.error('[DateBooster] Failed to confirm pattern:', boostErr);
        }
      }

      // Also learn from any field corrections made via the booster
      if (invoice.extractedText) {
        try {
          await learnFieldCorrectionsOnApprove(invoice);
        } catch (fieldBoostErr) {
          console.error('[FieldBooster] Failed to learn on approve:', fieldBoostErr);
        }
      }

      res.json({ message: 'Invoice approved', invoice: updated });

      // Fire-and-forget: email + in-app notification
      (async () => {
        try {
          if (updated.uploadedBy?.email) {
            sendInvoiceApprovedEmail(
              updated.uploadedBy.email,
              updated.uploadedBy.name || 'User',
              updated.originalName,
              updated.folder
            ).catch(() => {});
          }
          const notif = await prisma.notification.create({
            data: {
              userId: updated.uploadedById,
              type: 'INVOICE_APPROVED',
              title: 'Invoice Approved',
              body: `Your invoice "${updated.originalName}" has been approved and saved to "${updated.folder}".`,
              entityType: 'invoice',
              entityId: updated.id,
            },
          });
          const io = req.app.get('io');
          io?.to(updated.uploadedById).emit(`notification:new:${updated.uploadedById}`, notif);
        } catch (_) {}
      })();
    } catch (error) {
      console.error('Approve error:', error);
      res.status(500).json({ error: 'Failed to approve invoice' });
    }
  }
);

// ─── PUT /:id/reject – Reject an invoice ───────────────────────────────
router.put(
  '/:id/reject',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;

      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      const updated = await prisma.invoice.update({
        where: { id },
        data: { status: 'REJECTED' },
        include: { uploadedBy: { select: { id: true, name: true, email: true } }, campaign: { select: { id: true, name: true } } },
      });

      res.json({ message: 'Invoice rejected', invoice: updated });

      // Fire-and-forget: email + in-app notification
      (async () => {
        try {
          if (updated.uploadedBy?.email) {
            sendInvoiceRejectedEmail(
              updated.uploadedBy.email,
              updated.uploadedBy.name || 'User',
              updated.originalName
            ).catch(() => {});
          }
          const notif = await prisma.notification.create({
            data: {
              userId: updated.uploadedById,
              type: 'INVOICE_REJECTED',
              title: 'Invoice Rejected',
              body: `Your invoice "${updated.originalName}" has been rejected. Please review and re-upload if needed.`,
              entityType: 'invoice',
              entityId: updated.id,
            },
          });
          const io = req.app.get('io');
          io?.to(updated.uploadedById).emit(`notification:new:${updated.uploadedById}`, notif);
        } catch (_) {}
      })();
    } catch (error) {
      console.error('Reject error:', error);
      res.status(500).json({ error: 'Failed to reject invoice' });
    }
  }
);

// ─── GET / – List all invoices ─────────────────────────────────────────
router.get(
  '/',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const { folder, status, type, campaignId } = req.query;

      const where: any = {};

      // Non-admins only see their own invoices
      if (req.userRole !== 'ADMIN') {
        where.uploadedById = req.userId;
      }

      if (folder && folder !== 'all') where.folder = folder as string;
      if (status) where.status = status as string;
      if (type) where.type = type as string;
      if (campaignId) where.campaignId = campaignId as string;

      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json(invoices);
    } catch (error) {
      console.error('List invoices error:', error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  }
);

// ─── GET /folders – Get distinct folder names ──────────────────────────
router.get(
  '/folders',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const where: any = {};
      if (req.userRole !== 'ADMIN') {
        where.uploadedById = req.userId;
      }

      const invoices = await prisma.invoice.findMany({
        where,
        select: { folder: true },
        distinct: ['folder'],
        orderBy: { folder: 'asc' },
      });

      const folders = invoices.map((i) => i.folder);
      res.json(folders);
    } catch (error) {
      console.error('Get folders error:', error);
      res.status(500).json({ error: 'Failed to fetch folders' });
    }
  }
);

// ─── GET /boosting/stats – Boosting system statistics (admin only) ─────
router.get(
  '/boosting/stats',
  authenticate,
  attachUserRole,
  requireRole('ADMIN'),
  async (_req: RoleAuthRequest, res: Response) => {
    try {
      const stats = await getBoostingStats();
      res.json({
        message: 'Boosting system statistics',
        ...stats,
        builtinDatePatterns: 12, // number of built-in weak learners in dateBooster
      });
    } catch (error) {
      console.error('Boosting stats error:', error);
      res.status(500).json({ error: 'Failed to fetch boosting stats' });
    }
  }
);

// ─── GET /:id – Get single invoice detail ──────────────────────────────
router.get(
  '/:id',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;

      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
          campaign: { select: { id: true, name: true } },
        },
      });

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      // Non-admins can only see their own
      if (req.userRole !== 'ADMIN' && invoice.uploadedById !== req.userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json(invoice);
    } catch (error) {
      console.error('Get invoice error:', error);
      res.status(500).json({ error: 'Failed to fetch invoice' });
    }
  }
);

// ─── DELETE /:id – Delete an invoice ───────────────────────────────────
router.delete(
  '/:id',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;

      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      // Admin, heads (AGENCY), creators (EMPLOYEE), and uploader can delete
      if (req.userRole !== 'ADMIN' && req.userRole !== 'AGENCY' && req.userRole !== 'EMPLOYEE' && invoice.uploadedById !== req.userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Delete file from disk
      if (fs.existsSync(invoice.filePath)) {
        fs.unlinkSync(invoice.filePath);
      }

      await prisma.invoice.delete({ where: { id } });

      res.json({ message: 'Invoice deleted' });
    } catch (error) {
      console.error('Delete invoice error:', error);
      res.status(500).json({ error: 'Failed to delete invoice' });
    }
  }
);

// ─── GET /:id/download – Download original file ───────────────────────
router.get(
  '/:id/download',
  authenticate,
  attachUserRole,
  async (req: RoleAuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;

      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      if (req.userRole !== 'ADMIN' && invoice.uploadedById !== req.userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      if (!fs.existsSync(invoice.filePath)) {
        res.status(404).json({ error: 'File not found on disk' });
        return;
      }

      res.download(invoice.filePath, invoice.originalName);
    } catch (error) {
      console.error('Download error:', error);
      res.status(500).json({ error: 'Failed to download invoice' });
    }
  }
);

// ─── Inline view (token via query param for browser tab opening) ───────
router.get(
  '/:id/view',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const queryToken = req.query.token as string | undefined;

      // Accept token from query param OR Authorization header
      let userId: string | null = null;
      let userRole: string | null = null;
      const rawToken = queryToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      if (rawToken) {
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(rawToken, process.env.JWT_SECRET!) as { userId: string };
          const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, role: true } });
          userId = user?.id ?? null;
          userRole = user?.role ?? null;
        } catch { /* invalid token */ }
      }

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      if (userRole !== 'ADMIN' && invoice.uploadedById !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      if (!invoice.filePath || !fs.existsSync(invoice.filePath)) {
        res.status(404).json({ error: 'File not found on disk' });
        return;
      }

      const mime = invoice.mimeType || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `inline; filename="${invoice.originalName || invoice.fileName}"`);
      res.sendFile(path.resolve(invoice.filePath));
    } catch (error) {
      console.error('View error:', error);
      res.status(500).json({ error: 'Failed to view invoice' });
    }
  }
);

// ─── GET /:id/scan – Re-scan an existing invoice and return extracted fields ──
router.get(
  '/:id/scan',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const invoice = await prisma.invoice.findUnique({ where: { id } });

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      if (!invoice.filePath || !fs.existsSync(invoice.filePath)) {
        res.status(404).json({ error: 'Invoice file not found on disk' });
        return;
      }

      const ext = path.extname(invoice.filePath).toLowerCase();
      if (!['.pdf', '.doc', '.docx'].includes(ext)) {
        res.json({ fields: {}, rawText: '', message: 'Image files cannot be scanned for text' });
        return;
      }

      const rawText = await extractText(invoice.filePath);
      if (!rawText.trim()) {
        res.json({ fields: {}, rawText: '', message: 'No text could be extracted from this file' });
        return;
      }

      const detection: DetectionResult =
        invoice.type === 'GST'
          ? await detectGSTFields(rawText)
          : await detectNonGSTFields(rawText);

      // Return full fields (detected + not-detected) matching Invoice tab format
      const fields: Record<string, { detected: boolean; value: string }> = {};
      for (const [key, result] of Object.entries(detection.fields)) {
        if (INTERNAL_SCAN_KEYS.has(key)) continue;
        fields[key] = { detected: result.detected, value: result.value };
      }

      res.json({ fields, rawText: rawText.substring(0, 2000), invoiceType: invoice.type || 'NON_GST' });
    } catch (error) {
      console.error('Scan error:', error);
      res.status(500).json({ error: 'Failed to scan invoice' });
    }
  }
);

export default router;
