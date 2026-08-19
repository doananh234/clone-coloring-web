import { describe, it, expect, vi } from "vitest";
import { uploadToR2, type R2Config } from "./r2";

const config: R2Config = {
  accountId: "acc",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucket: "bucket",
  publicBaseUrl: "",
};

describe("uploadToR2", () => {
  it("forwards cacheControl + contentDisposition to the PutObjectCommand input", async () => {
    const send = vi.fn().mockResolvedValue({});
    // uploadToR2 takes the client as a param, so a stub with `send` is enough.
    const client = { send } as unknown as import("@aws-sdk/client-s3").S3Client;

    const { url } = await uploadToR2({
      client,
      config,
      key: "assets/b1/exports/export.zip",
      body: Buffer.from("zip-bytes"),
      contentType: "application/zip",
      cacheControl: "no-cache",
      contentDisposition: 'attachment; filename="Cute farm.zip"',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input.Key).toBe("assets/b1/exports/export.zip");
    expect(cmd.input.ContentType).toBe("application/zip");
    expect(cmd.input.CacheControl).toBe("no-cache");
    expect(cmd.input.ContentDisposition).toBe('attachment; filename="Cute farm.zip"');
    expect(url).toBe("/assets/b1/exports/export.zip");
  });

  it("omits the optional headers when not provided", async () => {
    const send = vi.fn().mockResolvedValue({});
    const client = { send } as unknown as import("@aws-sdk/client-s3").S3Client;
    await uploadToR2({ client, config, key: "assets/b1/x.png", body: Buffer.from("x") });
    const cmd = send.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input.CacheControl).toBeUndefined();
    expect(cmd.input.ContentDisposition).toBeUndefined();
  });
});
