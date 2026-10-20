import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AiErrorKind =
  | 'auth'
  | 'limit'
  | 'too_large'
  | 'invalid'
  | 'server'
  | 'network';

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: AiErrorKind; message: string };

type AiProxyRequest =
  | { action: 'transcribe'; audioBase64: string; mimeType: string; prompt?: string }
  | { action: 'parse-voice'; text: string; today?: string }
  | { action: 'receipt'; imageBase64: string };

interface ProxyErrorBody {
  error?: { message?: string };
}

function errorKindForStatus(status: number): AiErrorKind {
  if (status === 401) return 'auth';
  if (status === 429) return 'limit';
  if (status === 413) return 'too_large';
  if (status === 400) return 'invalid';
  return 'server';
}

async function getHttpErrorMessage(error: FunctionsHttpError): Promise<string> {
  try {
    const body: unknown = await error.context.clone().json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as ProxyErrorBody).error?.message === 'string'
    ) {
      return (body as ProxyErrorBody).error?.message ?? 'AI request failed.';
    }
  } catch {
    return 'AI request failed.';
  }
  return 'AI request failed.';
}

async function invokeOnce<T>(request: AiProxyRequest): Promise<AiResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<T>('ai-proxy', {
      body: request,
    });
    if (!error && data !== null) return { ok: true, data };
    if (!error) {
      return { ok: false, kind: 'server', message: 'AI service returned no data.' };
    }
    if (error instanceof FunctionsHttpError) {
      const status = error.context.status;
      console.warn('AI proxy request failed', { action: request.action, status });
      return {
        ok: false,
        kind: errorKindForStatus(status),
        message: await getHttpErrorMessage(error),
      };
    }
    console.warn('AI proxy request failed', { action: request.action });
    return { ok: false, kind: 'network', message: 'Could not reach the AI service.' };
  } catch {
    console.warn('AI proxy request failed', { action: request.action });
    return { ok: false, kind: 'network', message: 'Could not reach the AI service.' };
  }
}

export async function invokeAiProxy<T>(request: AiProxyRequest): Promise<AiResult<T>> {
  const result = await invokeOnce<T>(request);
  if (result.ok || result.kind !== 'auth') return result;

  try {
    await supabase.auth.refreshSession();
  } catch {
    console.warn('AI session refresh failed', { action: request.action });
  }
  return invokeOnce<T>(request);
}
