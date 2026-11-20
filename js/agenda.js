/* ==========================================================
   Barbearia Britos - agenda do dia (usa o script.js)
   IDs esperados no HTML: titulo, aviso, s-qtd, s-livres, s-rec,
   s-prox-rotulo, s-prox, s-prox2, lista, week, prev, next, hoje,
   marcar-folga
   Botões de filtro: elementos com o atributo data-f
   ("todos", "ocupados", "livres")
   ========================================================== */
(function () {
  "use strict";

  var B = window.Britos;
  var DS = B.DS, MS = B.MS, $ = B.$, key = B.key;
  var startDay = B.startDay, agendamentos = B.agendamentos;
  var el = B.el, detalhes = B.detalhes, txt = B.txt, brl = B.brl;

  /* ---------- Estado e navegação de datas ---------- */
  // Abre no dia pedido pelo link do calendário (index.html?dia=AAAA-MM-DD) ou hoje
  function diaInicial() {
    var q = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URLSearchParams(location.search).get("dia") || "");
    return startDay(q ? new Date(+q[1], q[2] - 1, +q[3]) : new Date());
  }

  var state = { dia: diaInicial(), f: "todos" };

  // Dia que o botão "Hoje" mostra (no domingo, a segunda seguinte)
  function diaAtual() { return key(startDay(new Date())); }

  // Move n dias pulando o domingo
  function move(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    if (x.getDay() === 0) x.setDate(x.getDate() + (n > 0 ? 1 : -1));
    return x;
  }

  // Resume o que muda com o passar do tempo; se não mudou, não precisa redesenhar
  function situacao() {
    var now = new Date();
    var agora = now.getHours() * 60 + now.getMinutes();
    var hoje = key(state.dia) === key(now);
    var passados = hoje
      ? B.marcados(agendamentos(state.dia)).filter(function (a) { return a.min < agora; }).length
      : 0;
    return key(now) + "|" + key(state.dia) + "|" + passados;
  }
  var ultimaSituacao = "";

  /* ---------- Dados do período ---------- */
  // Segunda a sábado da semana do dia escolhido (o que a tela mostra)
  function semana() {
    var d = state.dia;
    var seg = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return { de: key(seg), ate: key(new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + 5)) };
  }

  // Se a semana na tela ainda não foi baixada, pede o mês dela ao servidor (uma vez)
  // e devolve true enquanto espera. Só o período em uso é baixado, não o histórico todo.
  var pedido = "";
  function carregando() {
    var s = semana();
    if (B.pronto(s.de, s.ate)) return false;
    var p = B.periodoDoMes(state.dia);
    if (pedido !== p.de) {
      pedido = p.de;
      B.carregar(p.de, p.ate).then(render, render);
    }
    return true;
  }

  /* ---------- Renderização ---------- */
  function render() {
    var d = state.dia;
    var now = new Date();
    var k = key(d), kHoje = key(now);
    var hoje = k === kHoje;
    var passado = k < kHoje;                           // datas no formato AAAA-MM-DD comparam como texto
    var agora = now.getHours() * 60 + now.getMinutes();

    txt("titulo", DS[d.getDay()] + ", " + d.getDate() + " de " + MS[d.getMonth()]);

    // Domingo a barbearia fecha e o painel abre na segunda
    var aviso = $("aviso");
    aviso.hidden = !(now.getDay() === 0 && k === diaAtual());
    txt("aviso", "Hoje é domingo e a barbearia está fechada. Mostrando a agenda de segunda.");

    $("marcar-folga").href = "folgas.html?dia=" + k;

    // ainda buscando a semana (ou servidor fora do ar): resumo com "…" e aviso na lista
    if (carregando()) {
      ["s-qtd", "s-rec", "s-prox"].forEach(function (id) { txt(id, "…"); });
      ["s-livres", "s-prox2"].forEach(function (id) { txt(id, ""); });
      B.aviso($("lista"));
      week(true);
      return;
    }

    var all = agendamentos(d);
    var book = B.marcados(all);
    var folga = B.diaDeFolga(d);

    // Hoje: próximo a partir de agora. Dia futuro: primeiro do dia. Dia passado: nenhum.
    var prox = hoje
      ? book.filter(function (a) { return a.min >= agora; })[0]
      : (passado ? null : book[0]);

    // Resumo do dia
    txt("s-qtd", book.length);
    txt("s-livres", folga ? "Dia de folga" : B.livres(all).length + " horários livres");
    txt("s-rec", brl(book.reduce(function (s, a) { return s + a.val; }, 0)));
    txt("s-prox-rotulo", hoje || passado ? "Próximo cliente" : "Primeiro cliente");
    txt("s-prox", prox ? prox.hora : (passado ? "Encerrado" : "Nenhum"));
    txt("s-prox2", prox
      ? prox.cli + ", " + prox.svc
      : (hoje ? "Sem mais clientes hoje" : (passado ? "Dia já encerrado" : "")));

    // Lista de horários
    var ul = $("lista");
    ul.innerHTML = "";
    var c = 0;

    all.forEach(function (a) {
      if (state.f === "ocupados" && a.livre) return;
      if (state.f === "livres" && !a.livre) return;
      c++;

      if (a.folga) {
        ul.appendChild(B.itemFolga(a, recarregar));
        return;
      }

      var li = document.createElement("li");

      if (a.livre) {
        li.className = "free";
        li.append(el("time", null, a.hora), el("span", "who", "Livre"), el("span"));
      } else {
        // destaque de "Próximo" só faz sentido no dia de hoje
        var next = hoje && a === prox;
        var done = passado || (hoje && a.min < agora);
        li.className = (next ? "next" : "") + (done ? " done" : "");

        var who = el("span", "who", a.cli);
        if (next) who.appendChild(el("span", "badge", "Próximo"));
        if (done) who.appendChild(el("span", "badge", "Concluído"));
        who.appendChild(el("span", "what", detalhes(a)));

        li.append(el("time", null, a.hora), who, el("span", "val", brl(a.val)), B.acoes(a, recarregar));
      }

      ul.appendChild(li);
    });

    if (!c) ul.innerHTML = "<li class='empty'>Nenhum horário neste filtro.</li>";

    week();
    ultimaSituacao = situacao();
  }

  // Faixa com os dias da semana (segunda a sábado); semDados = ainda carregando
  function week(semDados) {
    var box = $("week");

    // guarda qual dia estava com o foco do teclado para devolver depois
    var foco = [].indexOf.call(box.children, document.activeElement);
    box.innerHTML = "";

    var base = state.dia;
    var mon = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7));

    for (var i = 0; i < 6; i++) {
      (function (d) {
        var n = B.marcados(agendamentos(d)).length;
        var folga = B.diaDeFolga(d);
        var b = document.createElement("button");

        b.type = "button";
        b.className = "chip day";
        b.setAttribute("aria-pressed", key(d) === key(state.dia));
        var resumo = semDados ? "…" : (folga ? "folga" : n + " marcados");
        b.setAttribute("aria-label", DS[d.getDay()] + ", " + d.getDate() +
          (semDados ? "" : ", " + (folga ? "folga" : n + " agendamentos")));
        b.innerHTML =
          "<b>" + d.getDate() + "</b>" +
          DS[d.getDay()].slice(0, 3) +
          "<i>" + resumo + "</i>";
        b.onclick = function () { state.dia = d; render(); };

        box.appendChild(b);
      })(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
    }

    // no celular a faixa rola: centraliza o dia escolhido para ele não ficar escondido
    var sel = box.querySelector("[aria-pressed='true']");
    if (sel && box.scrollWidth > box.clientWidth) {
      box.scrollLeft = sel.offsetLeft - (box.clientWidth - sel.offsetWidth) / 2;
    }

    if (foco >= 0) box.children[foco].focus({ preventScroll: true });
  }

  /* ---------- Eventos ---------- */
  $("prev").onclick = function () { state.dia = move(state.dia, -1); render(); };
  $("next").onclick = function () { state.dia = move(state.dia, 1); render(); };
  $("hoje").onclick = function () { state.dia = startDay(new Date()); render(); };

  var filtros = document.querySelectorAll("[data-f]");
  [].forEach.call(filtros, function (b) {
    b.onclick = function () {
      state.f = b.dataset.f;
      [].forEach.call(filtros, function (x) { x.setAttribute("aria-pressed", x === b); });
      render();
    };
  });

  // depois de editar ou remover algo, busca de novo o mesmo período
  function recarregar() { B.carregar().then(render, render); }

  render();                       // mostra "Carregando…" e pede a semana ao servidor

  // Painel fica aberto o dia todo. A cada minuto (só com a página visível):
  // - busca de novo no servidor, para aparecerem os agendamentos novos do site;
  // - na virada do dia, quem estava vendo "hoje" passa para o novo dia;
  // - só redesenha quando algo mudou (dados novos, um horário passou ou o dia virou),
  //   para não tirar o foco do teclado à toa.
  var ultimoDia = diaAtual();
  B.aCadaMinuto(function () {
    // se falhar, continua mostrando os últimos dados que vieram
    B.carregar().then(function (mudou) { atualiza(mudou); }, function () { atualiza(false); });
  });

  function atualiza(forcar) {
    var k = diaAtual();
    if (k !== ultimoDia) {
      if (key(state.dia) === ultimoDia) state.dia = startDay(new Date());
      ultimoDia = k;
    }
    if (forcar || situacao() !== ultimaSituacao) render();
  }
})();
