import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { parsePaymentRequest } from "../ai/parser.js";
import { getPaypalAdapter } from "../paypal/index.js";
import { fingerprintPlan } from "../safety/approvalFingerprint.js";
import { canApprove, needsDualApproval, replan } from "../safety/planning.js";
import { db, recordHistory } from "../store.js";
import type { ApprovalRecord, PaymentRow } from "../types.js";

export const router = Router();

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function findApprovalRecord(rowIds: string[]): ApprovalRecord | undefined {
  return db.data.approvals.find((a) => sameIds(a.rowIds, rowIds));
}

router.get("/state", (_req, res) => {
  res.json({
    balanceCents: db.data.balanceCents,
    rows: db.data.rows,
    contacts: db.data.contacts,
    rules: db.data.rules,
    approvals: db.data.approvals,
    history: db.data.history.slice(-200).reverse(),
  });
});

const createRowSchema = z.object({ text: z.string().min(1), actor: z.string().min(1) });

router.post("/rows", async (req, res) => {
  const parsed = createRowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { text, actor } = parsed.data;

  const extracted = await parsePaymentRequest(text);
  if (!extracted.amountCents || extracted.amountCents <= 0) {
    return res.status(422).json({ error: "Could not find a valid payment amount in that text." });
  }

  const now = new Date().toISOString();
  const row: PaymentRow = {
    id: nanoid(),
    recipientName: extracted.recipientName,
    recipientEmail: extracted.recipientEmail,
    amountCents: extracted.amountCents,
    reason: extracted.reason,
    sourceText: text,
    suspiciousInstructions: extracted.suspiciousInstructions,
    status: "draft",
    flags: [],
    createdAt: now,
    updatedAt: now,
    planFingerprint: null,
    payoutBatchId: null,
    payoutItemId: null,
    failureReason: null,
    idempotencyKey: nanoid(),
  };

  replan(db.data, row);
  db.data.rows.push(row);
  recordHistory({ type: "plan_created", rowId: row.id, actor, detail: `Added ${row.recipientName} — $${(row.amountCents / 100).toFixed(2)}` });
  await db.write();
  res.status(201).json(row);
});

const editRowSchema = z.object({
  actor: z.string().min(1),
  recipientName: z.string().optional(),
  recipientEmail: z.string().nullable().optional(),
  amountCents: z.number().int().positive().optional(),
  reason: z.string().optional(),
});

router.patch("/rows/:id", async (req, res) => {
  const row = db.data.rows.find((r) => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Row not found" });
  if (["paid", "processing", "reversed"].includes(row.status)) {
    return res.status(400).json({ error: "This payment already moved — it can no longer be edited." });
  }
  const body = editRowSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.message });

  const wasApproved = row.status === "approved" || findApprovalRecord([row.id]) !== undefined;

  if (body.data.recipientName !== undefined) row.recipientName = body.data.recipientName;
  if (body.data.recipientEmail !== undefined) row.recipientEmail = body.data.recipientEmail;
  if (body.data.amountCents !== undefined) row.amountCents = body.data.amountCents;
  if (body.data.reason !== undefined) row.reason = body.data.reason;
  row.updatedAt = new Date().toISOString();
  row.status = "planned";
  replan(db.data, row);

  if (wasApproved) {
    recordHistory({ type: "plan_invalidated", rowId: row.id, actor: body.data.actor, detail: "Edited after approval — approval cleared, this needs review again." });
  }

  await db.write();
  res.json(row);
});

router.post("/rows/:id/confirm-contact", async (req, res) => {
  const row = db.data.rows.find((r) => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Row not found" });
  const actor = String(req.body?.actor ?? "unknown");

  const already = db.data.contacts.find((c) => c.email === row.recipientEmail || c.name.toLowerCase() === row.recipientName.toLowerCase());
  if (!already) {
    db.data.contacts.push({
      id: nanoid(),
      name: row.recipientName,
      email: row.recipientEmail ?? `${row.recipientName.toLowerCase().replace(/\s+/g, ".")}@unknown.test`,
      addedAt: new Date().toISOString(),
      approvedBy: actor,
    });
    recordHistory({ type: "plan_created", rowId: row.id, actor, detail: `Confirmed ${row.recipientName} as a known contact.` });
  }
  replan(db.data, row);
  await db.write();
  res.json(row);
});

const approveSchema = z.object({ rowIds: z.array(z.string()).min(1), approver: z.string().min(1) });

router.post("/approve", async (req, res) => {
  const body = approveSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.message });
  const { rowIds, approver } = body.data;

  const rows = rowIds.map((id) => db.data.rows.find((r) => r.id === id)).filter(Boolean) as PaymentRow[];
  if (rows.length !== rowIds.length) return res.status(404).json({ error: "One or more rows not found." });

  const anyFlagged = rows.some((r) => r.flags.length > 0);
  if (rowIds.length > 1 && anyFlagged) {
    return res.status(400).json({ error: "Flagged payments must be approved one at a time, not batched." });
  }

  for (const row of rows) {
    const check = canApprove(row.flags);
    if (!check.ok) return res.status(400).json({ error: `${row.recipientName}: ${check.reason}` });
  }

  const fingerprint = fingerprintPlan(rows);
  let record = findApprovalRecord(rowIds);

  if (record && record.fingerprint === fingerprint && !record.secondApprovedBy) {
    if (record.approvedBy.toLowerCase() === approver.toLowerCase()) {
      return res.status(400).json({ error: "A second approval needs to come from a different person than the first." });
    }
    record.secondApprovedBy = approver;
    record.secondApprovedAt = new Date().toISOString();
    for (const row of rows) recordHistory({ type: "second_approved", rowId: row.id, actor: approver, detail: "Second approval recorded." });
  } else {
    record = { fingerprint, rowIds, approvedBy: approver, approvedAt: new Date().toISOString(), secondApprovedBy: null, secondApprovedAt: null };
    db.data.approvals = db.data.approvals.filter((a) => !sameIds(a.rowIds, rowIds));
    db.data.approvals.push(record);
    for (const row of rows) recordHistory({ type: "approved", rowId: row.id, actor: approver, detail: "Approved." });
  }

  for (const row of rows) {
    const dual = needsDualApproval(row.flags);
    if (!dual || record.secondApprovedBy) {
      row.status = "approved";
      row.planFingerprint = fingerprint;
    }
  }

  await db.write();
  res.json({ rows, approval: record });
});

