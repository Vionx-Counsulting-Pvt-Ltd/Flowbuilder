import { useMemo, useState } from "react";
import { ArrowDownToLine, Check, FileUp, LoaderCircle, X } from "lucide-react";
import { useCreateUser } from "@workspace/api-client-react";
import type { WorkspaceRole, WorkspaceUser } from "@workspace/api-client-react";

type CsvRow = {
  line: number;
  name: string;
  email: string;
  role: string;
  manager: string;
  state: "ready" | "imported" | "failed" | "invalid";
  message?: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadTemplate() {
  const contents = [
    ["name", "email", "role", "managerEmail"],
    ["Avery Chen", "avery@company.com", "Requester", ""],
    ["Jordan Lee", "jordan@company.com", "Approver", ""],
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "flowbuilder-members-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function rowError(
  row: Omit<CsvRow, "state" | "message">,
  roles: WorkspaceRole[],
  members: WorkspaceUser[],
  seen: Set<string>,
) {
  if (!row.name.trim()) return "Name is required.";
  const email = row.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  if (seen.has(email)) return "Email appears more than once in this file.";
  seen.add(email);
  if (members.some((member) => member.email.toLowerCase() === email)) return "This email is already in the workspace.";
  if (!roles.some((role) => role.name.toLowerCase() === row.role.toLowerCase() || role.id === row.role)) return `Unknown role: ${row.role || "(empty)"}.`;
  if (row.manager && !members.some((member) => member.email.toLowerCase() === row.manager.toLowerCase() && member.status === "active")) {
    return `No active manager found for ${row.manager}.`;
  }
  return "";
}

export default function BulkUserImport({
  roles,
  members,
  onClose,
  onImported,
}: {
  roles: WorkspaceRole[];
  members: WorkspaceUser[];
  onClose: () => void;
  onImported: () => void;
}) {
  const createUser = useCreateUser();
  const [fileError, setFileError] = useState("");
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const readyCount = useMemo(() => rows.filter((row) => row.state === "ready").length, [rows]);
  const processedCount = rows.filter((row) => row.state === "imported" || row.state === "failed").length;

  async function loadFile(file?: File) {
    setFileError("");
    setFinished(false);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setRows([]);
      setFileError("Choose a CSV file smaller than 2 MB.");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setRows([]);
      setFileError("Add a header row and at least one member.");
      return;
    }
    const headers = parsed[0].map((header) => header.trim().toLowerCase());
    const nameIndex = headers.indexOf("name");
    const emailIndex = headers.indexOf("email");
    if (nameIndex < 0 || emailIndex < 0) {
      setRows([]);
      setFileError("CSV must include name and email columns. Role and managerEmail are optional.");
      return;
    }
    const roleIndex = headers.indexOf("role");
    const managerIndex = headers.findIndex((header) => header === "manageremail" || header === "manager");
    const defaultRole = roles.find((role) => role.name.toLowerCase() === "requester")?.name || roles[0]?.name || "";
    const seen = new Set<string>();
    const preview = parsed.slice(1).map((fields, offset) => {
      const base = {
        line: offset + 2,
        name: fields[nameIndex] || "",
        email: fields[emailIndex] || "",
        role: (roleIndex >= 0 ? fields[roleIndex] : "") || defaultRole,
        manager: managerIndex >= 0 ? (fields[managerIndex] || "").trim().toLowerCase() : "",
      };
      const error = rowError(base, roles, members, seen);
      return { ...base, state: error ? "invalid" as const : "ready" as const, message: error || undefined };
    });
    setRows(preview);
    if (!preview.length) setFileError("The CSV has no member rows.");
  }

  async function importMembers() {
    if (busy || readyCount === 0) return;
    setBusy(true);
    const next = [...rows];
    for (let index = 0; index < next.length; index += 1) {
      const row = next[index];
      if (row.state !== "ready") continue;
      const role = roles.find((item) => item.name.toLowerCase() === row.role.toLowerCase() || item.id === row.role);
      const manager = row.manager
        ? members.find((item) => item.email.toLowerCase() === row.manager.toLowerCase() && item.status === "active")
        : undefined;
      try {
        if (!role) throw new Error(`Unknown role: ${row.role}`);
        await createUser.mutateAsync({
          data: {
            name: row.name.trim(),
            email: row.email.trim(),
            roleId: role.id,
            managerId: manager?.id || null,
          },
        });
        next[index] = { ...row, state: "imported", message: "Invitation sent." };
      } catch (error) {
        next[index] = {
          ...row,
          state: "failed",
          message: error instanceof Error ? error.message : "Invitation failed.",
        };
      }
      setRows([...next]);
    }
    setBusy(false);
    setFinished(true);
    if (next.some((row) => row.state === "imported")) onImported();
  }

  function retryFailed() {
    setRows((current) => current.map((row) => row.state === "failed"
      ? { ...row, state: "ready", message: undefined }
      : row));
    setFinished(false);
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="modal-panel max-w-3xl" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">
      <header className="flex items-start justify-between border-b border-border px-6 py-5">
        <div><span className="eyebrow">TEAM ADMINISTRATION</span><h2 className="display mt-1 text-xl font-bold" id="bulk-import-title">Import members from CSV</h2><p className="mt-1 text-sm text-muted-foreground">Each valid row sends an individual Clerk invitation using its assigned workspace role.</p></div>
        <button type="button" className="icon-button" aria-label="Close import dialog" onClick={onClose} disabled={busy}><X size={18} /></button>
      </header>
      <div className="max-h-[72vh] space-y-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 p-4">
          <div><b className="text-sm">CSV columns</b><p className="mt-1 text-xs text-muted-foreground">Required: name, email · Optional: role, managerEmail (active teammate’s email)</p></div>
          <button type="button" className="button button-outline inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" onClick={downloadTemplate}><ArrowDownToLine size={14} /> Download example</button>
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background p-7 text-center transition-colors hover:border-primary/50">
          <FileUp size={20} className="text-primary" /><span><b className="block text-sm">Choose a CSV file</b><small className="mt-1 block text-xs text-muted-foreground">Maximum size 2 MB. File contents are not stored.</small></span>
          <input className="sr-only" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => void loadFile(event.currentTarget.files?.[0])} />
        </label>
        {fileError && <p className="form-error" role="alert">{fileError}</p>}
        {rows.length > 0 && <div className="overflow-x-auto rounded-xl border border-border"><table className="data-table min-w-[650px]"><thead><tr><th>LINE</th><th>NAME / EMAIL</th><th>ROLE</th><th>RESULT</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.line}-${row.email}`}><td>{row.line}</td><td><b>{row.name}</b><small className="block text-muted-foreground">{row.email}</small></td><td>{row.role}</td><td><span className={`status-pill status-${row.state === "ready" ? "active" : row.state === "imported" ? "completed" : row.state === "failed" ? "rejected" : "inactive"}`}>{row.message || "Ready"}</span></td></tr>)}</tbody></table></div>}
        {finished && <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm" role="status">{rows.filter((row) => row.state === "imported").length} invitations sent; {rows.filter((row) => row.state === "failed" || row.state === "invalid").length} rows need attention.</div>}
        {createUser.isError && <p className="form-error">One or more invitations failed. Review the row results and retry failed rows.</p>}
      </div>
      <footer className="modal-actions mx-6 mb-5 mt-0">
        <span className="mr-auto text-xs text-muted-foreground">{busy ? <><LoaderCircle className="mr-1 inline animate-spin" size={13} /> Importing {processedCount} of {rows.length} rows</> : `${readyCount} ready to invite`}</span>
        <button type="button" className="button button-quiet rounded-lg px-4 py-2.5 text-sm font-semibold" disabled={busy} onClick={onClose}>{finished ? "Close" : "Cancel"}</button>
        <button type="button" className="button button-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={busy || readyCount === 0} onClick={() => finished ? retryFailed() : void importMembers()}>{busy ? "Sending invitations…" : finished ? "Retry failed rows" : <><Check size={15} /> Invite valid rows</>}</button>
      </footer>
    </section>
  </div>;
}
