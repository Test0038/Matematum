// Matematum — Service Worker
// Стратегия: приложение отдаётся из кэша мгновенно, свежая версия подтягивается
// в фоне и применяется со следующего запуска. Шрифты кэшируются при первом обращении.
const CACHE = 'matematum-v3-audit';
const PRECACHE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.startsWith('matematum-') && k !== CACHE).map(async k => {
                // Сохраняем уже загруженные шрифты при обновлении приложения.
                try {
                    const old = await caches.open(k), current = await caches.open(CACHE);
                    for (const req of await old.keys()) {
                        const host = new URL(req.url).hostname;
                        if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') {
                            if (!(await current.match(req))) await current.put(req, await old.match(req));
                        }
                    }
                    await caches.delete(k);
                } catch (_) { /* При ошибке хранения оставляем старый кэш шрифтов. */ }
            })))
            .then(() => self.clients.claim())
    );
});

async function storeResponse(req, res) {
    if (res && (res.ok || res.type === 'opaque')) {
        try { await (await caches.open(CACHE)).put(req, res.clone()); } catch (_) {}
    }
    return res;
}

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Шрифты Google: кэш → сеть, ответ сохраняем
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        const response = caches.match(req).catch(() => undefined)
            .then(hit => hit || fetch(req).then(res => storeResponse(req, res)));
        e.respondWith(response);
        e.waitUntil(response.then(() => {}, () => {}));
        return;
    }

    // Свои файлы: из кэша мгновенно, в фоне обновляем кэш
    if (url.origin === self.location.origin) {
        const cached = caches.match(req, { ignoreSearch: true }).catch(() => undefined);
        const refresh = fetch(req).then(res => storeResponse(req, res))
            .catch(async () => (await cached) || Response.error());
        e.waitUntil(refresh.then(() => {}));
        e.respondWith(cached.then(hit => hit || refresh));
    }
});
