import { randomUUID } from "crypto";
import { File, Storage } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";

const client = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Invalid object storage path.");
  }
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

function privateObjectDir(): string {
  const directory = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!directory) {
    throw new Error("Private object storage is not configured.");
  }
  return directory.replace(/\/+$/, "");
}

function tenantObjectPath(tenantId: string, fileId: string): string {
  return `${privateObjectDir()}/tenants/${tenantId}/uploads/${fileId}`;
}

async function signPutUrl(bucketName: string, objectName: string): Promise<string> {
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Could not create upload URL (${response.status}).`);
  }
  const result = (await response.json()) as { signed_url?: string };
  if (!result.signed_url) throw new Error("Upload URL was not returned.");
  return result.signed_url;
}

export class ObjectStorageService {
  async createTenantUpload(tenantId: string): Promise<{
    uploadURL: string;
    fileId: string;
  }> {
    const fileId = randomUUID();
    const { bucketName, objectName } = parseObjectPath(
      tenantObjectPath(tenantId, fileId),
    );
    return {
      uploadURL: await signPutUrl(bucketName, objectName),
      fileId,
    };
  }

  async getTenantFile(
    tenantId: string,
    fileId: string,
  ): Promise<File | null> {
    const { bucketName, objectName } = parseObjectPath(
      tenantObjectPath(tenantId, fileId),
    );
    const file = client.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    return exists ? file : null;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    const safePath = filePath
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/");
    const searchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "")
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean);
    for (const searchPath of searchPaths) {
      const { bucketName, objectName } = parseObjectPath(
        `${searchPath.replace(/\/+$/, "")}/${safePath}`,
      );
      const file = client.bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }
}
