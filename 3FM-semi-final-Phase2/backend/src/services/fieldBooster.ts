/**
 * ══════════════════════════════════════════════════════════════════════
 *  fieldBooster.ts — Self-learning boosting engine for ALL invoice fields
 * ══════════════════════════════════════════════════════════════════════
 *
 * Extends the dateBooster concept to every scannable field:
 *   - campaignAmount, bankName, accountNumber, ifscCode, etc.
 *
 * How it works:
 *   1. When a user corrects any field, the system analyses the OCR text
 *      to discover what label/format was used for the correct value.
 *   2. A new regex pattern is learned and stored in FieldPatternCorrection.
 *   3. On future scans, learned patterns are tried alongside built-in ones,
 *      and the best match (highest weighted score) wins.
 *   4. Patterns that keep getting confirmed gain weight; wrong ones lose it.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Types ─────────────────────────────────────────────────────────────
export interface FieldCandidate {
  value: string;
  patternId: string;
  confidence: number;
  weight: number;
  score: number;
}

export interface BoostedFieldResult {
  value: string;
  detected: boolean;
  patternId: string;
  candidates: FieldCandidate[];
}

// ─── Label hints per field (common labels seen on Indian invoices) ─────
const FIELD_LABEL_HINTS: Record<string, string[]> = {
  campaignAmount: [
    'total', 'amount', 'grand total', 'net amount', 'net payable',
    'payable amount', 'final amount', 'invoice amount', 'bill amount',
    'total amount', 'total payable', 'gross amount',
  ],
  bankName: [
    'bank name', 'bank', 'banker',
  ],
  accountNumber: [
    'account', 'a/c', 'account no', 'account number', 'a/c no',
    'bank account', 'saving account',
  ],
  ifscCode: [
    'ifsc', 'ifsc code', 'ifc code', 'rtgs/neft',
  ],
  branchName: [
    'branch', 'branch name', 'branch office',
  ],
  panCard: [
    'pan', 'pan card', 'pan no', 'permanent account',
  ],
  invoiceNumber: [
    'invoice no', 'invoice number', 'inv no', 'bill no', 'bill number',
  ],
  creatorGstin: [
    'gstin', 'gst no', 'gst number', 'gst in',
  ],
  accountHolderName: [
    'account holder', 'a/c holder', 'beneficiary', 'beneficiary name',
    'payee', 'payee name', 'name of payee', 'in favour of', 'in favor of',
    'pay to', 'payment to', 'receiver', 'receiver name', 'recipient name',
  ],
  upiId: [
    'upi', 'upi id', 'upi no', 'upi address', 'upi handle',
    'virtual payment address', 'vpa', 'gpay', 'phonepe', 'upi/neft',
  ],
};

// ─── Value format patterns per field (for building learned regex) ──────
const VALUE_PATTERNS: Record<string, string> = {
  campaignAmount: '(?:Rs\\.?|INR|₹)?\\s*([\\d,]{2,}\\.?\\d*)',
  bankName: '([A-Za-z\\s&]+(?:bank|ltd|limited))',
  accountNumber: '(\\d{6,18})',
  ifscCode: '([A-Z]{4}0[A-Z0-9]{6})',
  branchName: '([A-Za-z\\s,.\\-]+)',
  panCard: '([A-Z]{5}\\d{4}[A-Z])',
  invoiceNumber: '([A-Za-z0-9\\-\\/.]+)',
  creatorGstin: '(\\d{2}[A-Z]{5}\\d{4}[A-Z]\\d[Z][A-Z\\d])',
  accountHolderName: '([A-Za-z.]+(?:\\s+[A-Za-z.]+)*)',
  upiId: '([a-zA-Z0-9.\\-_+]{2,50}@[a-zA-Z]{2,30})',
};

// ─── Boost detection for any field ─────────────────────────────────────
/**
 * Try learned patterns from DB alongside a built-in regex for a given field.
 * Returns the best candidate by weighted score.
 */
