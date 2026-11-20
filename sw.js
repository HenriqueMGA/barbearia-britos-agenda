/* ==========================================================
   Barbearia Britos - service worker do painel
   Deixa o painel instalável e abrindo mesmo sem internet.
   Estratégia "rede primeiro": com internet, sempre busca a versão mais nova
   dos arquivos (e guarda uma cópia); sem internet, usa a cópia guardada.
   Os dados da API (agendamentos, folgas) NÃO são guardados: sem internet o
   painel abre e avisa que não conseguiu carregar, em vez de mostrar dados velhos.
   Ao mudar a lista abaixo ou a estratégia, troque o número de VERSAO.
   ========================================================== */
var VERSAO = "britos-painel-v1";

// páginas guardadas já na instalação, para abrirem offline mesmo sem visita anterior
var PAGINAS = ["./", "index.html", "calendario.html", "folgas.html"];

self.addEventListener("install", function (ev) {
  ev.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(PAGINAS); }));
  self.skipWaiting();
});

// apaga as cópias de versões antigas
self.addEventListener("activate", function (ev) {
  ev.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n !== VERSAO; })
      .map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  // só arquivos do próprio painel; a API (outro endereço) passa direto
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  ev.respondWith(
    fetch(req).then(function (res) {
      if (res.ok) {
        var copia = res.clone();
        caches.open(VERSAO).then(function (c) { c.put(req, copia); });
      }
      return res;
    }).catch(function () {
      // sem internet: a cópia guardada (ignorando ?dia=, ?editar= e ?v=)
      return caches.match(req, { ignoreSearch: true });
    })
  );
});
