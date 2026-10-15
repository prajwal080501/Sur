import type { PublicShare } from '@sur/shared-types';
import type { ShareRecord, ShareRepository } from './share-service.js';

export class InMemoryShareRepository implements ShareRepository {
  readonly #records = new Map<string, ShareRecord>();

  reserve(record: ShareRecord): Promise<boolean> {
    if (this.#records.has(record.slug)) return Promise.resolve(false);
    this.#records.set(record.slug, { ...record });
    return Promise.resolve(true);
  }

  activate(slug: string, publicData: PublicShare): Promise<void> {
    const record = this.#records.get(slug);
    if (!record || record.state !== 'provisioning') {
      return Promise.reject(new Error('Share reservation does not exist'));
    }
    this.#records.set(slug, { ...record, state: 'active', publicData });
    return Promise.resolve();
  }

  releaseReservation(slug: string, ownerId: string): Promise<void> {
    const record = this.#records.get(slug);
    if (record?.ownerId === ownerId && record.state === 'provisioning') {
      this.#records.delete(slug);
    }
    return Promise.resolve();
  }

  findBySlug(slug: string): Promise<ShareRecord | null> {
    return Promise.resolve(this.#records.get(slug) ?? null);
  }

  revoke(slug: string, ownerId: string, revokedAt: Date): Promise<boolean> {
    const record = this.#records.get(slug);
    if (!record || record.ownerId !== ownerId) return Promise.resolve(false);
    this.#records.set(slug, { ...record, revokedAt });
    return Promise.resolve(true);
  }
}
