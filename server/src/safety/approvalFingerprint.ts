import { createHash } from "node:crypto";
import type { PaymentRow } from "../types.js";

/**
 * A fingerprint only covers the fields that matter financially. Editing
 * anything in this set after approval must invalidate the approval; editing
 * anything outside it (e.g. sourceText formatting) should not force a
 * needless re-approval.
 */
export function fingerprintPlan(rows: PaymentRow[]): string {
  const canonical = rows
    .map((r) => ({
      id: r.id,
      recipientName: r.recipientName,
      recipientEmail: r.recipientEmail,
      amountCents: r.amountCents,
      reason: r.reason,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function fingerprintRow(row: PaymentRow): string {
  return fingerprintPlan([row]);
}
