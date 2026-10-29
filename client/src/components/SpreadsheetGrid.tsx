import { ClientSideRowModelModule, CommunityFeaturesModule, ModuleRegistry, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import type { PaymentRow } from "../types";
import { StatusChip } from "./StatusChip";

ModuleRegistry.registerModules([ClientSideRowModelModule, CommunityFeaturesModule]);

interface Props {
  rows: PaymentRow[];
  onSelectionChange: (ids: string[]) => void;
  onEdit: (id: string, patch: Record<string, unknown>) => void;
  onApproveOne: (id: string) => void;
  onConfirmContact: (id: string) => void;
  onUndo: (id: string) => void;
}

function FlagsCell(params: ICellRendererParams<PaymentRow>) {
  const flags = params.data?.flags ?? [];
  if (flags.length === 0) return <span className="muted">—</span>;
  return (
    <div className="flag-list">
      {flags.map((f, i) => (
        <span key={i} className="flag-badge" title={f.message}>
          {f.message}
        </span>
      ))}
    </div>
  );
}

function ActionsCell(
  params: ICellRendererParams<PaymentRow> & {
    onApproveOne: Props["onApproveOne"];
    onConfirmContact: Props["onConfirmContact"];
    onUndo: Props["onUndo"];
  },
) {
  const row = params.data;
  if (!row) return null;
  const hasFlags = row.flags.length > 0;
  const needsContact = row.flags.some((f) => f.code === "new_recipient");

  return (
    <div className="row-actions">
      {needsContact && (
        <button className="btn secondary" onClick={() => params.onConfirmContact(row.id)}>
          Confirm contact
        </button>
      )}
      {(row.status === "planned" || row.status === "flagged") && hasFlags && (
        <button className="btn secondary" onClick={() => params.onApproveOne(row.id)}>
          Approve this one
        </button>
      )}
      {(row.status === "paid" || row.status === "processing") && (
        <button className="btn danger" onClick={() => params.onUndo(row.id)}>
          Undo
        </button>
      )}
    </div>
  );
}

export function SpreadsheetGrid({ rows, onSelectionChange, onEdit, onApproveOne, onConfirmContact, onUndo }: Props) {
  const columnDefs = useMemo<ColDef<PaymentRow>[]>(
    () => [
      { headerCheckboxSelection: true, checkboxSelection: (p) => (p.data ? p.data.flags.length === 0 : false), width: 44, pinned: "left" },
      { field: "recipientName", headerName: "Recipient", editable: (p) => !["paid", "processing", "reversed"].includes(p.data!.status), flex: 1.2 },
      { field: "recipientEmail", headerName: "Email", editable: (p) => !["paid", "processing", "reversed"].includes(p.data!.status), flex: 1.4 },
      {
        field: "amountCents",
        headerName: "Amount",
        editable: (p) => !["paid", "processing", "reversed"].includes(p.data!.status),
        valueFormatter: (p) => `$${((p.value ?? 0) / 100).toFixed(2)}`,
        valueParser: (p) => Math.round(parseFloat(String(p.newValue).replace(/[^0-9.]/g, "")) * 100),
        width: 110,
      },
      { field: "reason", headerName: "Reason", editable: (p) => !["paid", "processing", "reversed"].includes(p.data!.status), flex: 1.4 },
      {
        field: "status",
        headerName: "Status",
        width: 140,
        cellRenderer: (p: ICellRendererParams<PaymentRow>) => <StatusChip status={p.data!.status} />,
        cellClass: (p) => (p.value === "processing" ? "cell-processing" : p.value === "paid" ? "cell-paid" : p.value === "failed" ? "cell-failed" : ""),
      },
      { headerName: "Flags", flex: 1.8, cellRenderer: FlagsCell, autoHeight: true, wrapText: true },
      {
        headerName: "Actions",
        width: 190,
        cellRenderer: ActionsCell,
        cellRendererParams: { onApproveOne, onConfirmContact, onUndo },
      },
    ],
    [onApproveOne, onConfirmContact, onUndo],
  );

  return (
    <div className="ag-theme-quartz grid-wrap">
      <AgGridReact<PaymentRow>
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.id}
        rowSelection={{ mode: "multiRow", checkboxes: true, headerCheckbox: true }}
        onSelectionChanged={(e) => onSelectionChange(e.api.getSelectedRows().map((r) => r.id))}
        onCellValueChanged={(e) => {
          const field = e.colDef.field as string | undefined;
          if (!field) return;
          onEdit(e.data.id, { [field]: e.newValue });
        }}
        isRowSelectable={(node) => (node.data ? node.data.flags.length === 0 && ["planned", "draft"].includes(node.data.status) : false)}
        animateRows
      />
    </div>
  );
}
