// ═══════════════════════════════════════════════════════════════════════════
// Service Worker — Barbearia PWA
// ═══════════════════════════════════════════════════════════════════════════
//
// Estratégia:
//   - "App shell" (HTML + ícones + manifest): cache-first com fallback à rede
//     → app abre rápido mesmo offline, mostrando a interface conhecida.
//   - Tudo que vem do Firebase (Firestore, Storage, Auth) → sempre via rede
//     → dados em tempo real, nunca usar cache stale de agendamentos.
//
// Cache version: muda o número quando atualizar arquivos da shell. Browsers
// vão limpar o cache antigo automaticamente.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'barbearia-shell-v6';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/maskable_icon_x192.png',
  '/maskable_icon_x512.png',
];

// INSTALL: pré-carrega arquivos da shell no cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting(); // ativa imediatamente o SW novo
});

// ACTIVATE: limpa caches antigos (de versões anteriores)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n.startsWith('barbearia-shell-') && n !== CACHE_VERSION)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim(); // controla as abas abertas imediatamente
});

// FETCH: intercepta requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Não intercepta requests pro Firebase nem qualquer API externa
  // (precisam sempre ir pra rede, não pode servir do cache)
  if (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('firebaseio.com') ||
    url.hostname.endsWith('firebaseapp.com') ||
    url.hostname.endsWith('firebasestorage.app') ||
    url.hostname.endsWith('gstatic.com')
  ) {
    return; // deixa o browser fazer normal
  }

  // Digital Asset Links e arquivos .well-known: sempre rede, nunca cache.
  // (Google verifica esse arquivo pra TWA — precisa ser sempre a versão atual)
  if (url.pathname.startsWith('/.well-known/')) {
    return;
  }

  // Pra arquivos da shell e do próprio domínio: cache-first
  // (busca no cache, se não tiver, busca na rede e cacheia)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Só cacheia respostas OK (200) GET do mesmo domínio
          if (
            event.request.method === 'GET' &&
            response.status === 200 &&
            url.origin === self.location.origin
          ) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline e sem cache: pra navegação, devolve o index.html cacheado
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
