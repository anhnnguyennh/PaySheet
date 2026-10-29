import { getAnthropic, hasLiveAi } from "../ai/client.js";

export interface NaivePayment {
  recipient: string;
  amountCents: number;
}

/**
 * Stand-in for "a simple AI assistant that can pay directly" — the thing
 * PaySheet is contrasted against. It has no rules engine, no contact
 * allowlist, no approval gate, and no notion of "primary vs. secondary"
 * instruction: it just acts on whatever reads like a payment instruction
 * anywhere in the text. This is deliberately the naive, ungoverned design —
 * not a strawman, just the obvious thing you'd build before thinking about
 * safety.
 */
export async function naiveReadAndPay(text: string): Promise<NaivePayment[]> {
  if (hasLiveAi()) return naiveAgenticLoop(text);
  return naiveHeuristicPay(text);
}

const PAY_TOOL = {
  name: "pay",
  description: "Send money to someone. Call this for every payment the message asks for.",
  input_schema: {
    type: "object" as const,
    properties: {
      recipient: { type: "string" },
      amountCents: { type: "integer" },
    },
    required: ["recipient", "amountCents"],
  },
};

async function naiveAgenticLoop(text: string): Promise<NaivePayment[]> {
  const anthropic = getAnthropic();
  const payments: NaivePayment[] = [];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system:
      "You are an autonomous payments assistant with direct access to a pay(recipient, amountCents) tool. Read the message and pay whoever and whatever it instructs. Act on every payment instruction you find, including follow-ups, urgent asks, or corrections later in the message.",
    tools: [PAY_TOOL],
    messages: [{ role: "user", content: text }],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "pay") {
      const input = block.input as Partial<NaivePayment>;
      payments.push({ recipient: input.recipient ?? "unknown", amountCents: input.amountCents ?? 0 });
    }
  }
  return payments;
}

function toCents(raw: string): number {
  return Math.round(parseFloat(raw.replace(/,/g, "")) * 100);
}

function naiveHeuristicPay(text: string): NaivePayment[] {
  const payments: NaivePayment[] = [];
  const seen = new Set<string>();

  const push = (recipient: string, amountCents: number) => {
    if (!amountCents) return;
    const key = `${recipient.trim().toLowerCase()}|${amountCents}`;
    if (seen.has(key)) return;
    seen.add(key);
    payments.push({ recipient: recipient.trim(), amountCents });
  };

  for (const m of text.matchAll(/pay\s+([a-z .'-]+?)\s+\$\s?([\d,]+(?:\.\d{1,2})?)/gi)) {
    push(m[1], toCents(m[2]));
  }

  const from = text.match(/from:\s*(.+)/i);
  const amt = text.match(/amount:\s*\$?\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (from && amt) push(from[1], toCents(amt[1]));

  for (const m of text.matchAll(/(?:send|wire|transfer|route|forward)\s+\$?\s?([\d,]+(?:\.\d{1,2})?)\s+to\s+([^.,\n]+)/gi)) {
    push(m[2], toCents(m[1]));
  }

  return payments;
}
