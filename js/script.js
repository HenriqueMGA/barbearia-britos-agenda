/* ==========================================================
   Barbearia Britos - código comum do painel do barbeiro
   Carregar antes do script da página:
   <script src="js/script.js" defer></script>
   <script src="js/agenda.js" defer></script>   (ou js/calendario.js, js/folgas.js)
   Expõe tudo em window.Britos
   Endereço do backend: o local (http://localhost:3000) quando o painel roda no
   computador, o da Vercel quando está publicado. Para forçar outro, defina
   window.BRITOS_API antes de carregar este arquivo.
   ========================================================== */
(function () {
  "use strict";

  /* ---------- Configuração ---------- */
  var LOCAL = /^(localhost|127\.0\.0\.1|)$/.test(location.hostname);   // "" = aberto como arquivo
  var API = window.BRITOS_API ||
    (LOCAL ? "http://localhost:3000" : "https://barbearia-britos-back.vercel.app");

  // Expediente usado para mostrar os horários livres (em minutos desde 00:00).
  // Igual à grade do backend: de 09:00 até o último horário, 20:30.
  var ABRE = 9 * 60, FECHA = 21 * 60, PASSO = 30;

  var DS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  var MS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
            "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /* ---------- Utilitários ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var key = function (d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  };
  var hm = function (m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };

  // "AAAA-MM-DD" -> Date local (sem o problema de fuso do new Date("AAAA-MM-DD"))
  function data(s) {
    var q = s.split("-");
    return new Date(+q[0], q[1] - 1, +q[2]);
  }

  // Início do dia; se for domingo (fechado), avança para segunda
  function startDay(d) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d;
  }

  /* ---------- Comunicação com o backend ---------- */
  // Erros do backend vêm como { error: "mensagem em português" }
  function enviar(metodo, rota, corpo) {
    var opts = { method: metodo };
    if (corpo) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(corpo);
    }
    return fetch(API + rota, opts).then(function (r) {
      // 204 (removido) vem sem corpo
      return r.json().catch(function () { return {}; }).then(function (res) {
        if (!r.ok) {
          var e = new Error(res.error || "Erro " + r.status);
          e.status = r.status;   // 409 = horário indisponível, 404 = não existe mais
          throw e;
        }
        return res;
      });
    });
  }

  function pegar(rota) { return enviar("GET", rota); }

  // Serviços quase nunca mudam: busca uma vez por página
  var cacheServicos = null;
  function servicos() {
    if (!cacheServicos) {
      cacheServicos = pegar("/api/servicos").catch(function (e) { cacheServicos = null; throw e; });
    }
    return cacheServicos;
  }

  function barbeirosDoServico(id) {
    return pegar("/api/barbeiros?servico=" + encodeURIComponent(id));
  }

  // { horarios: [...livres], grade: [{ hora, disponivel }] }
  function grade(dia, servico, barbeiro) {
    return pegar("/api/horarios-disponiveis?data=" + encodeURIComponent(dia) +
      "&servico=" + encodeURIComponent(servico) + "&barbeiro=" + encodeURIComponent(barbeiro));
  }

  // envie só os campos que mudam: { nome, telefone, servico, barbeiro, data, hora }
  function editarAgendamento(id, mudancas) {
    return enviar("PATCH", "/api/agendamentos/" + encodeURIComponent(id), mudancas);
  }

  function removerAgendamento(id) {
    return enviar("DELETE", "/api/agendamentos/" + encodeURIComponent(id));
  }

  // GET /api/barbeiros exige ?servico=; junta os barbeiros de todos os serviços
  function barbeiros() {
    return servicos().then(function (lista) {
      return Promise.all(lista.map(function (s) { return barbeirosDoServico(s.id); }));
    }).then(function (listas) {
      var vistos = {};
      return [].concat.apply([], listas).filter(function (b) {
        if (vistos[b.nome]) return false;
        vistos[b.nome] = true;
        return true;
      });
    });
  }

  // filtros opcionais: { barbeiro, de, ate }
  function listarFolgas(filtros) {
    var q = new URLSearchParams();
    Object.keys(filtros || {}).forEach(function (k) { if (filtros[k]) q.set(k, filtros[k]); });
    return pegar("/api/folgas" + (q.toString() ? "?" + q : ""));
  }

  // { barbeiro, inicio, fim, motivo? }; inicio/fim "AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM"
  function criarFolga(folga) { return enviar("POST", "/api/folgas", folga); }

  function removerFolga(id) { return enviar("DELETE", "/api/folgas/" + encodeURIComponent(id)); }

  // só os campos que mudam: { barbeiro, inicio, fim, motivo }; motivo null apaga
  function editarFolga(id, mudancas) {
    return enviar("PATCH", "/api/folgas/" + encodeURIComponent(id), mudancas);
  }

  /* ---------- Dados do painel ---------- */
  var porDia = {};           // "AAAA-MM-DD" -> agendamentos do dia
  var folgasPorDia = {};     // "AAAA-MM-DD" -> trechos de folga do dia
  var versao = "";           // resposta anterior, para saber se algo mudou
  var estado = "carregando"; // "carregando" | "ok" | "erro"

  // "2026-11-10T14:00" ou "2026-11-10" -> { data, min }; sem hora, vale o dia todo
  function momento(s, ehFim) {
    var p = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || "");
    if (!p) return null;
    return { data: p[1], min: p[2] ? +p[2] * 60 + +p[3] : (ehFim ? 1440 : 0) };
  }

  // Quebra cada folga em um trecho por dia (uma folga de vários dias vira vários trechos)
  function trechosDeFolga(f) {
    var a = momento(f.inicio, false), b = momento(f.fim, true), out = [];
    if (!a || !b) return out;

    var d = data(a.data), ultimo = data(b.data);
    for (var i = 0; d <= ultimo && i < 400; i++, d.setDate(d.getDate() + 1)) {
      var k = key(d);
      var ini = k === a.data ? a.min : 0;
      var fim = k === b.data ? b.min : 1440;
      if (ini >= fim) continue;
      out.push({
        folga: true,
        id: f.id,
        data: k,
        ini: ini,
        fim: fim,
        min: Math.max(ini, ABRE),          // para ordenar e mostrar dentro do expediente
        hora: hm(Math.max(ini, ABRE)),
        inteiro: ini <= ABRE && fim >= FECHA,
        motivo: f.motivo,
        barb: f.barbeiro
      });
    }
    return out;
  }

  // Busca agendamentos, serviços (para preço e duração) e folgas.
  // Resolve com true quando os dados mudaram desde a última busca.
  // Se falhar depois de já ter carregado, mantém os dados anteriores.
  function carregar() {
    return Promise.all([pegar("/api/agendamentos"), pegar("/api/servicos"), pegar("/api/folgas")]).then(function (res) {
      var lista = res[0], servicos = res[1], folgas = res[2];
      var nova = JSON.stringify(res);
      estado = "ok";
      if (nova === versao) return false;
      versao = nova;

      porDia = {};
      lista.forEach(function (a) {
        var p = /^(\d{1,2}):(\d{2})/.exec(a.hora || "");
        if (!p || !a.data) return;

        // o agendamento pode trazer o serviço pelo nome ou pelo id
        var s = servicos.filter(function (x) {
          return x.nome === a.servico || String(x.id) === String(a.servico);
        })[0];
        var min = +p[1] * 60 + +p[2];

        (porDia[a.data] = porDia[a.data] || []).push({
          id: a.id,
          data: a.data,
          min: min,
          hora: hm(min),
          cli: a.nome,
          svc: s ? s.nome : a.servico,
          svcId: s ? String(s.id) : "",
          val: s ? Number(s.preco) || 0 : 0,
          dur: s ? Number(s.duracaoMinutos) || PASSO : PASSO,
          barb: a.barbeiro,
          fone: a.telefone
        });
      });

      folgasPorDia = {};
      folgas.forEach(function (f) {
        trechosDeFolga(f).forEach(function (t) {
          (folgasPorDia[t.data] = folgasPorDia[t.data] || []).push(t);
        });
      });
      return true;
    }, function (e) {
      if (!versao) estado = "erro";
      throw e;
    });
  }

  // Agendamentos, folgas e horários livres do dia, em ordem de hora.
  // Um horário só é livre se nenhum atendimento nem folga ocupa aquele intervalo.
  function agendamentos(d) {
    var k = key(d);
    var bk = porDia[k] || [], fs = folgasPorDia[k] || [];
    var out = bk.concat(fs);

    for (var m = ABRE; m < FECHA; m += PASSO) {
      var ocupado = bk.some(function (a) { return a.min < m + PASSO && m < a.min + a.dur; }) ||
                    fs.some(function (f) { return f.ini < m + PASSO && m < f.fim; });
      if (!ocupado) out.push({ min: m, hora: hm(m), livre: true });
    }

    return out.sort(function (a, b) { return a.min - b.min || (a.livre ? 1 : 0) - (b.livre ? 1 : 0); });
  }

  // Só os atendimentos de clientes (sem folgas nem horários livres)
  function marcados(lista) {
    return lista.filter(function (a) { return !a.livre && !a.folga; });
  }

  function livres(lista) {
    return lista.filter(function (a) { return a.livre; });
  }

  // O barbeiro está de folga durante todo o expediente desse dia?
  function diaDeFolga(d) {
    return (folgasPorDia[key(d)] || []).some(function (f) { return f.inteiro; });
  }

  function pronto() { return estado === "ok"; }

  // Mensagem na lista enquanto carrega ou se o servidor não responde
  function aviso(ul) {
    ul.innerHTML = "";
    ul.appendChild(el("li", "empty", estado === "erro"
      ? "Não foi possível carregar os agendamentos. Verifique se o servidor está ligado. Nova tentativa em 1 minuto."
      : "Carregando agendamentos…"));
  }

  /* ---------- Montagem segura do HTML ---------- */
  // Dados vindos de fora (nome do cliente, serviço) entram sempre como texto,
  // nunca via innerHTML, para que um "nome" com código não rode no painel
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  // Link do WhatsApp; o telefone fica só com dígitos e ganha o 55 do Brasil
  // quando vier só com DDD + número
  function whats(fone) {
    var n = String(fone || "").replace(/\D/g, "");
    if (!n) return el("span");
    if (n.length <= 11) n = "55" + n;

    var a = el("a", "call", "Chamar no WhatsApp");
    a.href = "https://wa.me/" + n;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  // Duração legível: 30 -> "30 min", 60 -> "1h", 90 -> "1h30"
  function duracao(m) {
    if (m < 60) return m + " min";
    return Math.floor(m / 60) + "h" + (m % 60 ? pad(m % 60) : "");
  }

  // Serviço, duração (com horário de término) e barbeiro na linha de baixo do nome do cliente
  function detalhes(a) {
    return a.svc + " · " + duracao(a.dur) + " (até " + hm(a.min + a.dur) + ")" +
      (a.barb ? " · " + a.barb : "");
  }

  // Linha de baixo de um trecho de folga: período, motivo e barbeiro
  function detalhesFolga(f) {
    var partes = [f.inteiro
      ? "Dia inteiro"
      : "até " + (f.fim >= 1440 ? "o fim do dia" : hm(f.fim) + " (" + duracao(f.fim - f.ini) + ")")];
    if (f.motivo) partes.push(f.motivo);
    if (f.barb) partes.push(f.barb);
    return partes.join(" · ");
  }

  // Item de folga para as listas da agenda e do calendário, com Editar e Remover.
  // Editar abre a página de folgas já com essa folga no formulário.
  function itemFolga(f, depois) {
    var li = el("li", "folga");
    var who = el("span", "who", "Folga");
    who.appendChild(el("span", "what", detalhesFolga(f)));

    var ed = el("a", "op", "Editar");
    ed.href = "folgas.html?editar=" + encodeURIComponent(f.id);
    ed.setAttribute("aria-label", "Editar folga das " + f.hora);

    var rm = botaoTexto("Remover", "Remover folga das " + f.hora);
    rm.onclick = function () {
      if (!confirm("Remover esta folga? Se ela durar vários dias, todos os dias serão liberados.")) return;
      rm.disabled = true;
      removerFolga(f.id).then(depois, function (e) {
        rm.disabled = false;
        alert(e.status === 404 ? "Esta folga não existe mais. A lista será atualizada." : e.message);
        if (e.status === 404) depois();
      });
    };

    var ops = el("div", "ops");
    ops.append(ed, rm);
    li.append(el("time", null, f.hora), who, el("span"), ops);
    return li;
  }

  /* ---------- Editar e remover agendamentos ---------- */
  // "2026-11-13" -> "13/11"
  function ddmm(s) { return s.slice(8, 10) + "/" + s.slice(5, 7); }

  function botaoTexto(texto, rotulo) {
    var b = el("button", "op", texto);
    b.type = "button";
    b.setAttribute("aria-label", rotulo);
    return b;
  }

  // Linha de ações embaixo de cada agendamento: WhatsApp, Editar e Remover.
  // "depois" é chamado quando algo mudou, para a página buscar os dados de novo.
  function acoes(a, depois) {
    var box = el("div", "ops");
    var quando = ddmm(a.data) + " às " + a.hora;

    var ed = botaoTexto("Editar", "Editar agendamento de " + a.cli + " em " + quando);
    ed.onclick = function () { abrirEdicao(a, depois); };

    var rm = botaoTexto("Remover", "Remover agendamento de " + a.cli + " em " + quando);
    rm.onclick = function () {
      if (!confirm("Remover o agendamento de " + a.cli + " em " + quando + "?\nA remoção é definitiva.")) return;
      rm.disabled = true;
      removerAgendamento(a.id).then(depois, function (e) {
        rm.disabled = false;
        alert(e.status === 404 ? "Este agendamento não existe mais. A lista será atualizada." : e.message);
        if (e.status === 404) depois();
      });
    };

    box.append(whats(a.fone), ed, rm);
    return box;
  }

  // Janela de edição: criada uma vez e reaproveitada
  var dlg = null;

  function dialogo() {
    if (dlg) return dlg;
    dlg = el("dialog", "modal light");   // painel claro, como o modal de agendamento do site
    dlg.setAttribute("aria-labelledby", "ed-titulo");
    // só texto fixo aqui; os dados do cliente entram depois via .value
    dlg.innerHTML =
      "<form id='ed-form' class='form-modal'>" +
        "<h2 id='ed-titulo'>Editar agendamento</h2>" +
        "<div class='campo'><label for='ed-nome'>Nome do cliente</label>" +
          "<input id='ed-nome' maxlength='120' required></div>" +
        "<div class='campo'><label for='ed-tel'>Telefone</label>" +
          "<input id='ed-tel' type='tel' maxlength='40'></div>" +
        "<div class='campo'><label for='ed-svc'>Serviço</label><select id='ed-svc' required></select></div>" +
        "<div class='campo'><label for='ed-barb'>Barbeiro</label><select id='ed-barb' required></select></div>" +
        "<div class='linha'>" +
          "<div class='campo'><label for='ed-data'>Dia</label><input id='ed-data' type='date' required></div>" +
          "<div class='campo'><label for='ed-hora'>Horário</label><select id='ed-hora' required></select></div>" +
        "</div>" +
        "<p class='msg' id='ed-msg' role='status' aria-live='polite'></p>" +
        "<div class='botoes'>" +
          "<button class='chip' type='button' id='ed-cancelar'>Cancelar</button>" +
          "<button class='chip cheio' type='submit' id='ed-salvar'>Salvar</button>" +
        "</div>" +
      "</form>";
    document.body.appendChild(dlg);
    $("ed-cancelar").onclick = function () { dlg.close(); };
    return dlg;
  }

  function opcoes(sel, itens, valor) {
    sel.innerHTML = "";
    itens.forEach(function (i) { sel.appendChild(el("option", null, i.texto)).value = i.valor; });
    if (valor != null && itens.some(function (i) { return i.valor === valor; })) sel.value = valor;
  }

  function abrirEdicao(a, depois) {
    var d = dialogo();
    var orig = { nome: a.cli || "", telefone: a.fone || "", servico: a.svcId, barbeiro: a.barb || "", data: a.data, hora: a.hora };
    var svc = $("ed-svc"), barb = $("ed-barb"), dia = $("ed-data"), hora = $("ed-hora"), salvar = $("ed-salvar");
    var pedido = 0;   // ignora respostas atrasadas quando o usuário muda os campos rápido

    function msg(t, erro) {
      $("ed-msg").textContent = t;
      $("ed-msg").className = "msg" + (erro ? " erro" : "");
    }

    $("ed-titulo").textContent = "Editar agendamento de " + orig.nome;
    $("ed-nome").value = orig.nome;
    $("ed-tel").value = orig.telefone;
    dia.value = orig.data;
    msg("");
    opcoes(svc, [{ valor: "", texto: "Carregando…" }]);
    opcoes(barb, [{ valor: "", texto: "Carregando…" }]);
    opcoes(hora, [{ valor: orig.hora, texto: orig.hora }]);
    d.showModal();

    // Horários que só estão ocupados pelo próprio agendamento continuam valendo
    function proprio(h) {
      if (dia.value !== orig.data || barb.value !== orig.barbeiro) return false;
      var m = +h.slice(0, 2) * 60 + +h.slice(3, 5);
      return m >= a.min && m < a.min + a.dur;
    }

    // manterMsg: depois de um 409, a mensagem do backend continua na tela
    function carregaHoras(manterMsg) {
      var n = ++pedido, antes = hora.value;
      if (!svc.value || !barb.value || !dia.value) return;
      hora.disabled = true;
      opcoes(hora, [{ valor: "", texto: "Carregando…" }]);

      grade(dia.value, svc.value, barb.value).then(function (r) {
        if (n !== pedido) return;
        var livres = (r.grade || []).filter(function (g) { return g.disponivel || proprio(g.hora); });
        hora.disabled = false;
        if (!livres.length) {
          opcoes(hora, [{ valor: "", texto: "Sem horários livres" }]);
          return msg("Não há horários livres nesse dia para esse serviço e barbeiro.", true);
        }
        opcoes(hora, livres.map(function (g) { return { valor: g.hora, texto: g.hora }; }), antes);
        if (antes && hora.value !== antes) msg("O horário " + antes + " não está livre com essas escolhas. Escolha outro.", true);
        else if (manterMsg !== true) msg("");
      }, function (e) {
        if (n !== pedido) return;
        hora.disabled = false;
        opcoes(hora, [{ valor: "", texto: "—" }]);
        msg(e.message, true);
      });
    }

    function carregaBarbeiros(manter) {
      opcoes(barb, [{ valor: "", texto: "Carregando…" }]);
      return barbeirosDoServico(svc.value).then(function (lista) {
        if (!lista.length) {
          opcoes(barb, [{ valor: "", texto: "Nenhum barbeiro faz esse serviço" }]);
          return;
        }
        opcoes(barb, lista.map(function (b) { return { valor: b.nome, texto: b.nome }; }), manter);
        if (manter && barb.value !== manter) msg(manter + " não faz esse serviço. O barbeiro foi trocado.", true);
      });
    }

    servicos().then(function (lista) {
      opcoes(svc, lista.map(function (s) {
        return { valor: String(s.id), texto: s.nome + " · " + duracao(Number(s.duracaoMinutos) || PASSO) + " · " + brl(Number(s.preco) || 0) };
      }), orig.servico);
      return carregaBarbeiros(orig.barbeiro);
    }).then(carregaHoras, function (e) { msg(e.message, true); });

    svc.onchange = function () { msg(""); carregaBarbeiros(barb.value).then(carregaHoras); };
    barb.onchange = carregaHoras;
    dia.onchange = carregaHoras;

    $("ed-form").onsubmit = function (ev) {
      ev.preventDefault();
      var atual = {
        nome: $("ed-nome").value.trim(),
        telefone: $("ed-tel").value.trim(),
        servico: svc.value,
        barbeiro: barb.value,
        data: dia.value,
        hora: hora.value
      };
      if (!atual.hora) return msg("Escolha um horário.", true);

      // só os campos que mudaram; serviço vai sempre junto com o barbeiro
      var mud = {};
      Object.keys(atual).forEach(function (k) { if (atual[k] !== orig[k]) mud[k] = atual[k]; });
      if (mud.servico) mud.barbeiro = atual.barbeiro;
      if (!Object.keys(mud).length) return d.close();

      salvar.disabled = true;
      msg("Salvando…");
      editarAgendamento(a.id, mud).then(function () {
        d.close();
        depois();
      }, function (e) {
        if (e.status === 409) {
          msg(e.message, true);   // o backend já pede para escolher outro horário
          carregaHoras(true);
        } else if (e.status === 404) {
          msg("Este agendamento não existe mais (talvez já tenha sido removido).", true);
          depois();
        } else {
          msg(e.message, true);
        }
      }).then(function () { salvar.disabled = false; });
    };
  }

  // Troca o texto só se mudou: evita que leitores de tela repitam
  // títulos com aria-live a cada atualização automática
  function txt(id, s) {
    var e = $(id);
    s = String(s);
    if (e.textContent !== s) e.textContent = s;
  }

  // Valor em reais: 13850 -> "R$ 13.850,00"
  function brl(v) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  window.Britos = {
    DS: DS,
    MS: MS,
    $: $,
    key: key,
    hm: hm,
    data: data,
    startDay: startDay,
    carregar: carregar,
    agendamentos: agendamentos,
    marcados: marcados,
    livres: livres,
    diaDeFolga: diaDeFolga,
    trechosDeFolga: trechosDeFolga,
    barbeiros: barbeiros,
    listarFolgas: listarFolgas,
    criarFolga: criarFolga,
    removerFolga: removerFolga,
    editarFolga: editarFolga,
    botaoTexto: botaoTexto,
    editarAgendamento: editarAgendamento,
    removerAgendamento: removerAgendamento,
    acoes: acoes,
    pronto: pronto,
    aviso: aviso,
    el: el,
    whats: whats,
    duracao: duracao,
    detalhes: detalhes,
    detalhesFolga: detalhesFolga,
    itemFolga: itemFolga,
    txt: txt,
    brl: brl
  };
})();
