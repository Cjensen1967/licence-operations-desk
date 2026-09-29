"use strict";

const DB_NAME = "wsgc-roster-workbench";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("properties")) db.createObjectStore("properties", { keyPath: "accountId" });
      if (!db.objectStoreNames.contains("snapshots")) {
        const store = db.createObjectStore("snapshots", { keyPath: "id" });
        store.createIndex("accountId", "accountId", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(storeName, mode, operation) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try { result = operation(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Database operation aborted."));
  }).finally(() => db.close());
}

const requestValue = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const DB = {
  async getProperties() {
    const db = await openDb();
    try { return await requestValue(db.transaction("properties").objectStore("properties").getAll()); }
    finally { db.close(); }
  },
  putProperty(property) { return transaction("properties", "readwrite", (store) => store.put(property)); },
  deleteProperty(accountId) { return transaction("properties", "readwrite", (store) => store.delete(accountId)); },
  async getSnapshots(accountId) {
    const db = await openDb();
    try {
      const index = db.transaction("snapshots").objectStore("snapshots").index("accountId");
      const values = await requestValue(index.getAll(IDBKeyRange.only(accountId)));
      return values.sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt));
    } finally { db.close(); }
  },
  async putSnapshot(snapshot) {
    await transaction("snapshots", "readwrite", (store) => store.put(snapshot));
    const values = await this.getSnapshots(snapshot.accountId);
    for (const old of values.slice(12)) await transaction("snapshots", "readwrite", (store) => store.delete(old.id));
  },
  async clearAll() {
    for (const name of ["properties", "snapshots", "settings"]) await transaction(name, "readwrite", (store) => store.clear());
  },
};
