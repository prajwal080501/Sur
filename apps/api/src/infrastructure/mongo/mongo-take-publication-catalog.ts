import type { RenderableTake, TakeJobCatalog } from '@sur/job-domain';
import type { ShareableTake, TakeShareCatalog } from '@sur/share-domain';
import type { Collection } from 'mongodb';

/** Materialized read model updated when a take becomes cloud-ready. */
export interface TakePublicationDocument extends Omit<ShareableTake, 'id'> {
  readonly _id: string;
}

export class MongoTakePublicationCatalog implements TakeShareCatalog, TakeJobCatalog {
  constructor(private readonly collection: Collection<TakePublicationDocument>) {}

  async findOwned(takeId: string, ownerId: string): Promise<ShareableTake | null> {
    const document = await this.collection.findOne({ _id: takeId, ownerId });
    if (!document) return null;
    const take: ShareableTake & RenderableTake = {
      id: document._id,
      ownerId: document.ownerId,
      title: document.title,
      singer: document.singer,
      key: document.key,
      tempoBpm: document.tempoBpm,
      chords: document.chords,
      audioObjectKey: document.audioObjectKey,
      videoObjectKey: document.videoObjectKey,
      containsThirdPartyStems: document.containsThirdPartyStems,
    };
    return take;
  }
}
