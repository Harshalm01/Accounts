/**
 * ══════════════════════════════════════════════════════════════════════
 *  dateBooster.ts — Self-learning boosting engine for invoice dates
 * ══════════════════════════════════════════════════════════════════════
 *
 * How it works (Boosting approach):
 *
 *  1. Multiple "weak learner" regex patterns each try to extract a date.
 *  2. Each pattern has a WEIGHT (confidence). Patterns that are confirmed
 *     by users gain weight; patterns that produce wrong results lose weight.
 *  3. The system picks the candidate with the highest weighted confidence.
 *  4. When a user CORRECTS a date, the system:
 *       a) Penalises the pattern that got it wrong (weight down)
 *       b) Analyses the OCR text around the correct date to discover
 *          what label/format was present
 *       c) If a new pattern is found, it's stored in DB and used for
 *          all future invoices
 *  5. Over time, the system gets smarter — like boosting.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Types ─────────────────────────────────────────────────────────────
export interface DateCandidate {
  value: string;          // extracted raw date string
  patternId: string;      // identifier for which pattern matched
  confidence: number;     // base confidence (0-1)
  weight: number;         // boosted weight from learning
  score: number;          // confidence × weight — used for ranking
}

interface PatternDef {
  id: string;
  label: string;          // human-readable description
  regex: RegExp;
  captureGroup: number;   // which group holds the date
  postProcess?: (raw: string) => string;
  baseConfidence: number; // 0-1, how reliable this pattern inherently is
}

// ─── Month helper ──────────────────────────────────────────────────────
const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

// ─── Label prefixes (common on Indian invoices) ────────────────────────
// Matches: Invoice Date, Inv. Date, Bill Date, Date of Invoice, Dated, Date, Dt., Dt
const LABEL = `(?:(?:invoice|inv\\.?|bill|billing)\\s+)?(?:date(?:\\s*of\\s*invoice)?|date)[d]?|dt\\.?`;
const LABEL_PREFIX = `(?:${LABEL})\\s*[:\\-]?\\s*`;

function cleanDate(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim();
}

function appendYear(raw: string): string {
  return cleanDate(raw) + ' ' + new Date().getFullYear();
}

// ─── Built-in weak learners (static patterns) ──────────────────────────
const numSep = `[\\/.\\\\-]`;

const BUILTIN_PATTERNS: PatternDef[] = [
  // ── Labeled numeric: Date: 08/12/2025 ──
  {
    id: 'labeled-numeric',
    label: 'Labeled DD/MM/YYYY',
    regex: new RegExp(`${LABEL_PREFIX}(\\d{1,2}${numSep}\\d{1,2}${numSep}\\d{2,4})`, 'i'),
    captureGroup: 1,
    postProcess: cleanDate,
    baseConfidence: 0.95,
  },
  // ── Standalone numeric: 08/12/2025 ──
  {
    id: 'standalone-numeric',
    label: 'Standalone DD/MM/YYYY',
    regex: new RegExp(`(?:^|\\s)(\\d{1,2}${numSep}\\d{1,2}${numSep}\\d{2,4})(?:\\s|$)`, 'im'),
    captureGroup: 1,
    postProcess: cleanDate,
    baseConfidence: 0.60,
  },
  // ── Labeled day-first named: Date: 08 DEC 2025, 08 DEC -2025, 8th Dec 2025 ──
  {
    id: 'labeled-day-month-year',
    label: 'Labeled DD Mon YYYY',
    regex: new RegExp(`${LABEL_PREFIX}(\\d{1,2}(?:st|nd|rd|th)?\\s*[\\/.\\-]?\\s*(?:${MONTHS})[,.]?\\s*[\\/.\\-]?\\s*\\d{2,4})`, 'i'),
    captureGroup: 1,
    postProcess: cleanDate,
    baseConfidence: 0.95,
  },
  // ── Standalone day-first named: 08 DEC 2025 ──
  {
    id: 'standalone-day-month-year',
    label: 'Standalone DD Mon YYYY',
    regex: new RegExp(`(?:^|\\s)(\\d{1,2}(?:st|nd|rd|th)?\\s*[\\/.\\-]?\\s*(?:${MONTHS})[,.]?\\s*[\\/.\\-]?\\s*\\d{2,4})(?:\\s|$)`, 'im'),
    captureGroup: 1,
    postProcess: cleanDate,
    baseConfidence: 0.60,
  },
  // ── Labeled month-first: Date: Dec 08, 2025 ──
  {
    id: 'labeled-month-day-year',
    label: 'Labeled Mon DD, YYYY',
    regex: new RegExp(`${LABEL_PREFIX}((?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?[,.]?\\s+\\d{2,4})`, 'i'),
    captureGroup: 1,
    postProcess: cleanDate,
    baseConfidence: 0.90,
  },
  // ── Standalone month-first: December 08 2025 ──
  {
    id: 'standalone-month-day-year',
    label: 'Standalone Mon DD YYYY',
    regex: new RegExp(`(?:^|\\s)((?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?[,.]?\\s+\\d{2,4})(?:\\s|$)`, 'im'),
    captureGroup: 1,
    postProcess: cleanDate,
    baseConfidence: 0.55,
  },
  // ── Labeled ISO: Date: 2025-12-08 ──
  {
    id: 'labeled-iso',
    label: 'Labeled YYYY-MM-DD',
    regex: new RegExp(`${LABEL_PREFIX}(\\d{4}-\\d{1,2}-\\d{1,2})`, 'i'),
    captureGroup: 1,
    postProcess: cleanDate,
    baseConfidence: 0.90,
  },
  // ── Standalone ISO: 2025-12-08 ──
  {
    id: 'standalone-iso',
    label: 'Standalone YYYY-MM-DD',
    regex: new RegExp(`(?:^|\\s)(\\d{4}-\\d{1,2}-\\d{1,2})(?:\\s|$)`, 'im'),
    captureGroup: 1,
    postProcess: cleanDate,
    baseConfidence: 0.50,
  },
  // ── Day+Month only (no year) with label: Date: 1 January ──
  {
    id: 'labeled-day-month-noyear',
    label: 'Labeled DD Mon (no year)',
    regex: new RegExp(`${LABEL_PREFIX}(\\d{1,2}(?:st|nd|rd|th)?\\s*[\\/.\\-]?\\s*(?:${MONTHS}))(?:\\s|,|$)`, 'i'),
    captureGroup: 1,
    postProcess: appendYear,
    baseConfidence: 0.80,
  },
  // ── Standalone day+month: 1 January ──
  {
    id: 'standalone-day-month-noyear',
    label: 'Standalone DD Mon (no year)',
    regex: new RegExp(`(?:^|\\s)(\\d{1,2}(?:st|nd|rd|th)?\\s*[\\/.\\-]?\\s*(?:${MONTHS}))\\s*$`, 'im'),
    captureGroup: 1,
    postProcess: appendYear,
    baseConfidence: 0.45,
  },
  // ── Month+Day only (no year) with label: Date: January 1 ──
  {
    id: 'labeled-month-day-noyear',
    label: 'Labeled Mon DD (no year)',
    regex: new RegExp(`${LABEL_PREFIX}((?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?)(?:\\s|,|$)`, 'i'),
    captureGroup: 1,
    postProcess: appendYear,
    baseConfidence: 0.75,
  },
  // ── Standalone month+day: January 1 ──
  {
    id: 'standalone-month-day-noyear',
    label: 'Standalone Mon DD (no year)',
    regex: new RegExp(`(?:^|\\s)((?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?)\\s*$`, 'im'),
    captureGroup: 1,
    postProcess: appendYear,
    baseConfidence: 0.40,
  },
];

// ─── Run all weak learners and pick the best candidate ─────────────────
export async function detectDateBoosted(text: string): Promise<{
  value: string;
  detected: boolean;
  patternId: string;
  candidates: DateCandidate[];
}> {
  const t = text.replace(/\s+/g, ' ');
  const candidates: DateCandidate[] = [];

  // 1. Load learned weights from DB (pattern corrections)
  let learnedWeights: Record<string, number> = {};
  let learnedPatterns: { id: string; regex: string; weight: number }[] = [];
  try {
    const corrections = await prisma.datePatternCorrection.findMany();

    // Build weight adjustments for built-in patterns from corrections
    // Track which wrong values came from which patterns so we can penalise
    const wrongValueCounts: Record<string, number> = {};
    const correctValueCounts: Record<string, number> = {};

    for (const c of corrections) {
      if (c.learnedPattern && c.learnedLabel) {
        learnedPatterns.push({
          id: `learned-${c.id}`,
          regex: c.learnedPattern,
          weight: c.weight,
        });
      }

      // Track wrong values for penalisation
      if (c.wrongValue) {
        wrongValueCounts[c.wrongValue] = (wrongValueCounts[c.wrongValue] || 0) + c.hitCount;
      }
      // Track correct values for reinforcement
      correctValueCounts[c.correctValue] = (correctValueCounts[c.correctValue] || 0) + c.hitCount;
    }

    // Run each built-in pattern against the text and penalise/reward based on history
    // If a built-in pattern extracts a value that has been frequently WRONG in past
    // corrections, its weight goes down. If it extracts values that match known
    // correct values, its weight goes up slightly.
    for (const pat of BUILTIN_PATTERNS) {
      const m = t.match(pat.regex);
      if (m && m[pat.captureGroup]) {
        const extractedValue = pat.postProcess
          ? pat.postProcess(m[pat.captureGroup])
          : cleanDate(m[pat.captureGroup]);

        let weightAdj = 1.0;

        // Penalise: if this exact value was corrected away from before
        if (wrongValueCounts[extractedValue]) {
          // Each past wrong hit subtracts 0.15 (clamped at 0.2 minimum)
          weightAdj = Math.max(0.2, 1.0 - wrongValueCounts[extractedValue] * 0.15);
        }

        // Reward: if this exact value was the correct answer before
        if (correctValueCounts[extractedValue]) {
          weightAdj = Math.min(2.0, weightAdj + correctValueCounts[extractedValue] * 0.1);
        }

        learnedWeights[pat.id] = weightAdj;
      }
    }
  } catch (e) {
    // DB not ready or table doesn't exist yet — fall back silently
  }

  // 2. Run built-in patterns
  for (const pat of BUILTIN_PATTERNS) {
    const m = t.match(pat.regex);
    if (m && m[pat.captureGroup]) {
      const raw = m[pat.captureGroup];
      const value = pat.postProcess ? pat.postProcess(raw) : cleanDate(raw);
      const weight = learnedWeights[pat.id] ?? 1.0;
      candidates.push({
        value,
        patternId: pat.id,
        confidence: pat.baseConfidence,
        weight,
        score: pat.baseConfidence * weight,
      });
    }
  }

  // 3. Run learned patterns from DB
  for (const lp of learnedPatterns) {
    try {
      const rx = new RegExp(lp.regex, 'i');
      const m = t.match(rx);
      if (m && m[1]) {
        const value = cleanDate(m[1]);
        candidates.push({
          value,
          patternId: lp.id,
          confidence: 0.85, // learned patterns are fairly reliable
          weight: lp.weight,
          score: 0.85 * lp.weight,
        });
      }
    } catch {
      // Invalid regex in DB — skip
    }
  }

  // 4. Sort by score descending, pick the best
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

// ─── Learn from a user correction ──────────────────────────────────────
/**
 * Called when a user corrects the invoiceDate on an invoice.
 * Analyses the OCR text to figure out what label/format was used,
 * generates a new regex pattern for it, and stores it in DB.
 */
