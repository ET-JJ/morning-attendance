/**
 * 서비스 워커 - 캐싱 및 오프라인 지원
 */

const CACHE_NAME = 'morning-attendance-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/status.html',
  '/student.html',
  '/api.js',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
];

// 서비스 워커 설치
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('📦 캐시 파일 저장 중...');
        return cache.addAll(urlsToCache);
      })
  );
});

// 네트워크 요청 가로채기
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // 캐시에 있으면 캐시 반환, 없으면 네트워크 요청
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});