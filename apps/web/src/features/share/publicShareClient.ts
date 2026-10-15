import { publicShareSchema, type PublicShare } from '@sur/shared-types';

export class PublicShareRequestError extends Error {
  constructor(readonly status: number) {
    super(status === 410 ? 'This share has expired or was removed.' : 'Unable to load this share.');
    this.name = 'PublicShareRequestError';
  }
}

export async function getPublicShare(slug: string, signal: AbortSignal): Promise<PublicShare> {
  const environment = import.meta.env as Record<string, unknown>;
  const configuredBaseUrl = environment['VITE_API_BASE_URL'];
  const baseUrl =
    typeof configuredBaseUrl === 'string' ? configuredBaseUrl : 'http://127.0.0.1:3000/api/v1';
  const response = await fetch(`${baseUrl}/public/shares/${encodeURIComponent(slug)}`, { signal });
  if (!response.ok) throw new PublicShareRequestError(response.status);
  return publicShareSchema.parse(await response.json());
}
