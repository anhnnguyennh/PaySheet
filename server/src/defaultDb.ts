import { nanoid } from "nanoid";
import type { Db } from "./types.js";

/** Fresh seed data: real app persists this to disk, attack tests use it purely in memory. */
export function createDefaultDb(): Db {
  return {
    balanceCents: 1_000_000, // $10,000.00 starting balance
    rows: [],
    contacts: [
      {
        id: nanoid(),
        name: "Alex Rivera",
        email: "alex.rivera.sandbox@paysheet.test",
        addedAt: new Date().toISOString(),
        approvedBy: "seed",
      },
      {
        id: nanoid(),
        name: "Jordan Kim",
        email: "jordan.kim.sandbox@paysheet.test",
        addedAt: new Date().toISOString(),
        approvedBy: "seed",
      },
    ],
    rules: [
      {
        id: nanoid(),
        kind: "max_single_payment",
        category: null,
        limitCents: 200000,
        description: "No single payment over $2,000",
      },
      {
        id: nanoid(),
        kind: "max_monthly_category",
        category: "food",
        limitCents: 200000,
        description: "No more than $2,000 a month for food",
      },
      {
        id: nanoid(),
        kind: "dual_approval_threshold",
        category: null,
        limitCents: 100000,
        description: "Payments over $1,000 need a second approver",
      },
    ],
    approvals: [],
    history: [],
  };
}
