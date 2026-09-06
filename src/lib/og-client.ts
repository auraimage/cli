import type { OgContext } from './og-env.js';

/**
 * Thin client for the edge's OG template routes (ADR 0032). The edge owns
 * validation and decorates every JSON response with the public Render URL, so
 * this module forwards requests and passes messages through verbatim — it never
 * re-encodes the Render URL grammar.
 */

export interface OgTemplateSummary {
  name: string;
  version: string;
  width: number;
  height: number;
  quality: number;
  fonts: string[];
  defaults: Record<string, string>;
  variables: Record<string, 'text' | 'image'>;
  createdAt: string;
  updatedAt: string;
  /** Public Render URL, added by the edge. */
  url: string;
}

export interface OgPushBody {
  html: string;
  width: number;
  height: number;
  fonts: string[];
  defaults: Record<string, string>;
  quality?: number;
}

export class OgRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'OgRequestError';
  }
}

function templatesUrl(ctx: OgContext, name?: string): string {
  const base = `${ctx.cdnUrl}/v1/og-templates/${encodeURIComponent(ctx.projectName)}`;
  return name === undefined ? base : `${base}/${encodeURIComponent(name)}`;
}

async function failure(res: Response): Promise<OgRequestError> {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return new OgRequestError(body.message ?? `Request failed (${res.status})`, res.status);
}

export async function pushTemplate(
  ctx: OgContext,
  name: string,
  body: OgPushBody
): Promise<OgTemplateSummary & { created: boolean }> {
  const res = await fetch(templatesUrl(ctx, name), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${ctx.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as OgTemplateSummary & { created: boolean };
}

export async function listTemplates(ctx: OgContext): Promise<OgTemplateSummary[]> {
  const res = await fetch(templatesUrl(ctx), { headers: { Authorization: `Bearer ${ctx.secretKey}` } });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { templates: OgTemplateSummary[] };
  return body.templates;
}

export async function deleteTemplate(ctx: OgContext, name: string): Promise<void> {
  const res = await fetch(templatesUrl(ctx, name), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ctx.secretKey}` }
  });
  if (!res.ok) throw await failure(res);
}