export async function detectFieldBoosted(
  fieldName: string,
  text: string,
  builtinRegex: RegExp,
  builtinCaptureGroup: number = 1,
  builtinConfidence: number = 0.80,
): Promise<BoostedFieldResult> {
  const t = text.replace(/\s+/g, ' ');
  const candidates: FieldCandidate[] = [];

  // 1. Load learned patterns and correction history from DB
  let learnedPatterns: { id: string; regex: string; weight: number }[] = [];
  let wrongValuePenalties: Record<string, number> = {};
  let correctValueRewards: Record<string, number> = {};

  try {
    const corrections = await prisma.fieldPatternCorrection.findMany({
      where: { fieldName },
    });

    for (const c of corrections) {
      if (c.learnedPattern) {
        learnedPatterns.push({
          id: `field-learned-${c.id}`,
          regex: c.learnedPattern,
          weight: c.weight,
        });
      }
      if (c.wrongValue) {
        wrongValuePenalties[c.wrongValue] = (wrongValuePenalties[c.wrongValue] || 0) + c.hitCount;
      }
      correctValueRewards[c.correctValue] = (correctValueRewards[c.correctValue] || 0) + c.hitCount;
    }
  } catch {
    // DB not ready — fall back silently
  }

  // 2. Run built-in regex
  const builtinMatch = t.match(builtinRegex);
  if (builtinMatch && builtinMatch[builtinCaptureGroup]) {
    const value = builtinMatch[builtinCaptureGroup].trim();
    let weight = 1.0;

    // Penalise if this value was corrected away before
    if (wrongValuePenalties[value]) {
      weight = Math.max(0.2, 1.0 - wrongValuePenalties[value] * 0.15);
    }

    // Reward if this value was confirmed correct before
    if (correctValueRewards[value]) {
      weight = Math.min(2.0, weight + correctValueRewards[value] * 0.1);
    }

    candidates.push({
      value,
      patternId: `builtin-${fieldName}`,
      confidence: builtinConfidence,
      weight,
      score: builtinConfidence * weight,
    });
  }

  // 3. Run learned patterns
  for (const lp of learnedPatterns) {
    try {
      const rx = new RegExp(lp.regex, 'i');
      const m = t.match(rx);
      if (m && m[1]) {
        const value = m[1].trim();
        candidates.push({
          value,
          patternId: lp.id,
          confidence: 0.85,
          weight: lp.weight,
          score: 0.85 * lp.weight,
        });
      }
    } catch {
      // Invalid regex in DB — skip
    }
  }

  // 4. Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length > 0) {
    return {
      value: candidates[0].value,
      detected: true,
      patternId: candidates[0].patternId,
      candidates,
    };
  }

  return { value: '', detected: false, patternId: '', candidates: [] };
}

// ─── Learn from a user correction on any field ─────────────────────────
export async function learnFieldCorrection(params: {
  fieldName: string;
  invoiceId: string;
  extractedText: string;
  wrongValue: string | null;
  correctValue: string;
}): Promise<void> {
  const { fieldName, invoiceId, extractedText, wrongValue, correctValue } = params;
  const t = extractedText.replace(/\s+/g, ' ');

  let learnedLabel: string | null = null;
  let learnedPattern: string | null = null;

  // Try to find the correct value in the text and learn the label before it
  const escaped = correctValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexEscaped = escaped.replace(/\s+/g, '\\s+');

  // Look for a label prefix before the correct value
  const contextRx = new RegExp(`([A-Za-z][A-Za-z./\\s]{0,30}?)[:\\-]?\\s*${flexEscaped}`, 'i');
  const contextMatch = t.match(contextRx);

  if (contextMatch && contextMatch[1]) {
    const rawLabel = contextMatch[1].trim();

    // Check if this looks like a genuine label (not just random text)
    const hints = FIELD_LABEL_HINTS[fieldName] || [];
    const looksLikeLabel = rawLabel.length >= 2 && rawLabel.length <= 30 && (
      hints.some(h => rawLabel.toLowerCase().includes(h)) ||
      /name|no|number|code|amount|total|bank|account|branch|pan|gst|invoice|bill/i.test(rawLabel)
    );

    if (looksLikeLabel) {
      learnedLabel = rawLabel;
      const labelEscaped = rawLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const valuePattern = VALUE_PATTERNS[fieldName] || '(.+?)';
      learnedPattern = `${labelEscaped}\\s*[:\\-]?\\s*${valuePattern}`;
    }
  }

  // Fallback: search for value in text and learn surrounding context
  if (!learnedPattern) {
    const idx = t.indexOf(correctValue);
    if (idx >= 0) {
      const before = t.substring(Math.max(0, idx - 40), idx).trim();
      const labelMatch = before.match(/([A-Za-z][A-Za-z.\s]{1,25}?)\s*[:\-]?\s*$/);
      if (labelMatch) {
        learnedLabel = labelMatch[1].trim();
        const labelEscaped = learnedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const valuePattern = VALUE_PATTERNS[fieldName] || '(.+?)';
        learnedPattern = `${labelEscaped}\\s*[:\\-]?\\s*${valuePattern}`;
      }
    }
  }

  // Check for existing identical correction
  const existing = await prisma.fieldPatternCorrection.findFirst({
    where: {
      fieldName,
      learnedPattern,
      correctValue,
    },
  });

  if (existing) {
    // Boost weight — this correction is confirmed again
    await prisma.fieldPatternCorrection.update({
      where: { id: existing.id },
      data: {
        weight: existing.weight + 0.2,
        hitCount: existing.hitCount + 1,
      },
    });
  } else {
    // Store new correction
    const idx = t.indexOf(correctValue);
    const ocrContext = idx >= 0
      ? t.substring(Math.max(0, idx - 50), Math.min(t.length, idx + correctValue.length + 50))
      : correctValue;

    await prisma.fieldPatternCorrection.create({
      data: {
        fieldName,
        ocrContext,
        extractedText: extractedText.substring(0, 2000),
        wrongValue: wrongValue || null,
        correctValue,
        learnedLabel,
        learnedPattern,
        weight: 1.0,
        hitCount: 1,
        invoiceId,
      },
    });
  }

  console.log(`[FieldBooster] Learned ${fieldName} correction: "${wrongValue}" → "${correctValue}"${learnedPattern ? ` pattern: ${learnedPattern}` : ''}`);
}

