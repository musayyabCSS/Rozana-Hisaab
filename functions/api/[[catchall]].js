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
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    const url = new URL(request.url);
    const targetPath = url.pathname.replace(/^\/api/, "") || "/";
    const targetUrl = `https://iipkxcmrrutvmvztvwva.supabase.co${targetPath}${url.search}`;

    // Forward only the headers required by Supabase
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
      const lowerKey = key.toLowerCase();
      if (forwardedHeaders.includes(lowerKey) || lowerKey.startsWith("x-")) {
        headers.set(key, value);
      }
    }

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

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    // Prevent ERR_CONNECTION_RESET: Cloudflare decompresses the body,
    // so content-encoding and content-length must be removed.
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Proxy error" }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
