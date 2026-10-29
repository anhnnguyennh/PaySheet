import type { Db, Flag, PaymentRow } from "../types.js";

const DUPLICATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function detectAnomalies(db: Db, row: PaymentRow): Flag[] {
  const flags: Flag[] = [];

  const byName = db.contacts.find((c) => c.name.toLowerCase() === row.recipientName.toLowerCase());
  const byEmail = db.contacts.find((c) => c.email === row.recipientEmail);

  if (!byName && !byEmail) {
    flags.push({
      code: "new_recipient",
      message: `${row.recipientName} is not on the approved contact list yet. Confirm the contact before this can be paid.`,
    });
  } else if (byName && row.recipientEmail && byName.email !== row.recipientEmail) {
    // Known name, but the payout email doesn't match what's on file — the
    // classic "vendor says their bank details changed" redirect attempt.
    flags.push({
      code: "recipient_email_mismatch",
      message: `${row.recipientName} is a known contact, but this email (${row.recipientEmail}) doesn't match the one on file (${byName.email}) — possible redirect attempt.`,
    });
  }

  const priorPayments = db.rows.filter(
    (r) =>
      r.id !== row.id &&
      (r.recipientEmail === row.recipientEmail || r.recipientName.toLowerCase() === row.recipientName.toLowerCase()) &&
      (r.status === "paid" || r.status === "processing" || r.status === "approved"),
  );

  const now = Date.parse(row.createdAt);
  const recentDuplicate = priorPayments.find(
    (r) => r.amountCents === row.amountCents && now - Date.parse(r.createdAt) < DUPLICATE_WINDOW_MS,
  );
  if (recentDuplicate) {
    flags.push({
      code: "possible_duplicate",
      message: `${row.recipientName} was already paid $${(row.amountCents / 100).toFixed(2)} recently (row ${recentDuplicate.id.slice(0, 6)}). Could be a repeat invoice.`,
    });
  }

  if (priorPayments.length >= 2) {
    const avg = priorPayments.reduce((s, r) => s + r.amountCents, 0) / priorPayments.length;
    if (row.amountCents > avg * 2.5) {
      flags.push({
        code: "unusual_amount",
        message: `${(row.amountCents / 100).toFixed(2)} is far above ${row.recipientName}'s usual ~$${(avg / 100).toFixed(2)}.`,
      });
    }
  }

  return flags;
}
