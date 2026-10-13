const previewTypes = new Set(["application/pdf", "text/plain", "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"]);

export function fileDeliveryHeaders(contentType: string | undefined, preview: boolean, filename?: string) {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const mime = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type) ? type : "application/octet-stream";
  const inline = preview && previewTypes.has(mime);
  const name = Array.from((filename || "FlowBuilder-upload").replace(/[/\\\u0000-\u001f\u007f]/g, "_")).slice(0, 200).join("");
  const encodedName = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return {
    contentType: mime === "text/plain" ? "text/plain; charset=utf-8" : mime,
    contentDisposition: `${inline ? "inline" : "attachment"}; filename="FlowBuilder-upload"; filename*=UTF-8''${encodedName}`,
  };
}
