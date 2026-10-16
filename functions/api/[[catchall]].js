export async function onRequest(context) {
  const { request } = context;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "*",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    const url = new URL(request.url);
    const targetPath = url.pathname.replace(/^\/api/, "") || "/";
    const targetUrl = `https://iipkxcmrrutvmvztvwva.supabase.co${targetPath}${url.search}`;

    const headers = new Headers();
    const forwardedHeaders = [
      "apikey",
      "authorization",
      "content-type",
      "prefer",
      "range",
      "accept",
      "x-client-info",
    ];

    for (const [key, value] of request.headers.entries()) {
      const lower = key.toLowerCase();
      if (forwardedHeaders.includes(lower) || lower.startsWith("x-")) {
        headers.set(key, value);
      }
    }
    headers.set("host", "iipkxcmrrutvmvztvwva.supabase.co");

    let body = null;
    if (!["GET", "HEAD"].includes(request.method)) {
      body = await request.arrayBuffer();
    }

    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: body,
      redirect: "follow",
    });

    // Buffer the body into memory to force Cloudflare to decompress the stream
    const responseData = await response.arrayBuffer();

    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      const lower = key.toLowerCase();
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(lower)) {
        responseHeaders.set(key, value);
      }
    }
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Expose-Headers", "*");

    return new Response(responseData, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Proxy exception" }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}