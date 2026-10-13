import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardQueryKey,
  getGetWorkflowQueryKey,
  getGetReportOverviewQueryKey,
  getListRequestsQueryKey,
  useCreateRequest,
  useCorrectRequest,
  useGetRequestEditForm,
  getGetRequestQueryKey,
  getGetRequestEditFormQueryKey,
  getListNotificationsQueryKey,
  useGetCurrentUser,
  useGetWorkflow,
  useListPeople,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import type { RequestDetail, Workflow, WorkflowField } from "@workspace/api-client-react";
import { applyLockedReferenceMappings, fillReferenceSelection, computeFormExpressions, evaluateExpression, expressionUsesRequestHistory, type ExpressionContext, type ExpressionUser } from "@workspace/workflow-expressions";
import { ArrowRight, LoaderCircle, MapPin, Paperclip, X } from "lucide-react";

type UploadedWorkflowFile = { fileId: string; name: string; contentType: string; size: number };
const uploadTypes = new Set<WorkflowField["type"]>(["file", "image", "thumbnail", "drawing", "signature"]);
const progressOptions = ["Empty", "Quarter", "Half", "Three Quarter", "Full"];
const colorOptions = ["Black", "Blue", "Green", "Orange", "Purple", "Red", "Yellow", "White"];
const expressionContext = (fields: WorkflowField[], values: Record<string, unknown>, user?: ExpressionUser): ExpressionContext => ({ fields, values, user });
function evaluate(source: string | null | undefined, fields: WorkflowField[], values: Record<string, unknown>, fallback: unknown, user?: ExpressionUser): unknown {
  if (!source?.trim()) return fallback;
  try { return evaluateExpression(source, expressionContext(fields, values, user)); } catch { return fallback; }
}
function defaultValue(field: WorkflowField): unknown {
  if (field.type === "checkbox") return field.defaultValue === "true";
  if (field.type === "yesno") return field.defaultValue === "true" ? true : field.defaultValue === "false" ? false : "";
  if (uploadTypes.has(field.type) || ["multiselect", "enumlist"].includes(field.type) || (field.type === "people" && field.multiple)) return [];
  return field.defaultValue ?? "";
}
function initialValues(fields: WorkflowField[], user?: ExpressionUser): Record<string, unknown> {
  const values: Record<string, unknown> = Object.fromEntries(fields.map(field => [field.id, defaultValue(field)]));
  for (const field of fields) if (field.initialValueExpression?.trim()) delete values[field.id];
  try { return computeFormExpressions(fields, values, user); } catch { return values; }
}
function isVisible(field: WorkflowField, fields: WorkflowField[], values: Record<string, unknown>, user?: ExpressionUser): boolean {
  if (field.hidden) return false;
  if (field.showIf?.trim()) return Boolean(evaluate(field.showIf, fields, { ...values, _THIS: values[field.id] }, false, user));
  const condition = field.displayCondition;
  if (!condition) return true;
  const current = values[condition.fieldId];
  const matches = Array.isArray(current) ? current.some(item => String(item) === condition.value) : String(current ?? "") === condition.value;
  if (condition.operator === "notEquals") return !matches;
  if (condition.operator === "contains") return Array.isArray(current) ? matches : String(current ?? "").includes(condition.value);
  return matches;
}
function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function DrawingCapture({
  fieldType,
  disabled,
  onCapture,
}: {
  fieldType: "drawing" | "signature";
  disabled: boolean;
  onCapture: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function capture() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      onCapture(new File([blob], `${fieldType}-${timestamp}.png`, { type: "image/png" }));
      clear();
    }, "image/png");
  }

  return <div className="space-y-2">
    <canvas
      ref={canvasRef}
      width={720}
      height={220}
      aria-label={fieldType === "signature" ? "Draw your signature" : "Draw on the canvas"}
      data-testid={`canvas-${fieldType}`}
      className="w-full rounded-lg border border-border bg-white touch-none"
      style={{ height: 150, touchAction: "none" }}
      onPointerDown={event => {
        if (disabled) return;
        const canvas = event.currentTarget;
        const context = canvas.getContext("2d");
        if (!context) return;
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * canvas.width / rect.width;
        const y = (event.clientY - rect.top) * canvas.height / rect.height;
        context.beginPath();
        context.moveTo(x, y);
        context.lineWidth = 3;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = "#172554";
        drawing.current = true;
        setHasInk(true);
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={event => {
        if (!drawing.current) return;
        const canvas = event.currentTarget;
        const context = canvas.getContext("2d");
        if (!context) return;
        const rect = canvas.getBoundingClientRect();
        context.lineTo(
          (event.clientX - rect.left) * canvas.width / rect.width,
          (event.clientY - rect.top) * canvas.height / rect.height,
        );
        context.stroke();
      }}
      onPointerUp={() => { drawing.current = false; }}
      onPointerCancel={() => { drawing.current = false; }}
      onLostPointerCapture={() => { drawing.current = false; }}
    />
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="button button-outline" disabled={disabled || !hasInk} onClick={clear} data-testid={`button-clear-${fieldType}`}>Clear</button>
      <button type="button" className="button button-primary" disabled={disabled || !hasInk} onClick={capture} data-testid={`button-save-${fieldType}`}>Save {fieldType}</button>
      <span className="text-xs text-muted-foreground">Draw with a mouse, stylus, or touch.</span>
    </div>
  </div>;
}

export default function RequestFormModal({ workflows, onClose, correctionRequestId }: { workflows: Workflow[]; onClose: () => void; correctionRequestId?: number }) {
  const queryClient = useQueryClient();
  const create = useCreateRequest();
  const correct = useCorrectRequest();
  const correctionForm = useGetRequestEditForm(correctionRequestId ?? 0, {
    query: { queryKey: getGetRequestEditFormQueryKey(correctionRequestId ?? 0), enabled: correctionRequestId != null, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false },
  });
  const mutation = correctionRequestId != null ? correct : create;
  const [correctionNote, setCorrectionNote] = useState("");
  const failureData = mutation.error?.data;
  const failureMessage = failureData && typeof failureData === "object" && "error" in failureData && typeof failureData.error === "string"
    ? failureData.error : "Could not submit this request. Please check the fields and try again.";
  const current = useGetCurrentUser();
  const upload = useRequestUploadUrl();
  const people = useListPeople();
  const expressionUser = useMemo<ExpressionUser | undefined>(() => correctionForm.data?.expressionUser ?? (current.data
    ? { email: current.data.email, name: current.data.name, role: current.data.roleName }
    : undefined), [correctionForm.data?.expressionUser, current.data?.email, current.data?.name, current.data?.roleName]);
  const [, setLocation] = useLocation();
  const [workflowId, setWorkflowId] = useState(workflows.find(workflow => workflow.status === "active")?.id ?? "");
  const detail = useGetWorkflow(workflowId, { query: { queryKey: getGetWorkflowQueryKey(workflowId), enabled: Boolean(workflowId) && correctionRequestId == null, staleTime: 0, refetchInterval: 15000 } });
  const formQuery = correctionRequestId != null ? correctionForm : detail;
  const selected = correctionRequestId != null ? correctionForm.data?.workflow : detail.data ?? workflows.find(workflow => workflow.id === workflowId);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const uploadInProgress = useRef(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [locatingField, setLocatingField] = useState<string | null>(null);
  const computedValues = useMemo(() => {
    const fields = selected?.fields ?? [];
    const mapped = applyLockedReferenceMappings(fields, values);
    try { return computeFormExpressions(fields, mapped, expressionUser); } catch { return mapped; }
  }, [values, selected?.fields, expressionUser]);

  useEffect(() => {
    if (current.isLoading) return;
    const fields = selected?.fields ?? [];
    let initial = initialValues(fields, expressionUser);
    if (correctionRequestId != null) initial = { ...initial, ...correctionForm.data?.formData };
    else for (const source of fields) if (source.referenceMappings?.length) initial = fillReferenceSelection(fields, initial, source.id, initial[source.id]);
    setValues(initial);
    setErrors({});
    setUploadErrors({});
  }, [workflowId, selected?.id, expressionUser, current.isLoading, correctionRequestId, correctionForm.data?.updatedAt]);

  function updateValue(id: string, value: unknown) {
    setValues(current => fillReferenceSelection(selected?.fields ?? [], current, id, value));
    setErrors(current => ({ ...current, [id]: "" }));
    if (!mutation.isPending) mutation.reset();
  }

  async function uploadFiles(field: WorkflowField, fileList: FileList | File[] | null) {
    if (!fileList?.length || uploadInProgress.current) return;
    const existing = Array.isArray(values[field.id]) ? values[field.id] as UploadedWorkflowFile[] : [];
    const maxFiles = field.multiple ? field.maxFiles ?? 10 : 1;
    const selectedFiles = Array.from(fileList);
    if (existing.length + selectedFiles.length > maxFiles) {
      setUploadErrors(current => ({ ...current, [field.id]: `No files were added. Choose up to ${maxFiles} file${maxFiles === 1 ? "" : "s"} for ${field.label}.` }));
      return;
    }
    const maxSizeMB = field.maxFileSizeMB ?? 20;
    const oversized = selectedFiles.find(file => file.size > maxSizeMB * 1024 * 1024);
    if (oversized) { setUploadErrors(current => ({ ...current, [field.id]: `No files were added. ${oversized.name} exceeds the ${maxSizeMB} MB limit. Choose smaller files or clear this failed selection.` })); return; }
    uploadInProgress.current = true;
    setUploadingField(field.id);
    setUploadErrors(current => ({ ...current, [field.id]: "" }));
    try {
      for (const file of selectedFiles) {
        const response = await upload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" } });
        const result = await fetch(response.uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!result.ok) throw new Error(`Upload failed for ${file.name}.`);
        const completed = { fileId: response.fileId, name: response.metadata.name, contentType: response.metadata.contentType, size: response.metadata.size };
        // Commit each successful upload so a later failure cannot discard it.
        setValues(current => {
          const currentFiles = Array.isArray(current[field.id]) ? current[field.id] as UploadedWorkflowFile[] : [];
          return { ...current, [field.id]: field.multiple ? [...currentFiles, completed] : [completed] };
        });
      }
    } catch (error) {
      setUploadErrors(current => ({ ...current, [field.id]: `${error instanceof Error ? error.message : "The upload failed."} Successfully uploaded files are kept below. Choose the missing files again or clear this failed selection.` }));
    } finally { uploadInProgress.current = false; setUploadingField(null); }
  }

  function requestLocation(field: WorkflowField) {
    if (!navigator.geolocation) { setErrors(current => ({ ...current, [field.id]: "Location is not available in this browser. Enter it manually." })); return; }
    setLocatingField(field.id);
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude } = position.coords;
      updateValue(field.id, `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      setLocatingField(null);
    }, () => {
      setErrors(current => ({ ...current, [field.id]: "Location permission was unavailable. Enter it manually." }));
      setLocatingField(null);
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending || formQuery.isError || formQuery.isLoading ||
        (correctionRequestId != null && !correctionNote.trim())) return;
    if (!selected || detail.isError || detail.isLoading || uploadInProgress.current || Object.values(uploadErrors).some(Boolean)) return;
    const fields = selected.fields;
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      if (!isVisible(field, fields, computedValues, expressionUser) || field.type === "show") continue;
      const value = computedValues[field.id];
      const required = field.required || Boolean(evaluate(field.requiredIf, fields, { ...computedValues, _THIS: value }, false, expressionUser));
      if (required && (isEmpty(value) || (field.type === "checkbox" && value !== true))) {
        nextErrors[field.id] = "This field is required.";
      } else if (field.validIf && !isEmpty(value) && !expressionUsesRequestHistory(field.validIf)) {
        const validation = evaluate(field.validIf, fields, { ...computedValues, _THIS: value }, false, expressionUser);
        const valid = typeof validation === "boolean"
          ? validation
          : Array.isArray(validation)
            ? (Array.isArray(value) ? value.every(item => validation.some(option => String(option) === String(item))) : validation.some(option => String(option) === String(value)))
            : false;
        if (!valid) nextErrors[field.id] = field.invalidMessage || "This answer is not valid.";
      }
      if (!nextErrors[field.id] && ["number", "decimal", "percent", "price"].includes(field.type) && !isEmpty(value) && !Number.isFinite(Number(value))) {
        nextErrors[field.id] = "Enter a valid number.";
      } else if (!nextErrors[field.id] && field.type === "number" && !isEmpty(value) && !Number.isInteger(Number(value))) {
        nextErrors[field.id] = "Enter a whole number.";
      } else if (!nextErrors[field.id] && field.type === "percent" && !isEmpty(value) && (Number(value) < 0 || Number(value) > 1)) {
        nextErrors[field.id] = "Enter a fraction from 0 to 1 (for example, 0.25 for 25%).";
      } else if (!nextErrors[field.id] && ["number", "decimal", "percent", "price"].includes(field.type) && !isEmpty(value) && field.min != null && Number(value) < field.min) {
        nextErrors[field.id] = `Enter a number of at least ${field.min}.`;
      } else if (!nextErrors[field.id] && ["number", "decimal", "percent", "price"].includes(field.type) && !isEmpty(value) && field.max != null && Number(value) > field.max) {
        nextErrors[field.id] = `Enter a number no greater than ${field.max}.`;
      } else if (!nextErrors[field.id] && typeof value === "string" && field.minLength != null && value.length < field.minLength) {
        nextErrors[field.id] = `Use at least ${field.minLength} characters.`;
      } else if (!nextErrors[field.id] && typeof value === "string" && field.maxLength != null && value.length > field.maxLength) {
        nextErrors[field.id] = `Use no more than ${field.maxLength} characters.`;
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || uploadingField) return;
    const formData: Record<string, unknown> = { ...computedValues };
    for (const field of fields) if (field.type === "show" || !isVisible(field, fields, computedValues, expressionUser)) delete formData[field.id];
    const callbacks = {
      onError: (error: { data?: unknown }) => {
        const data = error.data;
        if (data && typeof data === "object" && "fieldErrors" in data && data.fieldErrors && typeof data.fieldErrors === "object") {
          setErrors(Object.fromEntries(Object.entries(data.fieldErrors).filter(([id, message]) => fields.some(field => field.id === id) && typeof message === "string")) as Record<string, string>);
        }
      },
      onSuccess: (request: RequestDetail) => {
        void queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(request.id) });
        void queryClient.invalidateQueries({ queryKey: getGetRequestEditFormQueryKey(request.id) });
        void queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetReportOverviewQueryKey() });
        onClose();
        setLocation(`/requests/${request.id}`);
      },
    };
    if (correctionRequestId != null && correctionForm.data) {
      correct.mutate({ requestId: correctionRequestId, data: {
        formData, comment: correctionNote.trim(), expectedUpdatedAt: correctionForm.data.updatedAt,
      } }, callbacks);
    } else if (correctionRequestId == null) create.mutate({ data: { workflowId, formData } }, callbacks);
  }

  function renderControl(field: WorkflowField, value: unknown, disabled: boolean, required: boolean): ReactNode {
    const options = field.type === "progress" ? progressOptions : field.options ?? [];
    const dataTestId = `input-request-${field.id}`;
    const onChange = (next: unknown) => updateValue(field.id, next);
    const numeric = ["number", "decimal", "percent", "price"].includes(field.type);
    if (["textarea", "longtext", "address"].includes(field.type)) return <textarea id={`request-${field.id}`} className="input-control min-h-24" data-testid={dataTestId} disabled={disabled} value={String(value ?? "")} placeholder={field.placeholder ?? ""} onChange={event => onChange(event.target.value)} />;
    if (field.type === "checkbox") return <label className="fb-request-checkbox"><input id={`request-${field.id}`} data-testid={dataTestId} type="checkbox" disabled={disabled} checked={value === true} onChange={event => onChange(event.target.checked)} /><span>{field.placeholder || "Yes"}</span></label>;
    if (field.type === "yesno") return <div className="flex gap-4">{[["true", "Yes"], ["false", "No"]].map(([choice, label]) => <label key={choice} className="fb-request-checkbox"><input type="radio" name={field.id} data-testid={`${dataTestId}-${choice}`} disabled={disabled} checked={String(value) === choice} onChange={() => onChange(choice === "true")} /><span>{label}</span></label>)}</div>;
    if (field.type === "color") return <select id={`request-${field.id}`} className="input-control" data-testid={dataTestId} disabled={disabled} required={required} value={String(value ?? "")} onChange={event => onChange(event.target.value)}><option value="">Choose a color</option>{colorOptions.map(color => <option key={color} value={color}>{color}</option>)}{!isEmpty(value) && !colorOptions.includes(String(value)) && <option value={String(value)}>{String(value)}</option>}</select>;
    if (["select", "enum", "lookup", "ref", "people", "progress"].includes(field.type)) {
      const multiple = field.type === "people" && Boolean(field.multiple);
      return <select id={`request-${field.id}`} className="input-control" data-testid={dataTestId} disabled={disabled} required={required && !multiple} multiple={multiple} value={multiple ? Array.isArray(value) ? value as string[] : [] : String(value ?? "")} onChange={event => onChange(multiple ? Array.from(event.target.selectedOptions, option => option.value) : event.target.value)}>
        {!multiple && <option value="">{field.type === "people" ? "Choose a person" : "Choose an option"}</option>}
        {field.type === "people" ? people.data?.map(person => <option key={person.id} value={person.id}>{person.name}</option>) : options.map(option => <option key={option} value={option}>{field.optionLabels?.[option] ?? option}</option>)}
      </select>;
    }
    if (field.type === "multiselect" || field.type === "enumlist") return <select id={`request-${field.id}`} className="input-control min-h-24" data-testid={dataTestId} disabled={disabled} multiple value={Array.isArray(value) ? value as string[] : []} onChange={event => onChange(Array.from(event.target.selectedOptions, option => option.value))}>{options.map(option => <option key={option} value={option}>{field.optionLabels?.[option] ?? option}</option>)}</select>;
    if (field.type === "radio") return <div className="space-y-2">{options.map(option => <label key={option} className="flex items-center gap-2 text-sm"><input data-testid={`${dataTestId}-${option}`} type="radio" name={field.id} disabled={disabled} checked={value === option} onChange={() => onChange(option)} />{field.optionLabels?.[option] ?? option}</label>)}</div>;
    if (uploadTypes.has(field.type)) {
      const files = Array.isArray(value) ? value as UploadedWorkflowFile[] : [];
      const isImage = ["image", "thumbnail", "drawing", "signature"].includes(field.type);
      const accept = field.accept || (isImage ? "image/*" : undefined);
      return <div className="space-y-2">
        {(field.type === "drawing" || field.type === "signature") && <DrawingCapture fieldType={field.type} disabled={disabled || Boolean(uploadingField) || current.isLoading || mutation.isPending} onCapture={file => void uploadFiles(field, [file])} />}
        <label className="relative flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm focus-within:ring-2 focus-within:ring-primary/30">
          {uploadingField === field.id ? <LoaderCircle className="animate-spin" size={16} /> : <Paperclip size={16} />}
          {uploadingField === field.id ? "Uploading…" : ["signature", "drawing"].includes(field.type) ? "Or upload an image" : "Choose file"}
          {/* Keep the focusable picker inside the visible upload area so native focus cannot scroll the form to a hidden control. */}
          <input id={`request-${field.id}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" data-testid={dataTestId} type="file" disabled={disabled || Boolean(uploadingField) || current.isLoading || mutation.isPending} multiple={Boolean(field.multiple)} accept={accept} onChange={event => {
            // FileList is live: resetting the picker empties it, so retain the File objects first.
            const selectedFiles = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void uploadFiles(field, selectedFiles);
          }} />
        </label>
        <p className="text-xs text-muted-foreground">{["drawing", "signature"].includes(field.type) ? "Captured or uploaded image is stored privately in this workspace." : "Private workspace upload."} · up to {field.multiple ? field.maxFiles ?? 10 : 1} file{field.multiple ? "s" : ""} · {field.maxFileSizeMB ?? 20} MB each.</p>
        {files.map(file => <div key={file.fileId} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"><span className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span><button type="button" className="text-destructive" disabled={Boolean(uploadingField) || mutation.isPending} data-testid={`remove-upload-${field.id}-${file.fileId}`} onClick={() => onChange(files.filter(item => item.fileId !== file.fileId))}>Remove</button></div>)}
        {!files.length && !uploadingField && !uploadErrors[field.id] && <p className="text-xs text-muted-foreground">No files attached. Selected files must appear here before you submit.</p>}
        {uploadErrors[field.id] && <div className="rounded-lg border border-destructive/30 p-3 text-sm" role="alert" data-testid={`upload-error-${field.id}`}><p className="form-error">{uploadErrors[field.id]}</p><button type="button" className="text-link mt-2" disabled={Boolean(uploadingField) || mutation.isPending} onClick={() => setUploadErrors(current => ({ ...current, [field.id]: "" }))}>Clear failed selection{files.length ? " (keep uploaded files)" : " (no files attached)"}</button></div>}
      </div>;
    }
    if (["location", "latlong", "xy"].includes(field.type)) return <div className="flex gap-2"><input className="input-control" data-testid={dataTestId} type="text" disabled={disabled} value={String(value ?? "")} placeholder={field.placeholder || (field.type === "xy" ? "X, Y" : "Latitude, longitude")} onChange={event => onChange(event.target.value)} />{field.type !== "xy" && <button type="button" className="button button-outline shrink-0" disabled={disabled || locatingField === field.id} onClick={() => requestLocation(field)} aria-label="Use browser location">{locatingField === field.id ? <LoaderCircle size={15} className="animate-spin" /> : <MapPin size={15} />}</button>}</div>;
    if (field.type === "percent") return <div className="flex items-center gap-2"><input id={`request-${field.id}`} className="input-control" data-testid={dataTestId} type="number" step="any" disabled={disabled} required={required} min={field.min == null ? undefined : field.min * 100} max={field.max == null ? undefined : field.max * 100} value={isEmpty(value) ? "" : String(Number(value) * 100)} placeholder={field.placeholder ?? ""} onChange={event => onChange(event.target.value === "" ? "" : Number(event.target.value) / 100)} /><span>%</span></div>;
    const inputType = field.type === "datetime" ? "datetime-local" : field.type === "video" ? "url" : field.type === "phone" ? "tel" : ["email", "url", "date", "time"].includes(field.type) ? field.type : numeric ? "number" : "text";
    return <input id={`request-${field.id}`} className="input-control" data-testid={dataTestId} type={inputType} step={field.type === "number" ? 1 : numeric ? "any" : undefined} disabled={disabled} required={required} min={numeric ? field.min ?? undefined : undefined} max={numeric ? field.max ?? undefined : undefined} minLength={field.minLength ?? undefined} maxLength={field.maxLength ?? undefined} value={String(value ?? "")} placeholder={field.placeholder ?? (field.type === "duration" ? "HH:MM:SS" : "")} onChange={event => onChange(event.target.value)} />;
  }

  return <div className="modal-backdrop" role="presentation">
    <section className="modal-panel w-full max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="request-modal-title">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div><span className="section-label">{correctionRequestId != null ? "RETURNED FOR CORRECTION" : "NEW WORKFLOW REQUEST"}</span><h2 id="request-modal-title" className="mt-1 text-xl font-semibold">{correctionRequestId != null ? "Correct and resubmit" : "Start a request"}</h2><p className="mt-1 text-sm text-muted-foreground">{correctionRequestId != null ? "Update the requested details. The reference stays the same and approval restarts." : "Choose a workflow and share the context your approvers need."}</p></div>
        <button type="button" className="icon-button" aria-label="Close request form" data-testid="button-close-request-form" disabled={mutation.isPending || Boolean(uploadingField)} onClick={onClose}><X size={18} /></button>
      </div>
      <form onSubmit={submit} className="max-h-[75dvh] space-y-4 overflow-y-auto px-6 py-5">
        {correctionRequestId == null ? <label className="form-field"><span>Workflow</span><select className="input-control" data-testid="select-request-workflow" value={workflowId} disabled={Boolean(uploadingField) || mutation.isPending} onChange={event => setWorkflowId(event.target.value)} required><option value="">Choose a workflow</option>{workflows.filter(workflow => workflow.status === "active").map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.category}</option>)}</select></label> : <p className="text-sm font-medium">{selected?.name ?? "Loading correction form…"}</p>}
        {selected?.fields.filter(field => isVisible(field, selected.fields, computedValues, expressionUser)).map(field => {
          const value = computedValues[field.id];
          const required = field.required || Boolean(evaluate(field.requiredIf, selected.fields, { ...computedValues, _THIS: value }, false, expressionUser));
          if (field.type === "show") return <div key={field.id} className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm" data-testid={`show-request-${field.id}`}><strong>{field.label}</strong>{field.helpText && <p className="mt-1 text-muted-foreground">{field.helpText}</p>}{field.placeholder && <p className="mt-1">{field.placeholder}</p>}</div>;
          const mapping = selected.fields.flatMap(source => source.referenceMappings ?? []).find(mapping => mapping.targetFieldId === field.id);
          const disabled = Boolean(field.readOnly || field.appFormula || mapping?.mode === "locked" || mutation.isPending);
          return <div className="form-field block" key={field.id}>
            <label htmlFor={`request-${field.id}`}><span>{field.label}{required ? " *" : ""}</span></label>
            {field.prefix || field.suffix ? <div className="flex items-center gap-2">{field.prefix && <span className="text-xs text-muted-foreground">{field.prefix}</span>}{renderControl(field, value, disabled, required)}{field.suffix && <span className="text-xs text-muted-foreground">{field.suffix}</span>}</div> : renderControl(field, value, disabled, required)}
            {field.appFormula && <small>Calculated automatically; the server recomputes this value on submission.</small>}
             {expressionUsesRequestHistory(field.validIf) && <small>Checked for duplicates against earlier requests when you submit.</small>}
            {mapping && <small>{mapping.mode === "locked" ? "Filled from the selected table row; locked and verified on submission." : "Suggested from the selected table row; you can edit this answer."}</small>}
            {field.helpText && <small>{field.helpText}</small>}
            {errors[field.id] && <small className="form-error" data-testid={`error-request-${field.id}`}>{errors[field.id]}</small>}
          </div>;
        })}
        {!selected && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{workflows.length ? "Select an active workflow to see its form." : "There are no active workflows yet."}</p>}
        {Object.values(uploadErrors).some(Boolean) && <p className="form-error" role="alert" data-testid="status-upload-error">Resolve the file upload error above before submitting, or explicitly clear the failed selection.</p>}
        {correctionRequestId != null && <label className="form-field"><span>Correction note *</span><textarea className="input-control" data-testid="input-correction-note" value={correctionNote} onChange={event => setCorrectionNote(event.target.value)} required maxLength={4000} placeholder="Explain what you corrected for the approver." /></label>}
        {formQuery.isError && <p className="form-error" role="alert">This form could not be loaded, or editing is no longer allowed. <button type="button" onClick={() => void formQuery.refetch()}>Retry</button></p>}
        {mutation.isError && <p className="form-error" role="alert" data-testid="status-request-error">{failureMessage}</p>}
        <div className="modal-actions border-t border-border pt-4"><button type="button" className="button button-outline modal-footer-btn" onClick={onClose} disabled={mutation.isPending || Boolean(uploadingField)}>Cancel</button><button type="submit" className="button button-primary modal-footer-btn" data-testid="button-submit-request" disabled={!selected || current.isLoading || formQuery.isLoading || formQuery.isError || mutation.isPending || Boolean(uploadingField) || Object.values(uploadErrors).some(Boolean) || (correctionRequestId != null && !correctionNote.trim())}>{mutation.isPending ? "Submitting…" : correctionRequestId != null ? "Resubmit request" : "Submit request"} <ArrowRight size={15} /></button></div>
      </form>
    </section>
  </div>;
}
