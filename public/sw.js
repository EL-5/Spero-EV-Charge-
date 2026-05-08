const CACHE_NAME = 'scms-v1';
const OFFLINE_URL = '/offline';

const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/spero-logo.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('/dashboard');
        }
      });
    })
  );
});

// Background sync for offline sessions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sessions') {
    event.waitUntil(syncOfflineSessions());
  }
});

async function syncOfflineSessions() {
  // Sync offline-recorded sessions when connectivity restores
  const db = await openDB();
  const sessions = await getOfflineSessions(db);
  for (const session of sessions) {
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      await removeOfflineSession(db, session.id);
    } catch (e) {
      console.error('Sync failed for session', session.id);
    }
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('scms-offline', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getOfflineSessions(db) {
  return new Promise((resolve) => {
    const tx = db.transaction('offline_sessions', 'readonly');
    const req = tx.objectStore('offline_sessions').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

function removeOfflineSession(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction('offline_sessions', 'readwrite');
    tx.objectStore('offline_sessions').delete(id);
    tx.oncomplete = resolve;
  });
}
