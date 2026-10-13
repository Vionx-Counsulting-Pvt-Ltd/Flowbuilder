import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { currentMember, hasPermission, requireMember } from "../lib/flowbuilder-auth";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.post(
  "/storage/uploads/request-url",
  requireMember,
  async (req, res): Promise<void> => {
    const member = currentMember(res);
    if (!hasPermission(member, "create")) {
      res.status(403).json({ error: "You do not have permission to upload request files." });
      return;
    }
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "File name, type, or size is invalid." });
      return;
    }
    try {
      const { uploadURL, fileId } = await storage.createTenantUpload(member.tenantId);
      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          fileId,
          metadata: parsed.data,
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Failed to create private upload URL");
      res.status(500).json({ error: "Could not prepare the file upload." });
    }
  },
);

router.get(
  "/storage/objects/:fileId",
  requireMember,
  async (req, res): Promise<void> => {
    const fileId =
      typeof req.params.fileId === "string"
        ? req.params.fileId
        : req.params.fileId.join("/");
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) {
      res.status(404).json({ error: "File not found." });
      return;
    }
    try {
      const file = await storage.getTenantFile(
        currentMember(res).tenantId,
        fileId,
      );
      if (!file) {
        res.status(404).json({ error: "File not found." });
        return;
      }
      const [metadata] = await file.getMetadata();
      res.setHeader(
        "Content-Type",
        (metadata.contentType as string) || "application/octet-stream",
      );
      res.setHeader("Content-Disposition", 'attachment; filename="FlowBuilder-upload"');
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      file.createReadStream().on("error", (error) => {
        req.log.error({ err: error }, "Failed to stream private file");
        if (!res.headersSent) res.status(500).end();
        else res.destroy(error);
      }).pipe(res);
    } catch (error) {
      req.log.error({ err: error }, "Failed to read private file");
      res.status(500).json({ error: "Could not download the file." });
    }
  },
);

router.get(
  "/storage/public-objects/*filePath",
  async (req, res): Promise<void> => {
    const rawPath = req.params.filePath;
    const filePath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    try {
      const file = await storage.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "File not found." });
        return;
      }
      const [metadata] = await file.getMetadata();
      res.setHeader(
        "Content-Type",
        (metadata.contentType as string) || "application/octet-stream",
      );
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      file.createReadStream().pipe(res);
    } catch (error) {
      req.log.error({ err: error }, "Failed to serve public object");
      res.status(500).json({ error: "Could not serve the file." });
    }
  },
);

export default router;