export async function learnFromCorrection(params: {
  invoiceId: string;
  extractedText: string;
  wrongValue: string | null;
  correctValue: string;
}): Promise<void> {
  const { invoiceId, extractedText, wrongValue, correctValue } = params;
  const t = extractedText.replace(/\s+/g, ' ');

  // Try to find the correct date value in the extracted text
  // and discover what label precedes it
  let learnedLabel: string | null = null;
  let learnedPattern: string | null = null;

  // Escape the correct value for use in regex
  const escaped = correctValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Also try with flexible whitespace
  const flexEscaped = correctValue
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');

  // Look for the correct value in OCR text and capture any preceding label
  const contextRx = new RegExp(`([A-Za-z][A-Za-z.\\s]{0,30}?)[:\\-]?\\s*${flexEscaped}`, 'i');
  const contextMatch = t.match(contextRx);

  if (contextMatch && contextMatch[1]) {
    const rawLabel = contextMatch[1].trim();
    // Only learn it as a new label if it looks like a genuine label word
    // and not just random text
    if (rawLabel.length >= 2 && rawLabel.length <= 30 && /date|dt|bill|inv|period|time/i.test(rawLabel)) {
      learnedLabel = rawLabel;
      // Build a regex: escaped label + separator + flexible date capture
      const labelEscaped = rawLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      learnedPattern = `${labelEscaped}\\s*[:\\-]?\\s*(\\d{1,2}[\\s\\/.\\\\-]*(?:${MONTHS})[\\s\\/.\\\\,-]*\\d{2,4})`;
    }
  }

  // If we can't detect a label-based pattern, try to learn the format itself
  if (!learnedPattern) {
    // Try to find the date in text and learn the surrounding context
    const dateInText = t.indexOf(correctValue);
    if (dateInText >= 0) {
      // Get 40 chars before the date to see what label is there
      const before = t.substring(Math.max(0, dateInText - 40), dateInText).trim();
      // Extract last "word(s)" as potential label
      const labelMatch = before.match(/([A-Za-z][A-Za-z.\s]{1,25}?)\s*[:\-]?\s*$/);
      if (labelMatch) {
        learnedLabel = labelMatch[1].trim();
        const labelEscaped = learnedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        // Generic date capture after this label
        learnedPattern = `${labelEscaped}\\s*[:\\-]?\\s*(\\d{1,2}[\\s\\/.\\\\-]*(?:[A-Za-z]{3,9})?[\\s\\/.\\\\,-]*\\d{2,4})`;
      }
    }
  }

  // Check if we already have an identical correction
  const existing = await prisma.datePatternCorrection.findFirst({
    where: {
      learnedPattern: learnedPattern,
      correctValue: correctValue,
    },
  });

  if (existing) {
    // Boost the weight — this pattern is confirmed again
    await prisma.datePatternCorrection.update({
      where: { id: existing.id },
      data: {
        weight: existing.weight + 0.2,
        hitCount: existing.hitCount + 1,
      },
    });
  } else {
    // Store new correction
    // Get OCR context around the correct value (±50 chars)
    const idx = t.indexOf(correctValue);
    const ocrContext = idx >= 0
      ? t.substring(Math.max(0, idx - 50), Math.min(t.length, idx + correctValue.length + 50))
      : correctValue;

    await prisma.datePatternCorrection.create({
      data: {
        ocrContext,
        extractedText: extractedText.substring(0, 2000), // cap storage
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

  console.log(`[DateBooster] Learned from correction: "${wrongValue}" → "${correctValue}"${learnedPattern ? ` pattern: ${learnedPattern}` : ''}`);
}

/**
 * Boost weight of a pattern when it correctly detects a date that
 * the user confirms (doesn't change).
 */
export async function confirmPattern(patternId: string): Promise<void> {
  if (!patternId.startsWith('learned-')) return;
  const dbId = patternId.replace('learned-', '');
  try {
    const record = await prisma.datePatternCorrection.findUnique({ where: { id: dbId } });
    if (record) {
      await prisma.datePatternCorrection.update({
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
