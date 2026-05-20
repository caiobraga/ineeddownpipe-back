import type { Request, Response } from "express";

const ALLOWED_HOSTS = new Set([
  "assets.turnermotorsport.com",
  "www.turnermotorsport.com",
]);

const REFERERS: Record<string, string> = {
  "assets.turnermotorsport.com": "https://www.turnermotorsport.com/",
};

export async function handleImageProxy(req: Request, res: Response) {
  const raw = req.query.url;
  if (typeof raw !== "string" || !raw.trim()) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return res.status(400).json({ error: "Invalid url" });
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(403).json({ error: "Host not allowed" });
  }

  const referer = REFERERS[parsed.hostname] ?? parsed.origin;

  try {
    const upstream = await fetch(parsed.href, {
      headers: {
        Referer: referer,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch {
    res.status(502).json({ error: "Failed to fetch image" });
  }
}
