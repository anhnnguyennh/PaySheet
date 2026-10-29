import type { Db, Flag, PaymentRow } from "../types.js";
import { detectAnomalies } from "./anomalyDetection.js";
import { evaluateRules, hardBlockingFlags } from "./rulesEngine.js";

export function computeFlags(db: Db, row: PaymentRow): Flag[] {
  const flags: Flag[] = [...evaluateRules(db, row), ...detectAnomalies(db, row)];

  if (row.suspiciousInstructions.length > 0) {
    flags.push({
      code: "embedded_instruction",
      message: `The pasted text also contained: "${row.suspiciousInstructions.join('" / "')}" — shown for your awareness, never acted on.`,
    });
  }

  return flags;
}

/** Re-derives a row's flags + status in place. Call after creating or editing a row. */
export function replan(db: Db, row: PaymentRow): PaymentRow {
  if (!row.recipientEmail) {
    const contact = db.contacts.find((c) => c.name.toLowerCase() === row.recipientName.toLowerCase());
    if (contact) row.recipientEmail = contact.email;
  }

  row.flags = computeFlags(db, row);
  if (row.status === "paid" || row.status === "processing" || row.status === "reversed" || row.status === "failed") {
    return row;
  }
  row.status = row.flags.length > 0 ? "flagged" : "planned";
  return row;
}

export function canApprove(flags: Flag[]): { ok: true } | { ok: false; reason: string } {
  const blocking = hardBlockingFlags(flags);
  if (blocking.length > 0) {
    return { ok: false, reason: blocking.map((f) => f.message).join(" ") };
  }
  return { ok: true };
}

export function needsDualApproval(flags: Flag[]): boolean {
  return flags.some((f) => f.code === "requires_dual_approval");
}
