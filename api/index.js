export const config = { runtime: "edge" };

const streamingConfig = {
  platformName: "NovaStream Media Hub",
  version: "3.4.1",
  cacheControl: "public, max-age=3600",
  primaryMediaOrigin: (process.env.TARGET_DOMAIN || "").replace(/\/$/, "")
};

const droppedMediaHeaders = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

const videoPlatformHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${streamingConfig.platformName} - Premium Video Delivery</title>
    <style>
        :root { --bg: #0f0f11; --card: #18181c; --text: #e1e1e6; --accent: #8257e5; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); }
        header { padding: 1.5rem 5%; border-bottom: 1px solid #29292e; display: flex; justify-content: space-between; align-items: center; }
        header h1 { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
        header nav a { color: #a8a8b3; text-decoration: none; margin-left: 1.5rem; font-size: 0.9rem; }
        main { padding: 3rem 5%; }
        .hero { margin-bottom: 3rem; }
        .hero h2 { font-size: 2.5rem; margin-bottom: 1rem; }
        .hero p { color: #a8a8b3; font-size: 1.1rem; max-width: 600px; line-height: 1.6; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 2rem; }
        .video-card { background: var(--card); border-radius: 12px; overflow: hidden; border: 1px solid #29292e; }
        .thumbnail { width: 100%; height: 180px; background: #202024; display: flex; justify-content: center; align-items: center; position: relative; }
        .play-btn { width: 40px; height: 40px; background: rgba(130, 87, 229, 0.8); border-radius: 50%; position: absolute; }
        .info { padding: 1.2rem; }
        .info h3 { font-size: 1.1rem; margin-bottom: 0.5rem; }
        .info p { color: #a8a8b3; font-size: 0.85rem; display: flex; justify-content: space-between; }
        .badge { display: inline-block; padding: 4px 8px; background: rgba(130, 87, 229, 0.2); color: var(--accent); border-radius: 4px; font-size: 0.7rem; font-weight: bold; margin-bottom: 0.5rem; }
    </style>
</head>
<body>
    <header>
        <h1>${streamingConfig.platformName}</h1>
    </header>
    <main>
        <section class="hero">
            <h2>Unlimited High-Definition Streaming</h2>
            <p>Our edge delivery network ensures buffer-free playback for 4K and 8K media content worldwide.</p>
        </section>
        <section class="grid">
            <div class="video-card"><div class="thumbnail"><div class="play-btn"></div></div><div class="info"><span class="badge">4K HDR</span><h3>Nature's Wonders</h3></div></div>
            <div class="video-card"><div class="thumbnail"><div class="play-btn"></div></div><div class="info"><span class="badge">1080p</span><h3>Cyberpunk Cityscapes</h3></div></div>
        </section>
    </main>
</body>
</html>
`;

export default async function mediaDeliveryHandler(clientRequest) {
  if (!streamingConfig.primaryMediaOrigin) {
    return new Response("Origin not set", { status: 500 });
  }

  try {
    const requestUrl = new URL(clientRequest.url);
    
    // ترفند هوشمند: بررسی می‌کنیم آیا درخواست دهنده واقعاً یک مرورگر وب است؟
    const acceptHeader = clientRequest.headers.get("accept") || "";
    const isBrowserRequest = acceptHeader.includes("text/html");

    // صفحه فیک فقط به مرورگرها نشون داده میشه، نه به v2rayNG!
    if ((requestUrl.pathname === "/" || requestUrl.pathname === "/browse") && isBrowserRequest) {
      return new Response(videoPlatformHTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (requestUrl.pathname === "/api/v1/media/catalog" && isBrowserRequest) {
      return new Response(JSON.stringify({ status: "success", serverLoad: "42%" }), {
        headers: { "Content-Type": "application/json", "Cache-Control": streamingConfig.cacheControl }
      });
    }

    // منطق پراکسی برای V2ray (چون isBrowserRequest براش false میشه، مستقیم میاد اینجا)
    const pathPrefixIndex = clientRequest.url.indexOf("/", 8);
    const originEndpoint =
      pathPrefixIndex === -1 
        ? streamingConfig.primaryMediaOrigin + "/" 
        : streamingConfig.primaryMediaOrigin + clientRequest.url.slice(pathPrefixIndex);

    const cdnHeaders = new Headers();
    let viewerIP = null;

    for (const [key, value] of clientRequest.headers) {
      const lowerKey = key.toLowerCase();
      if (droppedMediaHeaders.has(lowerKey)) continue;
      if (lowerKey.startsWith("x-vercel-")) continue;
      
      if (lowerKey === "x-real-ip") {
        viewerIP = value;
        continue;
      }
      if (lowerKey === "x-forwarded-for") {
        if (!viewerIP) viewerIP = value;
        continue;
      }
      cdnHeaders.set(key, value);
    }
    
    if (viewerIP) cdnHeaders.set("x-forwarded-for", viewerIP);

    const reqMethod = clientRequest.method;
    const isStreamUpload = reqMethod !== "GET" && reqMethod !== "HEAD";

    return await fetch(originEndpoint, {
      method: reqMethod,
      headers: cdnHeaders,
      body: isStreamUpload ? clientRequest.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

  } catch (deliveryError) {
    console.error("Delivery Failed:", deliveryError);
    return new Response("Media Buffer Timeout", { status: 504 });
  }
}
