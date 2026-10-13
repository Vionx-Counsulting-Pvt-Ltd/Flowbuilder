import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardQueryKey,
  getGetReportOverviewQueryKey,
  getListRequestsQueryKey,
  useCreateRequest,
  useListPeople,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import type { Workflow, WorkflowField } from "@workspace/api-client-react";
import { ArrowRight, LoaderCircle, Paperclip, X } from "lucide-react";

type UploadedWorkflowFile = {
  fileId: string;
  name: string;
  contentType: string;
  size: number;
};

const fieldId = (field: WorkflowField) => field.id;

function isVisible(field: WorkflowField, values: Record<string, unknown>): boolean {
  if (field.hidden) return false;
  const condition = field.displayCondition;
  if (!condition) return true;
  const current = values[condition.fieldId];
  const equals = Array.isArray(current)
    ? current.some((item) => String(item) === condition.value)
    : String(current ?? "") === condition.value;
  if (condition.operator === "notEquals") return !equals;
  if (condition.operator === "contains") {
    return Array.isArray(current)
      ? equals
      : String(current ?? "").includes(condition.value);
  }
  return equals;
}

function initialValue(field: WorkflowField): unknown {
  if (field.type === "checkbox") return field.defaultValue === "true";
  if (field.type === "file" || field.type === "multiselect" || (field.type === "people" && field.multiple)) return [];
  return field.defaultValue ?? "";
}

