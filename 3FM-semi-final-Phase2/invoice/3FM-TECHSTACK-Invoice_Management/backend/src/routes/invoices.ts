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

// pdf-parse v2+ exports a PDFParse class (not a default function)
const { PDFParse } = require('pdf-parse');

const router = Router();
const prisma = new PrismaClient();

// ─── Upload directory setup ────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads/invoice-files');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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
  return result.text;
}

async function extractTextFromWord(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractTextFromPDF(filePath);
  if (ext === '.doc' || ext === '.docx') return extractTextFromWord(filePath);
  // For images we return empty – image OCR can be added later
  return '';
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
      /(?:account|a\/c)\s*(?:no|number|num|#)?\s*[:\-]?\s*(\d{6,18})/i),
    detectFieldBoosted('ifscCode', t,
      /(?:ifsc|ifc)\s*(?:code)?\s*[:\-]?\s*([A-Z]{4}0[A-Z0-9]{6})/i),
  ]);

  // Standalone fallbacks for PDF table extraction issues
  const standaloneIfsc = ifscResult.detected ? ifscResult : detectStandaloneIFSC(t, text);
  const standaloneAccount = accountResult.detected ? accountResult : detectStandaloneAccountNumber(t, text);

  return {
    fields: {
      bankName: { value: bankResult.value, detected: bankResult.detected },
      accountHolderName: detect(t, /(?:account\s*(?:holder|name)|a\/c\s*(?:holder|name)|beneficiary)\s*(?:name)?\s*[:\-]?\s*([A-Za-z.]+(?:\s+[A-Za-z.]+)*?)(?=\s+(?:Bank|IFSC|UPI|Account|A\/c|Email|PAN|Phone|Mobile|Address|\d)|$)/i),
      accountNumber: { value: standaloneAccount.value, detected: standaloneAccount.detected },
      ifscCode: { value: standaloneIfsc.value, detected: standaloneIfsc.detected },
      branchName: detect(t, /branch\s*(?:name)?\s*[:\-]?\s*([A-Za-z\s,.\-]+)/i),
      panCard: detectPAN(t),
      signature: detectPresence(t, /sign(?:ature|ed)|authorized|authorised|\bfor\s+\(?[A-Za-z][A-Za-z\s]*\)?/i, 'signature'),
      invoiceDate: { value: dateResult.value, detected: dateResult.detected },
      campaignDetails: detectCampaignDetails(t),
      campaignAmount: { value: amountResult.value, detected: amountResult.detected },
    },
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
      /(?:account|a\/c)\s*(?:no|number|num|#)?\s*[:\-]?\s*(\d{6,18})/i),
    detectFieldBoosted('ifscCode', t,
      /(?:ifsc|ifc)\s*(?:code)?\s*[:\-]?\s*([A-Z]{4}0[A-Z0-9]{6})/i),
    detectFieldBoosted('creatorGstin', t,
      /(?:gstin|gst\s*(?:no|number|in))\s*[:\-]?\s*(\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d])/i),
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
  const paymentAccountNum = detectPaymentTableField(t, /(?:account|a\/c)\s*(?:no|number|num|#)?\s*[:\-]?\s*(\d{6,18})/i);
  const paymentIfsc = detectPaymentTableField(t, /(?:ifsc|ifc)\s*(?:code)?\s*[:\-]?\s*([A-Z]{4}0[A-Z0-9]{6})/i);

  // ── Standalone fallbacks for when PDF extracts table columns separately ──
  const standaloneIfsc = detectStandaloneIFSC(t, text);
  const standaloneAccount = detectStandaloneAccountNumber(t, text);
  const standaloneBankName = detectStandaloneBankName(t);

  // Pick the best result for each field: boosted > payment table > standalone
  const bestIfsc = ifscResult.detected ? ifscResult
    : paymentIfsc.detected ? paymentIfsc
    : standaloneIfsc;
  const bestAccount = accountResult.detected ? accountResult
    : paymentAccountNum.detected ? paymentAccountNum
    : standaloneAccount;
  const bestBank = bankResult.detected ? bankResult
    : paymentBankName.detected ? paymentBankName
    : standaloneBankName;

  return {
    fields: {
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
        return d.detected ? d : paymentBranchName;
      })(),
      branchAddress: (() => {
        const d = detect(t, /branch\s*(?:address)\s*[:\-]?\s*(.{10,200}?)(?=\s+(?:account|a\/c|ifsc|pan|sign|$))/i);
        return d.detected ? d : paymentBranchAddress;
      })(),
      accountHolderName: (() => {
        const d = detect(t, /(?:account\s*(?:holder|name)|a\/c\s*(?:holder|name)|beneficiary)\s*(?:name)?\s*[:\-]?\s*([A-Za-z.]+(?:\s+[A-Za-z.]+)*?)(?=\s+(?:Bank|IFSC|UPI|Account|A\/c|Email|PAN|Phone|Mobile|Address|\d)|$)/i);
        return d.detected ? d : paymentAccountHolder;
      })(),
      accountNumber: { value: bestAccount.value, detected: bestAccount.detected },
      ifscCode: { value: bestIfsc.value, detected: bestIfsc.detected },
      signature: detectPresence(t, /sign(?:ature|ed)|authorized|authorised|\bfor\s+\(?[A-Za-z][A-Za-z\s]*\)?/i, 'signature'),
    },
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
  const paymentSection = text.match(/payment\s*details\s*(.{10,800}?)(?=\s*(?:sign(?:ature|ed)|authorized|authorised|declaration|terms|note|\*|$))/is);
  if (paymentSection && paymentSection[1]) {
    const m = paymentSection[1].match(regex);
    if (m && m[1]) return { value: m[1].trim(), detected: true };
  }
  // Fallback: try against full text
  const m = text.match(regex);
  return { value: m ? m[1].trim() : '', detected: !!m };
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
    const matches = [...searchText.matchAll(/\b([A-Z]{4}0[A-Z0-9]{6})\b/gi)];
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
    'HDFC BANK', 'ICICI BANK', 'STATE BANK OF INDIA', 'SBI',
    'AXIS BANK', 'KOTAK MAHINDRA BANK', 'YES BANK', 'IDBI BANK',
    'PUNJAB NATIONAL BANK', 'PNB', 'BANK OF BARODA', 'BOB',
    'CANARA BANK', 'UNION BANK OF INDIA', 'CENTRAL BANK OF INDIA',
    'INDIAN BANK', 'BANK OF INDIA', 'BOI', 'INDIAN OVERSEAS BANK',
    'UCO BANK', 'FEDERAL BANK', 'SOUTH INDIAN BANK', 'KARUR VYSYA BANK',
    'BANDHAN BANK', 'IDFC FIRST BANK', 'RBL BANK', 'INDUSIND BANK',
    'CITY UNION BANK', 'KARNATAKA BANK', 'DCB BANK', 'UJJIVAN',
    'AU SMALL FINANCE BANK', 'EQUITAS', 'JANA SMALL FINANCE', 'DBS BANK',
  ];
  const upper = text.toUpperCase();
  for (const bank of bankNames) {
    if (upper.includes(bank)) {
      return { value: bank.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' ').replace(/\bOf\b/g, 'of').replace(/\bAnd\b/g, 'and'), detected: true };
    }
  }
  return { value: '', detected: false };
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
        },
        include: { uploadedBy: { select: { id: true, name: true, email: true } }, campaign: { select: { id: true, name: true } } },
      });

      res.status(201).json({
        message: 'Invoice uploaded and scanned',
        invoice,
        extractedText: extractedText.substring(0, 1000), // Preview of raw text
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
        'branchName', 'branchAddress', 'panCard',
        'creatorAddress', 'creatorGstin', 'folksAddress', 'folksGstin',
        'invoiceNumber', 'folder',
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
        'branchName', 'panCard', 'accountHolderName',
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

      // Only admin or uploader can delete
      if (req.userRole !== 'ADMIN' && invoice.uploadedById !== req.userId) {
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

export default router;
