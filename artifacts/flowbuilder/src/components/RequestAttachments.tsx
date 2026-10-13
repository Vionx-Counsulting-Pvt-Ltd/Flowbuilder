import { Download, Eye, Paperclip } from "lucide-react";

type Attachment = { fileId: string; name: string; contentType?: string; size?: number };
const previewTypes = new Set(["application/pdf", "text/plain", "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"]);
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function RequestAttachments({ value }: { value: unknown }) {
  const files = Array.isArray(value) ? value as Attachment[] : [];
  if (!files.length) return <>—</>;
  return <div className="space-y-2">
    {files.map(file => {
      const url = `${basePath}/api/storage/objects/${encodeURIComponent(file.fileId)}?filename=${encodeURIComponent(file.name)}`;
      const canPreview = previewTypes.has((file.contentType ?? "").split(";")[0].trim().toLowerCase());
      return <div key={file.fileId} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
        <Paperclip size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className="block break-all text-sm font-medium">{file.name}</span>
          {typeof file.size === "number" && <small className="text-muted-foreground">{file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</small>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {canPreview && <a href={`${url}&preview=true`} target="_blank" rel="noopener noreferrer" className="text-link inline-flex items-center gap-1" aria-label={`View ${file.name}`} data-testid={`view-request-file-${file.fileId}`}><Eye size={14} /> View</a>}
          <a href={url} className="text-link inline-flex items-center gap-1" aria-label={`Download ${file.name}`} data-testid={`link-request-file-${file.fileId}`}><Download size={14} /> Download</a>
        </div>
      </div>;
    })}
  </div>;
}
