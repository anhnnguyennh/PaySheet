import type { HistoryEntry } from "../types";

export function HistoryTab({ history }: { history: HistoryEntry[] }) {
  return (
    <div className="panel">
      <p className="section-title">History</p>
      <p className="muted">Every plan, approval, payment, and undo — who did it and when.</p>
      {history.length === 0 && <p className="muted">Nothing yet.</p>}
      {history.map((h) => (
        <div key={h.id} className="history-row">
          <span>
            <strong>{h.actor}</strong> — {h.detail}
          </span>
          <span className="muted">{new Date(h.at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
