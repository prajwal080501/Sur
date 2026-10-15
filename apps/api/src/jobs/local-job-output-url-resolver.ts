import type { JobOutputKeys, JobOutputUrlResolver } from '@sur/job-domain';

function objectUrl(baseUrl: string, objectKey: string): string {
  const encoded = objectKey.split('/').map(encodeURIComponent).join('/');
  return new URL(encoded, baseUrl).href;
}

export class LocalJobOutputUrlResolver implements JobOutputUrlResolver {
  constructor(private readonly baseUrl: string) {
    new URL(baseUrl);
  }

  resolve(keys: JobOutputKeys) {
    return Promise.resolve({
      videoUrl: objectUrl(this.baseUrl, keys.videoObjectKey),
      posterUrl: keys.posterObjectKey ? objectUrl(this.baseUrl, keys.posterObjectKey) : null,
    });
  }
}
