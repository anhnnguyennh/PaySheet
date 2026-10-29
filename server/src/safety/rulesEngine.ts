import type { Db, Flag, PaymentRow, Rule } from "../types.js";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

/** categorizes free-text reasons into the handful of budget categories the rules tab understands */
export function categorize(reason: string): string {
  const r = reason.toLowerCase();
  if (/pizza|food|lunch|dinner|catering|snack|coffee/.test(r)) return "food";
  if (/travel|flight|uber|lyft|hotel|mileage/.test(r)) return "travel";
  if (/supplies|equipment|materials/.test(r)) return "supplies";
  return "general";
}

export function monthlyCategorySpend(
  db: Db,
  category: string,
  excludeRowId: string | null,
): number {
  const monthStart = startOfMonth(new Date());
  return db.rows
    .filter(
      (r) =>
        r.id !== excludeRowId &&
        categorize(r.reason) === category &&
        (r.status === "paid" || r.status === "processing" || r.status === "approved") &&
        r.updatedAt >= monthStart,
    )
    .reduce((sum, r) => sum + r.amountCents, 0);
}

/**
 * Checks one row against every rule on the rules tab. This never consults
 * the AI and the AI has no write access to `rules` — only a human editing
 * the rules tab can change these thresholds.
 */
export function evaluateRules(db: Db, row: PaymentRow): Flag[] {
  const flags: Flag[] = [];
  const category = categorize(row.reason);

  for (const rule of db.rules) {
    if (rule.kind === "max_single_payment" && row.amountCents > rule.limitCents) {
      flags.push({
        code: "over_limit",
        message: `Exceeds the $${(rule.limitCents / 100).toFixed(2)} single-payment limit. This payment cannot be approved until it is split or the rules tab is changed by a human.`,
      });
    }

    if (
      rule.kind === "max_monthly_category" &&
      rule.category === category &&
      monthlyCategorySpend(db, category, row.id) + row.amountCents > rule.limitCents
    ) {
      flags.push({
        code: "over_monthly_budget",
        message: `Would push this month's "${category}" spending past the $${(rule.limitCents / 100).toFixed(2)} budget.`,
      });
    }

    if (rule.kind === "dual_approval_threshold" && row.amountCents > rule.limitCents) {
      flags.push({
        code: "requires_dual_approval",
        message: `Over $${(rule.limitCents / 100).toFixed(2)} — needs a second approver before it can be paid.`,
      });
    }
  }

  return flags;
}

const HARD_BLOCK_CODES = new Set(["over_limit", "over_monthly_budget", "new_recipient", "recipient_email_mismatch"]);

export function hardBlockingFlags(flags: Flag[]): Flag[] {
  return flags.filter((f) => HARD_BLOCK_CODES.has(f.code));
}

export function softFlags(flags: Flag[]): Flag[] {
  return flags.filter((f) => !HARD_BLOCK_CODES.has(f.code) && f.code !== "requires_dual_approval");
}