const paySchema = z.object({ rowIds: z.array(z.string()).min(1), actor: z.string().min(1) });

router.post("/pay", async (req, res) => {
  const body = paySchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.message });
  const { rowIds, actor } = body.data;
  const adapter = getPaypalAdapter();

  const results: { rowId: string; ok: boolean; reason?: string }[] = [];

  for (const id of rowIds) {
    const row = db.data.rows.find((r) => r.id === id);
    if (!row) {
      results.push({ rowId: id, ok: false, reason: "Row not found." });
      continue;
    }
    if (row.status !== "approved") {
      results.push({ rowId: id, ok: false, reason: `Not fully approved (status: ${row.status}).` });
      continue;
    }
    const currentFingerprint = fingerprintPlan([row]);
    const record = db.data.approvals.find((a) => a.rowIds.includes(id));
    const dual = needsDualApproval(row.flags);

    if (!record) {
      results.push({ rowId: id, ok: false, reason: "No approval on file." });
      continue;
    }
    if (dual && !record.secondApprovedBy) {
      results.push({ rowId: id, ok: false, reason: "Still needs a second approver." });
      continue;
    }
    if (currentFingerprint !== row.planFingerprint) {
      replan(db.data, row);
      recordHistory({ type: "plan_invalidated", rowId: row.id, actor, detail: "Row changed since approval — blocked before paying." });
      results.push({ rowId: id, ok: false, reason: "This row changed since it was approved. Re-approve the new version." });
      continue;
    }
    if (!row.recipientEmail) {
      results.push({ rowId: id, ok: false, reason: `No email on file for ${row.recipientName} — add one before paying.` });
      continue;
    }

    const payout = await adapter.sendPayout({
      idempotencyKey: row.idempotencyKey,
      recipientEmail: row.recipientEmail,
      amountCents: row.amountCents,
      note: row.reason,
    });
    row.status = "processing";
    row.payoutBatchId = payout.payoutBatchId;
    row.payoutItemId = payout.payoutItemId;
    recordHistory({ type: "payment_sent", rowId: row.id, actor, detail: `Sent to PayPal (batch ${payout.payoutBatchId}).` });
    results.push({ rowId: id, ok: true });
  }

  await db.write();
  res.json({ results });
});

router.post("/rows/:id/undo", async (req, res) => {
  const row = db.data.rows.find((r) => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Row not found" });
  if (!row.payoutItemId) return res.status(400).json({ error: "Nothing to undo." });

  const adapter = getPaypalAdapter();
  const result = await adapter.tryCancel(row.payoutItemId);
  if (result.reversed) {
    if (row.status === "paid") db.data.balanceCents += row.amountCents;
    row.status = "reversed";
    recordHistory({ type: "payment_reversed", rowId: row.id, actor: String(req.body?.actor ?? "unknown"), detail: result.reason });
  }
  await db.write();
  res.json({ reversed: result.reversed, reason: result.reason, row });
});

const ruleSchema = z.object({
  kind: z.enum(["max_single_payment", "max_monthly_category", "dual_approval_threshold"]),
  category: z.string().nullable(),
  limitCents: z.number().int().positive(),
  description: z.string().min(1),
});

router.post("/rules", async (req, res) => {
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const rule = { id: nanoid(), ...parsed.data };
  db.data.rules.push(rule);
  await db.write();
  res.status(201).json(rule);
});

router.delete("/rules/:id", async (req, res) => {
  db.data.rules = db.data.rules.filter((r) => r.id !== req.params.id);
  await db.write();
  res.status(204).end();
});

const contactSchema = z.object({ name: z.string().min(1), email: z.string().email(), approvedBy: z.string().min(1) });

router.post("/contacts", async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const contact = { id: nanoid(), addedAt: new Date().toISOString(), ...parsed.data };
  db.data.contacts.push(contact);
  await db.write();
  res.status(201).json(contact);
});

router.post("/webhooks/paypal", async (req, res) => {
  const event = req.body as { event_type?: string; resource?: { payout_item_id?: string } };
  const itemId = event.resource?.payout_item_id;
  if (!itemId) return res.status(400).end();

  const map: Record<string, "SUCCESS" | "FAILED" | "UNCLAIMED"> = {
    "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": "SUCCESS",
    "PAYMENT.PAYOUTS-ITEM.FAILED": "FAILED",
    "PAYMENT.PAYOUTS-ITEM.BLOCKED": "FAILED",
    "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": "UNCLAIMED",
  };
  const status = event.event_type ? map[event.event_type] : undefined;
  if (status) {
    const { notifyLivePayoutWebhook } = await import("../paypal/liveAdapter.js");
    notifyLivePayoutWebhook(itemId, status);
  }
  res.status(200).end();
});
