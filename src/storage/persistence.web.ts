import type { Persistence } from '../../packages/core/store';
import type { AppState } from '../../packages/core/model';
let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('training-v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('state');
      request.result.createObjectStore('media');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export const persistence: Persistence = {
  async load(scope) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('state', 'readonly');
      const r = t.objectStore('state').get(scope);
      r.onsuccess = () => resolve(r.result as AppState | undefined);
      r.onerror = () => reject(r.error);
    });
  },
  async save(state) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('state', 'readwrite');
      t.objectStore('state').put(state, state.scope);
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error);
      t.onerror = () => reject(t.error);
    });
  },
};
export async function putMedia(id: string, blob: Blob) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('media', 'readwrite');
    t.objectStore('media').put(blob, id);
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error);
  });
}
export async function getMedia(id: string): Promise<Blob | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('media').objectStore('media').get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
