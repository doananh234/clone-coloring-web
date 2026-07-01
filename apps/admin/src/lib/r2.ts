import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { normalizeAssetPath, resolveAssetUrl } from "@vx/core-uikit/utils";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

export function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = (
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    ""
  ).replace(/\/$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2 environment variables not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)",
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function guessContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export async function uploadToR2(params: {
  client: S3Client;
  config: R2Config;
  key: string;
  body: Buffer;
  contentType?: string;
}): Promise<{ key: string; url: string }> {
  const { client, config, key, body, contentType } = params;
  const ct = contentType || guessContentType(key);

  if (!key.startsWith("assets/")) {
    const msg = `[r2] uploadToR2 key must start with "assets/" — got: ${key}`;
    if (process.env.NODE_ENV !== "production") throw new Error(msg);
    console.warn(msg);
  }

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: ct,
    }),
  );

  const url = normalizeAssetPath(`/${key}`) ?? `/${key}`;
  return { key, url };
}

/**
 * Generate a presigned PUT URL for direct browser-to-R2 upload.
 */
export async function getPresignedUploadUrl(params: {
  client: S3Client;
  config: R2Config;
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<{ uploadUrl: string; key: string }> {
  const { client, config, key, contentType, expiresIn = 3600 } = params;
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploadUrl = await getSignedUrl(client as any, command as any, { expiresIn });
  return { uploadUrl, key };
}

/**
 * Resolve a stored relative path to a full URL for server-side fetching.
 * Handles all legacy shapes via the shared normalizer.
 */
export function resolveR2Url(url: string): string {
  const base =
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    "";
  return resolveAssetUrl(url, base);
}
