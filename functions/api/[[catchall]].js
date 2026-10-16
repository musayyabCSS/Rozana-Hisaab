export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const SUPABASE_HOST = 'iipkxcmrrutvmvztvwva.supabase.co';

  // Map /api/... to Supabase root
  const targetPath = url.pathname.replace(/^\/api/, '') || '/';
  const targetUrl = new URL(targetPath + url.search, `https://${SUPABASE_HOST}`);

  // Forward request headers with the correct target Host
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('Host', SUPABASE_HOST);
  reqHeaders.delete('cf-connecting-ip');
  reqHeaders.delete('x-real-ip');

  // CRITICAL: redirect: 'manual' tells Cloudflare NOT to swallow OAuth redirects
  const response = await fetch(targetUrl.toString(), {
    method: request.method,
    headers: reqHeaders,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
  });

  const resHeaders = new Headers(response.headers);
  resHeaders.delete('content-encoding');
  resHeaders.delete('content-length');

  // Ensure redirect Location headers stay aligned
  const location = resHeaders.get('Location');
  if (location && location.startsWith(`https://${SUPABASE_HOST}`)) {
    resHeaders.set('Location', location.replace(`https://${SUPABASE_HOST}`, `${url.origin}/api`));
  }

  const isNoBodyStatus = [204, 205, 304].includes(response.status);
  const body = isNoBodyStatus ? null : await response.arrayBuffer();

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: resHeaders,
  });
}