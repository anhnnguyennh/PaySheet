import type { PaymentRow, Rule, StateSnapshot } from "./types";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getState: () => req<StateSnapshot>("/state"),

  addRow: (text: string, actor: string) =>
    req<PaymentRow>("/rows", { method: "POST", body: JSON.stringify({ text, actor }) }),

  editRow: (id: string, patch: Record<string, unknown>, actor: string) =>
    req<PaymentRow>(`/rows/${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, actor }) }),

  confirmContact: (rowId: string, actor: string) =>
    req<PaymentRow>(`/rows/${rowId}/confirm-contact`, { method: "POST", body: JSON.stringify({ actor }) }),

  approve: (rowIds: string[], approver: string) =>
    req<{ rows: PaymentRow[]; approval: unknown }>("/approve", {
      method: "POST",
      body: JSON.stringify({ rowIds, approver }),
    }),

  pay: (rowIds: string[], actor: string) =>
    req<{ results: { rowId: string; ok: boolean; reason?: string }[] }>("/pay", {
      method: "POST",
      body: JSON.stringify({ rowIds, actor }),
    }),

  undo: (rowId: string, actor: string) =>
    req<{ reversed: boolean; reason: string; row: PaymentRow }>(`/rows/${rowId}/undo`, {
      method: "POST",
      body: JSON.stringify({ actor }),
    }),

  addRule: (rule: Omit<Rule, "id">) => req<Rule>("/rules", { method: "POST", body: JSON.stringify(rule) }),

  deleteRule: (id: string) => req<void>(`/rules/${id}`, { method: "DELETE" }),

  addContact: (name: string, email: string, approvedBy: string) =>
    req("/contacts", { method: "POST", body: JSON.stringify({ name, email, approvedBy }) }),
};
