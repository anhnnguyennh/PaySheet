export type PaymentStatus =
  | "draft"
  | "planned"
  | "flagged"
  | "approved"
  | "processing"
  | "paid"
  | "failed"
  | "reversed";

export interface Flag {
  code:
    | "new_recipient"
    | "unusual_amount"
    | "possible_duplicate"
    | "embedded_instruction"
    | "over_limit"
    | "over_monthly_budget"
    | "requires_dual_approval";
  message: string;
}

export interface PaymentRow {
  id: string;
  recipientName: string;
  recipientEmail: string | null;
  amountCents: number;
  reason: string;
  sourceText: string | null;
  suspiciousInstructions: string[];
  status: PaymentStatus;
  flags: Flag[];
  createdAt: string;
  updatedAt: string;
  planFingerprint: string | null;
  payoutBatchId: string | null;
  payoutItemId: string | null;
  failureReason: string | null;
  idempotencyKey: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  addedAt: string;
  approvedBy: string;
}

export interface Rule {
  id: string;
  kind: "max_single_payment" | "max_monthly_category" | "dual_approval_threshold";
  category: string | null;
  limitCents: number;
  description: string;
}

export interface ApprovalRecord {
  fingerprint: string;
  rowIds: string[];
  approvedBy: string;
  approvedAt: string;
  secondApprovedBy: string | null;
  secondApprovedAt: string | null;
}

export interface HistoryEntry {
  id: string;
  type: string;
  rowId: string | null;
  actor: string;
  detail: string;
  at: string;
}

export interface StateSnapshot {
  balanceCents: number;
  rows: PaymentRow[];
  contacts: Contact[];
  rules: Rule[];
  approvals: ApprovalRecord[];
  history: HistoryEntry[];
}
