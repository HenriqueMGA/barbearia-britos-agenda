/* Barbearia Britos - calendário mensal do painel do barbeiro (usa o script.js)
   IDs esperados: titulo-mes, prev, next, hoje, cal, s-qtd, s-rec,
   s-cheio, s-cheio2, det-titulo, det-info, det-link, det-folga, lista */
(function () {
  "use strict";

  var B = window.Britos;
  var DS = B.DS, MS = B.MS, $ = B.$, key = B.key;
  var startDay = B.startDay, agendamentos = B.agendamentos;
  var el = B.el, detalhes = B.detalhes, txt = B.txt, brl = B.brl;

  function pick(mes) {
    var t = new Date();
    return (t.getFullYear() === mes.getFullYear() && t.getMonth() === mes.getMonth()) ? startDay(t) : startDay(mes);
  }

  var hoje0 = new Date();
  var state = { mes: new Date(hoje0.getFullYear(), hoje0.getMonth(), 1), sel: startDay(hoje0) };

  function render() {
    var y = state.mes.getFullYear(), m = state.mes.getMonth();
    var off = (new Date(y, m, 1).getDay() + 6) % 7;
    var n = new Date(y, m + 1, 0).getDate();
    var agora = new Date();
    var hojeK = key(agora);
    var hojeIni = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    var box = $("cal"), tot = 0, rec = 0, top = null;

    txt("titulo-mes", MS[m] + " de " + y);
    box.innerHTML = "";

    for (var i = 0; i < off; i++) {
      var e = document.createElement("div");
      e.className = "blank";
      box.appendChild(e);
    }

    for (var d = 1; d <= n; d++) {
      (function (dt) {
        var closed = dt.getDay() === 0;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "cell" + (key(dt) === hojeK ? " today" : "") + (dt < hojeIni ? " past" : "") + (closed ? " closed" : "");

        if (closed) {
          b.disabled = true;
          b.innerHTML = "<b>" + dt.getDate() + "</b><span class='cnt'>Fechado</span>";
          b.setAttribute("aria-label", dt.getDate() + ", fechado");
        } else {
          var all = agendamentos(dt);
          var bk = B.marcados(all);
          var vagas = bk.length + B.livres(all).length;
          var pct = vagas ? Math.round(bk.length / vagas * 100) : 0;
          var folgaInteira = B.diaDeFolga(dt);
          var temFolga = all.some(function (a) { return a.folga; });
          tot += bk.length;
          rec += bk.reduce(function (s, a) { return s + a.val; }, 0);
          if (bk.length && (!top || bk.length > top.n)) top = { n: bk.length, d: dt };

          if (folgaInteira) b.className += " off";
          var cnt = folgaInteira ? "Folga" : bk.length + " marcados" + (temFolga ? " · folga" : "");
          b.innerHTML = "<b>" + dt.getDate() + "</b><span class='cnt'>" + cnt + "</span>" +
            "<span class='bar'><i style='width:" + pct + "%'></i></span>";
          b.setAttribute("aria-label", DS[dt.getDay()] + ", " + dt.getDate() + ", " +
            (folgaInteira ? "folga" : bk.length + " agendamentos" + (temFolga ? ", folga em parte do dia" : "")));
          b.setAttribute("aria-pressed", key(dt) === key(state.sel));
          b.onclick = function () { state.sel = dt; render(); mostraDetalhe(); };
        }
        box.appendChild(b);
      })(new Date(y, m, d));
    }

    txt("s-qtd", tot);
    txt("s-rec", brl(rec));
    txt("s-cheio", top ? top.d.getDate() + " de " + MS[m].slice(0, 3) : "-");
    txt("s-cheio2", top ? top.n + " agendamentos" : "");

    detalhe();
  }

  // Resume o que muda com o passar do tempo no dia escolhido
  function situacao() {
    var now = new Date();
    var agora = now.getHours() * 60 + now.getMinutes();
    var passados = key(state.sel) === key(now)
      ? B.marcados(agendamentos(state.sel)).filter(function (a) { return a.min < agora; }).length
      : 0;
    return key(now) + "|" + key(state.sel) + "|" + passados;
  }
  var ultimaSituacao = "";

  // Agendamentos do dia escolhido, com os mesmos destaques da agenda do dia
  function detalhe() {
    var s = state.sel, now = new Date();
    var k = key(s), kHoje = key(now);
    var hoje = k === kHoje, passado = k < kHoje;
    var agora = now.getHours() * 60 + now.getMinutes();

    var all = agendamentos(s);
    var bk = B.marcados(all);
    var itens = all.filter(function (a) { return !a.livre; });   // atendimentos e folgas
    var total = bk.reduce(function (t, a) { return t + a.val; }, 0);
    var prox = hoje ? bk.filter(function (a) { return a.min >= agora; })[0] : null;
    var ul = $("lista");

    txt("det-titulo", DS[s.getDay()] + ", " + s.getDate() + " de " + MS[s.getMonth()]);
    txt("det-info", bk.length + " agendamentos · " +
      (B.diaDeFolga(s) ? "dia de folga" : B.livres(all).length + " horários livres") + " · " +
      "receita prevista de " + brl(total));
    $("det-link").href = "index.html?dia=" + k;
    $("det-folga").href = "folgas.html?dia=" + k;
    ul.innerHTML = "";

    // ainda carregando ou servidor fora do ar: mostra o aviso no lugar da lista
    if (!B.pronto()) {
      txt("det-info", "Sem dados do servidor ainda.");
      B.aviso(ul);
      return;
    }

    itens.forEach(function (a) {
      if (a.folga) {
        ul.appendChild(B.itemFolga(a, recarregar));
        return;
      }

      var li = document.createElement("li");
      var next = a === prox;
      var done = passado || (hoje && a.min < agora);
      li.className = (next ? "next" : "") + (done ? " done" : "");

      var who = el("span", "who", a.cli);
      if (next) who.appendChild(el("span", "badge", "Próximo"));
      if (done) who.appendChild(el("span", "badge", "Concluído"));
      who.appendChild(el("span", "what", detalhes(a)));

      li.append(el("time", null, a.hora), who, el("span", "val", brl(a.val)), B.acoes(a, recarregar));
      ul.appendChild(li);
    });
    if (!itens.length) ul.innerHTML = "<li class='empty'>Nenhum agendamento neste dia.</li>";

    ultimaSituacao = situacao();
  }

  // Depois de clicar num dia, leva a tela até os agendamentos dele
  // (no celular eles ficam abaixo do calendário, fora da vista).
  // O foco vai junto para o título, para teclado e leitor de tela.
  function mostraDetalhe() {
    var t = $("det-titulo");
    var calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    t.focus({ preventScroll: true });
    t.scrollIntoView({ behavior: calmo ? "auto" : "smooth", block: "start" });
  }

  function mudaMes(delta) {
    state.mes = new Date(state.mes.getFullYear(), state.mes.getMonth() + delta, 1);
    state.sel = pick(state.mes);
    render();
  }
  $("prev").onclick = function () { mudaMes(-1); };
  $("next").onclick = function () { mudaMes(1); };
  $("hoje").onclick = function () {
    var t = new Date();
    state.mes = new Date(t.getFullYear(), t.getMonth(), 1);
    state.sel = startDay(t);
    render();
  };

  // depois de remover uma folga, busca de novo para liberar os horários
  function recarregar() { B.carregar().then(render, render); }

  render();                       // mostra "Carregando…" enquanto busca no servidor
  recarregar();

  // A cada minuto: busca de novo no servidor (agendamentos novos do site);
  // na virada do dia move a marcação de "hoje";
  // se o dia escolhido é hoje, atualiza "Próximo" e "Concluído" quando um horário passa.
  // Se a busca falhar, continua mostrando os últimos dados que vieram.
  var ultimoDia = key(new Date());
  setInterval(function () {
    B.carregar().then(atualiza, function () { atualiza(false); });
  }, 60000);

  function atualiza(mudou) {
    var k = key(new Date());
    if (mudou || k !== ultimoDia) { ultimoDia = k; render(); }
    else if (situacao() !== ultimaSituacao) detalhe();
  }
})();
