// Matematum — Service Worker
// Стратегия: приложение отдаётся из кэша мгновенно, свежая версия подтягивается
// в фоне и применяется со следующего запуска. Шрифты кэшируются при первом обращении.
const CACHE = 'matematum-v1';
const PRECACHE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Шрифты Google: кэш → сеть, ответ сохраняем
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        e.respondWith(
            caches.match(req).then(hit => hit || fetch(req).then(res => {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put(req, copy));
                return res;
            }))
        );
        return;
    }

    // Свои файлы: из кэша мгновенно, в фоне обновляем кэш
    if (url.origin === self.location.origin) {
        e.respondWith(
            caches.match(req, { ignoreSearch: true }).then(hit => {
                const refresh = fetch(req).then(res => {
                    if (res && res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE).then(c => c.put(req, copy));
                    }
                    return res;
                }).catch(() => hit);
                return hit || refresh;
            })
        );
    }
});
