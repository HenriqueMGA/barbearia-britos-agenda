/* Barbearia Britos - folgas dos barbeiros (usa o script.js)
   IDs esperados: form-folga, f-titulo, f-barbeiro, f-data, f-hini, f-hfim, f-de, f-ate,
   f-motivo, f-enviar, f-cancelar, f-msg, lista-folgas
   Botões de tipo: elementos com data-tipo ("horas", "dia", "periodo")
   Grupos de campos: data-para com os tipos em que aparecem
   Parâmetros: ?dia=AAAA-MM-DD preenche a data; ?editar=<id> abre a folga para edição */
(function () {
  "use strict";

  var B = window.Britos;
  var DS = B.DS, $ = B.$, key = B.key, el = B.el;

  var tipo = "horas";
  var editando = null;   // folga aberta no formulário (null = marcando uma nova)
  var base = null;       // como o formulário estava ao abrir a edição, para saber o que mudou

  /* ---------- Tipo de folga: mostra só os campos que fazem sentido ---------- */
  var tipos = document.querySelectorAll("[data-tipo]");
  var grupos = document.querySelectorAll("[data-para]");

  function setTipo(t) {
    tipo = t;
    [].forEach.call(tipos, function (b) { b.setAttribute("aria-pressed", b.dataset.tipo === t); });
    [].forEach.call(grupos, function (g) {
      var mostra = g.dataset.para.split(" ").indexOf(t) >= 0;
      g.hidden = !mostra;
      // campo escondido não pode bloquear o envio
      [].forEach.call(g.querySelectorAll("input"), function (i) { i.required = mostra; });
    });
    msg("");
  }

  [].forEach.call(tipos, function (b) {
    b.onclick = function () { setTipo(b.dataset.tipo); };
  });

  /* ---------- Valores iniciais ---------- */
  var params = new URLSearchParams(location.search);

  // Abre no dia vindo da agenda ou do calendário (folgas.html?dia=AAAA-MM-DD) ou hoje
  function datasPadrao() {
    var pedido = params.get("dia");
    var dia = /^\d{4}-\d{2}-\d{2}$/.test(pedido || "") ? pedido : key(new Date());
    $("f-data").value = dia;
    $("f-de").value = dia;
    $("f-ate").value = dia;
  }

  // o último dia nunca fica antes do primeiro
  $("f-de").onchange = function () {
    if ($("f-ate").value < this.value) $("f-ate").value = this.value;
    $("f-ate").min = this.value;
  };

  datasPadrao();
  setTipo("horas");

  /* ---------- Barbeiros ---------- */
  var sel = $("f-barbeiro");
  var barbeirosProntos = B.barbeiros().then(function (lista) {
    sel.innerHTML = "";
    if (lista.length !== 1) sel.appendChild(el("option", null, "Escolha o barbeiro")).value = "";
    lista.forEach(function (b) { sel.appendChild(el("option", null, b.nome)).value = b.nome; });
  }, function () {
    sel.innerHTML = "";
    sel.appendChild(el("option", null, "Não foi possível carregar os barbeiros")).value = "";
  });

  /* ---------- Mensagens ---------- */
  function msg(texto, erro) {
    var m = $("f-msg");
    m.textContent = texto;
    m.className = "msg" + (erro ? " erro" : "");
  }

  /* ---------- Textos de período ---------- */
  // "2026-11-10T14:00" -> { dia: "ter, 10/11", data: "2026-11-10", hora: "14:00" }
  // O backend guarda folga de dia inteiro como 00:00 até 00:00 do dia seguinte;
  // por isso um fim às 00:00 vira "até o dia anterior, inteiro".
  function partes(s, ehFim) {
    var p = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(s || "");
    if (!p) return { dia: s, data: s, hora: null };
    var d = new Date(+p[1], p[2] - 1, +p[3]);
    var hora = p[4] === "00:00" ? null : p[4] || null;
    if (ehFim && p[4] === "00:00") d.setDate(d.getDate() - 1);
    return {
      dia: DS[d.getDay()].slice(0, 3) + ", " + ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2),
      data: key(d),
      hora: hora
    };
  }

  function periodo(inicio, fim) {
    var a = partes(inicio), b = partes(fim, true);
    if (a.data === b.data) {
      return a.hora && b.hora ? a.dia + ", das " + a.hora + " às " + b.hora : a.dia + ", dia inteiro";
    }
    return a.dia + (a.hora ? " " + a.hora : "") + " até " + b.dia + (b.hora ? " " + b.hora : "");
  }

  /* ---------- Conflito com agendamentos ---------- */
  // Agendamentos do barbeiro que caem dentro da folga (os clientes não são avisados sozinhos)
  function conflitos(folga) {
    var out = [];
    B.trechosDeFolga(folga).forEach(function (t) {
      B.marcados(B.agendamentos(B.data(t.data))).forEach(function (a) {
        var mesmo = !a.barb || a.barb === folga.barbeiro;
        if (mesmo && a.min < t.fim && t.ini < a.min + a.dur) {
          out.push(partes(t.data).dia + " " + a.hora + " · " + a.cli + " (" + a.svc + ")");
        }
      });
    });
    return out;
  }

  // Confere conflitos (se der) e pergunta antes de seguir; rejeita com "cancelado" se o usuário desistir
  function confirmaConflitos(folga) {
    // baixa só os agendamentos do período da folga
    var de = folga.inicio.slice(0, 10), ate = folga.fim.slice(0, 10);
    return B.carregar(de, ate).catch(function () {}).then(function () {
      var lista = B.pronto(de, ate) ? conflitos(folga) : [];
      if (lista.length && !confirm(
        "Há " + lista.length + " agendamento(s) nesse período:\n\n" +
        lista.slice(0, 8).join("\n") + (lista.length > 8 ? "\n…" : "") +
        "\n\nOs clientes não são avisados automaticamente. Continuar mesmo assim?")) {
        throw new Error("cancelado");
      }
    });
  }

  /* ---------- Formulário <-> folga ---------- */
  // Monta { barbeiro, inicio, fim, motivo } a partir dos campos; devolve texto se algo estiver errado
  function montar() {
    var folga = { barbeiro: sel.value };
    if (tipo === "horas") {
      if ($("f-hfim").value <= $("f-hini").value) return "O horário final precisa ser depois do inicial.";
      folga.inicio = $("f-data").value + "T" + $("f-hini").value;
      folga.fim = $("f-data").value + "T" + $("f-hfim").value;
    } else if (tipo === "dia") {
      folga.inicio = folga.fim = $("f-data").value;
    } else {
      if ($("f-ate").value < $("f-de").value) return "O último dia precisa ser igual ou depois do primeiro.";
      folga.inicio = $("f-de").value;
      folga.fim = $("f-ate").value;
    }
    folga.motivo = $("f-motivo").value.trim();
    return folga;
  }

  // Coloca uma folga do backend nos campos, escolhendo o tipo que a representa
  function preencher(f) {
    var a = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(f.inicio || "");
    var b = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(f.fim || "");
    if (!a || !b) return;

    var ini = { data: a[1], hora: a[2] || "00:00" };
    var fim = { data: b[1], hora: b[2] || null };
    var ultimoDia = fim.data;
    if (fim.hora === "00:00") {             // 00:00 do dia seguinte = até o fim do dia anterior
      var d = B.data(fim.data);
      d.setDate(d.getDate() - 1);
      ultimoDia = key(d);
    }
    var aviso = "";

    if (ini.hora === "00:00" && (!fim.hora || fim.hora === "00:00")) {
      // dias inteiros
      if (ultimoDia < ini.data) ultimoDia = ini.data;
      setTipo(ini.data === ultimoDia ? "dia" : "periodo");
      $("f-data").value = $("f-de").value = ini.data;
      $("f-ate").value = ultimoDia;
    } else if (ini.data === fim.data) {
      setTipo("horas");
      $("f-data").value = ini.data;
      $("f-hini").value = ini.hora;
      $("f-hfim").value = fim.hora;
    } else {
      // vários dias com horário no começo ou no fim: o formulário não tem esse formato
      setTipo("periodo");
      $("f-de").value = ini.data;
      $("f-ate").value = ultimoDia;
      aviso = "Esta folga começa ou termina no meio do dia. Se você mudar as datas, ela passa a ocupar os dias inteiros.";
    }

    sel.value = f.barbeiro;
    $("f-motivo").value = f.motivo || "";
    if (aviso) msg(aviso);
  }

  /* ---------- Modo de edição ---------- */
  function entrarEdicao(f) {
    barbeirosProntos.then(function () {
      // barbeiro que não aparece mais na lista continua selecionável na edição
      if (![].some.call(sel.options, function (o) { return o.value === f.barbeiro; })) {
        sel.appendChild(el("option", null, f.barbeiro)).value = f.barbeiro;
      }
      editando = f;
      preencher(f);
      base = montar();
      $("f-titulo").textContent = "Editar folga";
      $("f-enviar").textContent = "Salvar alterações";
      $("f-cancelar").hidden = false;

      var t = $("f-titulo");
      t.focus({ preventScroll: true });
      t.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
  }

  function sairEdicao() {
    editando = null;
    base = null;
    $("f-titulo").textContent = "Marcar folga";
    $("f-enviar").textContent = "Marcar folga";
    $("f-cancelar").hidden = true;
    $("f-motivo").value = "";
    datasPadrao();
    setTipo("horas");
    // tira o ?editar= do endereço, para um recarregar não abrir a edição de novo
    if (params.has("editar")) history.replaceState(null, "", "folgas.html");
  }

  $("f-cancelar").onclick = function () { sairEdicao(); msg(""); };

  /* ---------- Envio ---------- */
  $("form-folga").onsubmit = function (ev) {
    ev.preventDefault();

    var folga = montar();
    if (typeof folga === "string") return msg(folga, true);

    var bt = $("f-enviar");
    var acao;

    if (editando) {
      // só os campos que mudaram; início e fim vão sempre juntos
      var mud = {};
      if (folga.barbeiro !== base.barbeiro) mud.barbeiro = folga.barbeiro;
      if (folga.inicio !== base.inicio || folga.fim !== base.fim) {
        mud.inicio = folga.inicio;
        mud.fim = folga.fim;
      }
      if (folga.motivo !== (editando.motivo || "")) mud.motivo = folga.motivo || null;   // vazio apaga o motivo

      if (!Object.keys(mud).length) {
        sairEdicao();
        return msg("Nada foi alterado.");
      }

      var id = editando.id;
      var mudouPeriodo = mud.inicio || mud.barbeiro;
      var periodoFinal = mud.inicio ? { barbeiro: folga.barbeiro, inicio: folga.inicio, fim: folga.fim }
                                    : { barbeiro: folga.barbeiro, inicio: editando.inicio, fim: editando.fim };
      acao = (mudouPeriodo ? confirmaConflitos(periodoFinal) : Promise.resolve()).then(function () {
        msg("Salvando…");
        return B.editarFolga(id, mud);
      }).then(function (salva) {
        sairEdicao();
        msg("Folga atualizada: " + periodo(salva.inicio || periodoFinal.inicio, salva.fim || periodoFinal.fim) + ".");
      });
    } else {
      if (!folga.motivo) delete folga.motivo;
      acao = confirmaConflitos(folga).then(function () {
        msg("Salvando…");
        return B.criarFolga(folga);
      }).then(function () {
        msg("Folga marcada: " + periodo(folga.inicio, folga.fim) + ".");
        $("f-motivo").value = "";
      });
    }

    bt.disabled = true;
    msg("Verificando agendamentos…");
    acao.then(listar, function (e) {
      if (e.message === "cancelado") return msg("");
      if (e.status === 404 && editando) {
        sairEdicao();
        listar();
        return msg("Esta folga não existe mais (talvez já tenha sido removida).", true);
      }
      msg(e.message, true);
    }).then(function () {
      bt.disabled = false;
    });
  };

  /* ---------- Lista de próximas folgas ---------- */
  function listar() {
    var ul = $("lista-folgas");

    B.listarFolgas({ de: key(new Date()) }).then(function (folgas) {
      ul.innerHTML = "";
      if (!folgas.length) {
        ul.appendChild(el("li", "empty", "Nenhuma folga marcada a partir de hoje."));
        return;
      }

      folgas.forEach(function (f) {
        var texto = periodo(f.inicio, f.fim);
        var li = el("li", "folga");
        var who = el("span", "who", f.barbeiro);
        who.appendChild(el("span", "what", texto + (f.motivo ? " · " + f.motivo : "")));

        var ed = B.botaoTexto("Editar", "Editar folga de " + texto);
        ed.onclick = function () { msg(""); entrarEdicao(f); };

        var rm = B.botaoTexto("Remover", "Remover folga de " + texto);
        rm.onclick = function () {
          if (!confirm("Remover a folga de " + texto + "?")) return;
          rm.disabled = true;
          B.removerFolga(f.id).then(function () {
            if (editando && editando.id === f.id) sairEdicao();
            listar();
          }, function (e) {
            rm.disabled = false;
            alert(e.status === 404 ? "Esta folga não existe mais." : e.message);
            if (e.status === 404) listar();
          });
        };

        var ops = el("div", "ops");
        ops.append(ed, rm);
        li.append(el("time", null, partes(f.inicio).dia.slice(5)), who, el("span"), ops);
        ul.appendChild(li);
      });
    }, function () {
      ul.innerHTML = "";
      ul.appendChild(el("li", "empty", "Não foi possível carregar as folgas. Verifique se o servidor está ligado."));
    });
  }

  listar();

  // Veio de "Editar" na agenda ou no calendário: abre essa folga no formulário
  if (params.get("editar")) {
    B.listarFolgas().then(function (todas) {
      var f = todas.filter(function (x) { return String(x.id) === params.get("editar"); })[0];
      if (f) entrarEdicao(f);
      else msg("Essa folga não existe mais (talvez já tenha sido removida).", true);
    }, function (e) { msg(e.message, true); });
  }
})();
