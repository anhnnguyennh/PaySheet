import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { AddPaymentPanel } from "./components/AddPaymentPanel";
import { ContactsPanel } from "./components/ContactsPanel";
import { HistoryTab } from "./components/HistoryTab";
import { RulesTab } from "./components/RulesTab";
import { SpreadsheetGrid } from "./components/SpreadsheetGrid";
import type { StateSnapshot } from "./types";

type Tab = "sheet" | "rules" | "contacts" | "history";

export default function App() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>("sheet");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actor, setActor] = useState(() => localStorage.getItem("paysheet.actor") ?? "Treasurer");

  useEffect(() => localStorage.setItem("paysheet.actor", actor), [actor]);

  const refresh = useCallback(() => {
    api.getState().then(setSnapshot).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  async function guarded(fn: () => Promise<unknown>) {
    try {
      setError(null);
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!snapshot) return <div className="app">Loading…</div>;

  const approvedRows = snapshot.rows.filter((r) => r.status === "approved");
  const pendingTotal = snapshot.rows
    .filter((r) => ["planned", "flagged", "approved"].includes(r.status))
    .reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>PaySheet</h1>
        </div>
        <div className="brand">
          <div className="balance">
            Balance: <strong>${(snapshot.balanceCents / 100).toFixed(2)}</strong>
            {pendingTotal > 0 && <span className="muted"> &nbsp;(${(pendingTotal / 100).toFixed(2)} pending)</span>}
          </div>
          <div className="actor-input">
            <span>Acting as</span>
            <input value={actor} onChange={(e) => setActor(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="tabs">
        {(["sheet", "rules", "contacts", "history"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="content">
        {error && <div className="error-banner">{error}</div>}

        {tab === "sheet" && (
          <>
            <AddPaymentPanel onAdd={(text) => guarded(() => api.addRow(text, actor))} />

            <div className="panel">
              <div className="toolbar">
                <p className="section-title" style={{ margin: 0 }}>
                  Sheet
                </p>
                <div className="btn-row" style={{ margin: 0 }}>
                  <button
                    className="btn secondary"
                    disabled={selectedIds.length === 0}
                    onClick={() => guarded(() => api.approve(selectedIds, actor))}
                  >
                    Approve {selectedIds.length || ""} selected
                  </button>
                  <button
                    className="btn"
                    disabled={approvedRows.length === 0}
                    onClick={() => guarded(() => api.pay(approvedRows.map((r) => r.id), actor))}
                  >
                    Pay {approvedRows.length} approved
                  </button>
                </div>
              </div>

              <SpreadsheetGrid
                rows={snapshot.rows}
                onSelectionChange={setSelectedIds}
                onEdit={(id, patch) => guarded(() => api.editRow(id, patch, actor))}
                onApproveOne={(id) => guarded(() => api.approve([id], actor))}
                onConfirmContact={(id) => guarded(() => api.confirmContact(id, actor))}
                onUndo={(id) => guarded(() => api.undo(id, actor))}
              />
            </div>
          </>
        )}

        {tab === "rules" && (
          <RulesTab
            rules={snapshot.rules}
            onAdd={(rule) => guarded(() => api.addRule(rule))}
            onDelete={(id) => guarded(() => api.deleteRule(id))}
          />
        )}

        {tab === "contacts" && (
          <ContactsPanel contacts={snapshot.contacts} onAdd={(name, email) => guarded(() => api.addContact(name, email, actor))} />
        )}

        {tab === "history" && <HistoryTab history={snapshot.history} />}
      </div>
    </div>
  );
}
