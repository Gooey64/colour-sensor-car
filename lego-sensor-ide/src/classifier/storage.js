import { openDB } from 'idb';

const DB_NAME = 'lego-sensor-ide';
const DB_VERSION = 2;
const STORE = 'readings';
const LEGACY_CLASS_STORE = 'classes';

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('label', 'label');
      }
      // v1 stored one record per class, each holding its own samples array.
      // Fold those into individual (now-labeled) readings so old captures
      // aren't lost, then drop the old store.
      if (oldVersion < 2 && db.objectStoreNames.contains(LEGACY_CLASS_STORE)) {
        const store = transaction.objectStore(STORE);
        const legacyClasses = await transaction.objectStore(LEGACY_CLASS_STORE).getAll();
        for (const cls of legacyClasses) {
          for (const rgb of cls.samples || []) {
            await store.add({ rgb, label: cls.name, capturedAt: Date.now() });
          }
        }
        db.deleteObjectStore(LEGACY_CLASS_STORE);
      }
    },
  });
}

// Shape stored per reading: { id, rgb: [r,g,b], label: string|null, capturedAt: number }

export async function loadAllReadings() {
  const db = await getDb();
  return db.getAll(STORE);
}

export async function addReading(reading) {
  const db = await getDb();
  return db.add(STORE, reading);
}

export async function updateReading(reading) {
  const db = await getDb();
  await db.put(STORE, reading);
}

export async function deleteReading(id) {
  const db = await getDb();
  await db.delete(STORE, id);
}
