import type { ChordEvent, TakeReport } from '@sur/shared-types';

const DATABASE_NAME = 'sur-local-audio';
const DATABASE_VERSION = 1;

export interface PersistedTake {
  readonly id: string;
  readonly createdAt: string;
  readonly sampleRate: number;
  readonly durationMs: number;
  readonly chordEvents: readonly ChordEvent[];
  readonly report: TakeReport;
  readonly voice: ArrayBuffer;
  readonly backingLeft: ArrayBuffer;
  readonly backingRight: ArrayBuffer;
}

interface StoredChunk {
  readonly recordingId: string;
  readonly index: number;
  readonly pcm: ArrayBuffer;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class LocalTakeStore {
  #database: Promise<IDBDatabase> | null = null;

  async appendVoiceChunk(recordingId: string, index: number, pcm: Float32Array): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction('recordingChunks', 'readwrite');
    const pcmCopy = new ArrayBuffer(pcm.byteLength);
    new Float32Array(pcmCopy).set(pcm);
    const chunk: StoredChunk = {
      recordingId,
      index,
      pcm: pcmCopy,
    };
    transaction.objectStore('recordingChunks').put(chunk);
    await transactionComplete(transaction);
  }

  async finalizeTake(take: PersistedTake): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction(['takes', 'recordingChunks'], 'readwrite');
    transaction.objectStore('takes').put(take);
    const chunks = transaction.objectStore('recordingChunks');
    const range = IDBKeyRange.bound([take.id, 0], [take.id, Number.MAX_SAFE_INTEGER]);
    chunks.delete(range);
    await transactionComplete(transaction);
  }

  async getTake(id: string): Promise<PersistedTake | undefined> {
    const database = await this.#open();
    const transaction = database.transaction('takes', 'readonly');
    return requestResult(
      transaction.objectStore('takes').get(id) as IDBRequest<PersistedTake | undefined>,
    );
  }

  async #open(): Promise<IDBDatabase> {
    if (this.#database) return this.#database;
    this.#database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('recordingChunks')) {
          database.createObjectStore('recordingChunks', { keyPath: ['recordingId', 'index'] });
        }
        if (!database.objectStoreNames.contains('takes')) {
          database.createObjectStore('takes', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Unable to open local audio store'));
    });
    return this.#database;
  }
}