export default function RequestFormModal({
  workflows,
  onClose,
}: {
  workflows: Workflow[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useCreateRequest();
  const upload = useRequestUploadUrl();
  const people = useListPeople();
  const [, setLocation] = useLocation();
  const [workflowId, setWorkflowId] = useState(
    workflows.find((workflow) => workflow.status === "active")?.id ?? "",
  );
  const selected = workflows.find((workflow) => workflow.id === workflowId);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState("");
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  useEffect(() => {
    setValues(
      Object.fromEntries(
        (selected?.fields ?? []).map((field) => [field.id, initialValue(field)]),
      ),
    );
    setErrors({});
    setUploadError("");
  }, [workflowId, selected?.id]);

  function updateValue(id: string, value: unknown) {
    setValues((current) => ({ ...current, [id]: value }));
    setErrors((current) => ({ ...current, [id]: "" }));
  }

  async function uploadFiles(field: WorkflowField, files: FileList | null) {
    if (!files?.length) return;
    const existing = Array.isArray(values[fieldId(field)])
      ? (values[fieldId(field)] as UploadedWorkflowFile[])
      : [];
    const maxFiles = field.multiple ? field.maxFiles ?? 10 : 1;
    const selectedFiles = Array.from(files);
    if (existing.length + selectedFiles.length > maxFiles) {
      setUploadError(`Choose up to ${maxFiles} file${maxFiles === 1 ? "" : "s"} for ${field.label}.`);
      return;
    }
    const maxSizeMB = field.maxFileSizeMB ?? 20;
    const oversized = selectedFiles.find((file) => file.size > maxSizeMB * 1024 * 1024);
    if (oversized) {
      setUploadError(`${oversized.name} exceeds the ${maxSizeMB} MB limit.`);
      return;
    }

    setUploadingField(field.id);
    setUploadError("");
    try {
      const completed: UploadedWorkflowFile[] = [];
      for (const file of selectedFiles) {
        const response = await upload.mutateAsync({
          data: {
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
          },
        });
        const result = await fetch(response.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!result.ok) throw new Error(`Upload failed for ${file.name}.`);
        completed.push({
          fileId: response.fileId,
          name: response.metadata.name,
          contentType: response.metadata.contentType,
          size: response.metadata.size,
        });
      }
      setValues((current) => {
        const currentFiles = Array.isArray(current[field.id])
          ? (current[field.id] as UploadedWorkflowFile[])
          : [];
        return {
          ...current,
          [field.id]: field.multiple ? [...currentFiles, ...completed] : completed,
        };
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The upload failed.");
    } finally {
      setUploadingField(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const nextErrors: Record<string, string> = {};
    for (const field of selected.fields) {
      if (!isVisible(field, values)) continue;
      const value = values[field.id];
      const empty =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (field.required && (empty || (field.type === "checkbox" && value !== true))) {
        nextErrors[field.id] = "This field is required.";
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || uploadingField) return;

    const formData = { ...values };
    for (const field of selected.fields) {
      if (field.readOnly) {
        formData[field.id] =
          field.type === "checkbox" ? field.defaultValue === "true" : field.defaultValue ?? "";
      }
    }
    for (const field of selected.fields) {
      if (!isVisible(field, formData)) delete formData[field.id];
    }

    create.mutate(
      { data: { workflowId, formData } },
      {
        onSuccess: (request) => {
          void queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetReportOverviewQueryKey() });
          onClose();
          setLocation(`/requests/${request.id}`);
        },
      },
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel w-full max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="request-modal-title">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <span className="section-label">NEW WORKFLOW REQUEST</span>
            <h2 id="request-modal-title" className="mt-1 text-xl font-semibold">Start a request</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose a workflow and share the context your approvers need.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close request form" data-testid="button-close-request-form" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="max-h-[75dvh] space-y-4 overflow-y-auto px-6 py-5">
          <label className="form-field">
            <span>Workflow</span>
            <select className="input-control" data-testid="select-request-workflow" value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} required>
              <option value="">Choose a workflow</option>
              {workflows.filter((workflow) => workflow.status === "active").map((workflow) => (
                <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.category}</option>
              ))}
            </select>
          </label>

          {selected?.fields.filter((field) => isVisible(field, values)).map((field) => {
            const value = values[field.id];
            const disabled = Boolean(field.readOnly);
            const options = field.options ?? [];
            const onChange = (next: unknown) => updateValue(field.id, next);
            let control;

            if (field.type === "textarea") {
              control = <textarea className="input-control min-h-24" data-testid={`input-request-${field.id}`} disabled={disabled} value={String(value ?? "")} placeholder={field.placeholder ?? ""} onChange={(event) => onChange(event.target.value)} />;
            } else if (field.type === "checkbox") {
              control = <input data-testid={`input-request-${field.id}`} type="checkbox" disabled={disabled} checked={value === true} onChange={(event) => onChange(event.target.checked)} />;
            } else if (field.type === "select" || field.type === "lookup" || field.type === "people") {
              const multiple = field.type === "people" && Boolean(field.multiple);
              control = (
                <select className="input-control" data-testid={`input-request-${field.id}`} disabled={disabled} required={field.required && !multiple} multiple={multiple} value={multiple ? (Array.isArray(value) ? value as string[] : []) : String(value ?? "")} onChange={(event) => onChange(multiple ? Array.from(event.target.selectedOptions, (option) => option.value) : event.target.value)}>
                  {!multiple && <option value="">{field.type === "people" ? "Choose a person" : "Choose an option"}</option>}
                  {field.type === "people"
                    ? people.data?.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)
                    : options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              );
            } else if (field.type === "multiselect") {
              control = <select className="input-control min-h-24" data-testid={`input-request-${field.id}`} disabled={disabled} multiple value={Array.isArray(value) ? value as string[] : []} onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
            } else if (field.type === "radio") {
              control = <div className="space-y-2">{options.map((option) => <label key={option} className="flex items-center gap-2 text-sm"><input data-testid={`input-request-${field.id}-${option}`} type="radio" name={field.id} disabled={disabled} checked={value === option} onChange={() => onChange(option)} />{option}</label>)}</div>;
            } else if (field.type === "file") {
              const files = Array.isArray(value) ? value as UploadedWorkflowFile[] : [];
              control = (
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm">
                    {uploadingField === field.id ? <LoaderCircle className="animate-spin" size={16} /> : <Paperclip size={16} />}
                    {uploadingField === field.id ? "Uploading…" : "Choose file"}
                    <input className="sr-only" data-testid={`input-request-${field.id}`} type="file" disabled={disabled || uploadingField === field.id} multiple={Boolean(field.multiple)} accept={field.accept ?? undefined} onChange={(event) => { const selectedFiles = event.currentTarget.files; event.currentTarget.value = ""; void uploadFiles(field, selectedFiles); }} />
                  </label>
                  <p className="text-xs text-muted-foreground">Up to {field.multiple ? field.maxFiles ?? 10 : 1} file{field.multiple ? "s" : ""}, {field.maxFileSizeMB ?? 20} MB each. Files are private to this workspace.</p>
                  {files.map((file) => <div key={file.fileId} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"><span className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span><button type="button" className="text-destructive" data-testid={`remove-upload-${field.id}-${file.fileId}`} onClick={() => onChange(files.filter((item) => item.fileId !== file.fileId))}>Remove</button></div>)}
                </div>
              );
            } else {
              const inputType = field.type === "datetime" ? "datetime-local" : field.type;
              control = <input className="input-control" data-testid={`input-request-${field.id}`} type={inputType} disabled={disabled} required={field.required} min={field.type === "number" ? field.min ?? undefined : undefined} max={field.type === "number" ? field.max ?? undefined : undefined} minLength={field.minLength ?? undefined} maxLength={field.maxLength ?? undefined} value={String(value ?? "")} placeholder={field.placeholder ?? ""} onChange={(event) => onChange(event.target.value)} />;
            }

            return (
              <label className="form-field block" key={field.id}>
                <span>{field.label}{field.required ? " *" : ""}</span>
                {field.prefix || field.suffix
                  ? <div className="flex items-center gap-2">{field.prefix && <span className="text-xs text-muted-foreground">{field.prefix}</span>}{control}{field.suffix && <span className="text-xs text-muted-foreground">{field.suffix}</span>}</div>
                  : control}
                {field.helpText && <small>{field.helpText}</small>}
                {errors[field.id] && <small className="form-error" data-testid={`error-request-${field.id}`}>{errors[field.id]}</small>}
              </label>
            );
          })}

          {!selected && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{workflows.length ? "Select an active workflow to see its form." : "There are no active workflows yet."}</p>}
          {uploadError && <p className="form-error" data-testid="status-upload-error">{uploadError}</p>}
          {create.isError && <p className="form-error" data-testid="status-request-error">Could not submit this request. Please check the fields and try again.</p>}
          <div className="modal-actions border-t border-border pt-4">
            <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" data-testid="button-submit-request" disabled={!selected || create.isPending || Boolean(uploadingField)}>
              {create.isPending ? "Submitting…" : "Submit request"} <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
