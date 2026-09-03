import { createServer, type IncomingMessage } from "node:http";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";
import { animatePage, type AnimateOptions } from "./pipeline";

const PORT = Number(process.env.PORT || process.env.MOTION_PORT || 7801);

type AnimateBody = AnimateOptions & { imageUrl?: string; key?: string };

function readJson(req: IncomingMessage): Promise<AnimateBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as AnimateBody) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("ok");
  }
  if (req.method === "POST" && req.url === "/animate") {
    const started = Date.now();
    try {
      const { imageUrl, key, ...opts } = await readJson(req);
      if (!imageUrl) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "imageUrl is required" }));
      }
      const mp4 = await animatePage(imageUrl, opts);

      // With a `key`, upload the MP4 to R2 and return its URL; otherwise stream
      // the MP4 bytes back directly (useful for local testing).
      if (key) {
        const config = getR2Config();
        const client = createR2Client(config);
        const { url } = await uploadToR2({ client, config, key, body: mp4, contentType: "video/mp4" });
        console.log(`[motion] animated ${imageUrl} → ${key} (${mp4.length} bytes, ${Date.now() - started}ms)`);
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ success: true, url: `${url}?v=${Date.now()}`, bytes: mp4.length }));
      }
      res.writeHead(200, { "content-type": "video/mp4", "content-length": String(mp4.length) });
      return res.end(mp4);
    } catch (error) {
      console.error("[motion] /animate error:", error);
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => console.log(`[motion] listening on :${PORT}`));