// ─── Confirm a learned field pattern (positive reinforcement) ──────────
export async function confirmFieldPattern(patternId: string): Promise<void> {
  if (!patternId.startsWith('field-learned-')) return;
  const dbId = patternId.replace('field-learned-', '');
  try {
    const record = await prisma.fieldPatternCorrection.findUnique({ where: { id: dbId } });
    if (record) {
      await prisma.fieldPatternCorrection.update({
        where: { id: dbId },
        data: {
          weight: record.weight + 0.1,
          hitCount: record.hitCount + 1,
        },
      });
    }
  } catch {
    // Silently ignore
  }
}

// ─── Get boosting statistics ───────────────────────────────────────────
export async function getBoostingStats(): Promise<{
  datePatterns: { total: number; learned: number; totalCorrections: number };
  fieldPatterns: Record<string, { total: number; learned: number; totalCorrections: number }>;
  recentCorrections: Array<{
    fieldName: string;
    wrongValue: string | null;
    correctValue: string;
    createdAt: Date;
  }>;
}> {
  const dateCorrections = await prisma.datePatternCorrection.findMany();
  const fieldCorrections = await prisma.fieldPatternCorrection.findMany();
  const recentDate = await prisma.datePatternCorrection.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { wrongValue: true, correctValue: true, createdAt: true },
  });
  const recentField = await prisma.fieldPatternCorrection.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { fieldName: true, wrongValue: true, correctValue: true, createdAt: true },
  });

  // Date stats
  const dateStats = {
    total: dateCorrections.length,
    learned: dateCorrections.filter((c: any) => c.learnedPattern).length,
    totalCorrections: dateCorrections.reduce((sum: number, c: any) => sum + c.hitCount, 0),
  };

  // Field stats grouped by field name
  const fieldStats: Record<string, { total: number; learned: number; totalCorrections: number }> = {};
  for (const c of fieldCorrections) {
    if (!fieldStats[c.fieldName]) {
      fieldStats[c.fieldName] = { total: 0, learned: 0, totalCorrections: 0 };
    }
    fieldStats[c.fieldName].total++;
    if (c.learnedPattern) fieldStats[c.fieldName].learned++;
    fieldStats[c.fieldName].totalCorrections += c.hitCount;
  }

  // Merge recent corrections
  const recentCorrections = [
    ...recentDate.map((d: any) => ({
      fieldName: 'invoiceDate' as string,
      wrongValue: d.wrongValue as string | null,
      correctValue: d.correctValue as string,
      createdAt: d.createdAt as Date,
    })),
    ...recentField.map((f: any) => ({
      fieldName: f.fieldName as string,
      wrongValue: f.wrongValue as string | null,
      correctValue: f.correctValue as string,
      createdAt: f.createdAt as Date,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 15);

  return {
    datePatterns: dateStats,
    fieldPatterns: fieldStats,
    recentCorrections,
  };
}
