/*
 * Integrações externas.
 *
 * ClickUp:
 *   - Modo CONECTADO: jogo servido pelo webhook-server.js -> usa /api/clickup/* (proxy,
 *     resolve CORS e esconde o token no servidor).
 *   - Modo TOKEN: tenta chamar a API do ClickUp direto do browser com o token pessoal
 *     (pode esbarrar em CORS dependendo do navegador; cai no seed se falhar).
 *   - Modo OFFLINE: usa FA.seedTasks (dados reais já embutidos).
 *
 * WhatsApp (sua IA de leitura):
 *   - Sua IA faz POST das mensagens pro servidor (webhook). O jogo busca via polling.
 *   - Também escuta um BroadcastChannel, pra um script/extensão local empurrar mensagens.
 *   - Botão "simular" pra demonstrar sem nada conectado.
 */
window.FA = window.FA || {};

(function () {
  const cfg = FA.config.integrations;

  function serverBase() {
    const s = (FA.State.data.settings.serverBase || "").trim();
    return s.replace(/\/$/, "");
  }

  // Extrai o nome da empresa/cliente a partir do título da tarefa-RAIZ.
  // No workspace, cada cliente é uma tarefa de topo e o trabalho são subtarefas dela.
  // Os títulos de topo vêm com rótulos de processo que removemos:
  //   "ATIVAÇÃO DE NOVO CLIENTE - LEVE DELIVERY"  -> LEVE DELIVERY
  //   "[IMPLEMENTAÇÃO] - VERDENA" / "[IMPLEMENTAÇÃO] Vint Mens Wear" -> VERDENA / Vint Mens Wear
  //   "IMPLEMENTAÇÃO - ATOMO" -> ATOMO
  //   "Hiven Cosméticos — Plano de Automação…" -> Hiven Cosméticos (corta a descrição)
  function companyFromName(name) {
    if (!name) return null;
    let c = String(name).trim();
    c = c.replace(/^\s*\[[^\]]*\]\s*/, "");                         // tira [IMPLEMENTAÇÃO] etc.
    c = c.replace(/^\s*(ativa[çc][ãa]o de novo cliente|implementa[çc][ãa]o|implanta[çc][ãa]o|onboarding)\b\s*/i, ""); // rótulos de processo
    c = c.replace(/^\s*[-–—:]\s*/, "");                             // separador inicial remanescente
    c = c.split(/\s[–—]\s|\s-\s/)[0];                               // corta descrição após traço/travessão
    c = c.trim().replace(/[.…\s]+$/, "");                           // limpa pontuação/espaço final
    return c || null;
  }

  // Dado o array cru da API, resolve a empresa de CADA tarefa subindo até a raiz
  // (a tarefa de topo = o cliente) e devolve as tarefas já normalizadas.
  function withCompanies(rawTasks) {
    const byId = {};
    rawTasks.forEach((t) => { byId[t.id] = t; });
    const rootName = (t) => {
      let cur = t, guard = 0;
      while (cur && cur.parent && byId[cur.parent] && guard++ < 25) cur = byId[cur.parent];
      return cur ? cur.name : t.name;
    };
    return rawTasks.map((t) => {
      const n = normalizeTask(t);
      const c = companyFromName(rootName(t));
      if (c) n.company = c;
      return n;
    });
  }

  function normalizeTask(t) {
    // aceita tanto o formato do seed quanto o cru da API do ClickUp
    const status = (t.status && t.status.status) || t.status || "a fazer";
    const priorityRaw = t.priority && t.priority.priority ? t.priority.priority : t.priority;
    const priority = priorityRaw && FA.config.priority[priorityRaw] ? priorityRaw : (priorityRaw || "none");
    const due = t.due != null ? t.due : (t.due_date ? Number(t.due_date) : null);
    const assignees = (t.assignees || []).map((a) => (typeof a === "string" ? a : a.username || a.email || "?"));
    return {
      id: t.id,
      name: t.name || "(sem título)",
      company: companyFromName(t.name),
      status: typeof status === "string" ? status.toLowerCase() : "a fazer",
      priority: ["urgent", "high", "normal", "low"].includes(priority) ? priority : "none",
      due,
      assignees,
      url: t.url || ("https://app.clickup.com/t/" + t.id),
    };
  }

  const ClickUp = {
    mode: "offline", // offline | server | token
    doneStatus: null, // nome do status "concluído" REAL da lista (ex.: "feito"); detectado da API

    async detect() {
      const base = serverBase();
      if (base || base === "") {
        try {
          const r = await fetch((base || "") + "/api/health", { method: "GET" });
          if (r.ok) {
            const j = await r.json();
            if (j && j.clickup) { this.mode = "server"; return this.mode; }
          }
        } catch (e) { /* sem servidor */ }
      }
      this.mode = FA.State.data.settings.clickupToken ? "token" : "offline";
      return this.mode;
    },

    // Descobre o nome do status do tipo "closed" da lista. Varia por workspace
    // ("feito", "done", "concluído"…); sem isso o write-back falha por status inválido.
    async loadListMeta(listId) {
      try {
        let r;
        if (this.mode === "server") r = await fetch(serverBase() + "/api/clickup/list/" + listId);
        else if (this.mode === "token") r = await fetch(cfg.clickup.apiBase + "/list/" + listId, { headers: { Authorization: FA.State.data.settings.clickupToken } });
        else return;
        if (r && r.ok) {
          const j = await r.json();
          const closed = (j.statuses || []).find((s) => s.type === "closed");
          if (closed && closed.status) this.doneStatus = closed.status;
        }
      } catch (e) { /* mantém fallback */ }
    },

    // A API do ClickUp pagina em 100 tarefas/página. Buscamos TODAS as páginas
    // até last_page=true (senão o jogo só mostraria as 100 primeiras e subtarefas
    // ficariam órfãs da sua raiz/empresa).
    async _fetchAllPages(base, token) {
      let all = [], page = 0, ok = false;
      const headers = token ? { Authorization: token } : undefined;
      while (page < 30) {
        const sep = base.includes("?") ? "&" : "?";
        const r = await fetch(base + sep + "page=" + page, headers ? { headers } : undefined);
        if (!r.ok) break;
        ok = true;
        const j = await r.json();
        const tasks = j.tasks || [];
        all = all.concat(tasks);
        if (j.last_page === true || tasks.length === 0) break;
        page++;
      }
      return { ok, tasks: all };
    },

    async fetchTasks() {
      const listId = FA.State.data.settings.listId || cfg.clickup.listId;
      await this.detect();
      await this.loadListMeta(listId);

      if (this.mode === "server") {
        try {
          const { ok, tasks } = await this._fetchAllPages(serverBase() + "/api/clickup/list/" + listId + "/task?subtasks=true&include_closed=false");
          if (ok) return { source: "ClickUp (ao vivo)", tasks: withCompanies(tasks) };
        } catch (e) {}
      }

      if (this.mode === "token") {
        try {
          const { ok, tasks } = await this._fetchAllPages(cfg.clickup.apiBase + "/list/" + listId + "/task?subtasks=true&include_closed=false", FA.State.data.settings.clickupToken);
          if (ok) return { source: "ClickUp (token)", tasks: withCompanies(tasks) };
        } catch (e) { /* provável CORS — cai no seed */ }
      }

      return { source: "Dados embutidos (offline)", tasks: FA.seedTasks.map(normalizeTask) };
    },

    // Concluir tarefa (write-back). Sem permissão/conexão, vira no-op "local".
    async completeTask(task) {
      if (!FA.State.data.settings.writeBack) return { ok: true, local: true };
      const body = JSON.stringify({ status: this.doneStatus || "done" });
      const headers = { "Content-Type": "application/json" };
      try {
        if (this.mode === "server") {
          const r = await fetch(serverBase() + "/api/clickup/task/" + task.id, { method: "PUT", headers, body });
          return { ok: r.ok, local: false };
        }
        if (this.mode === "token") {
          headers.Authorization = FA.State.data.settings.clickupToken;
          const r = await fetch(cfg.clickup.apiBase + "/task/" + task.id, { method: "PUT", headers, body });
          return { ok: r.ok, local: false };
        }
      } catch (e) { return { ok: false, error: String(e), local: false }; }
      return { ok: true, local: true };
    },

    // Empurra um brain dump como tarefa no ClickUp (opcional).
    async createTask(name) {
      if (!FA.State.data.settings.writeBack) return { ok: true, local: true };
      const listId = FA.State.data.settings.listId || cfg.clickup.listId;
      const body = JSON.stringify({ name, status: "a fazer" });
      const headers = { "Content-Type": "application/json" };
      try {
        if (this.mode === "server") {
          const r = await fetch(serverBase() + "/api/clickup/list/" + listId + "/task", { method: "POST", headers, body });
          return { ok: r.ok, local: false };
        }
        if (this.mode === "token") {
          headers.Authorization = FA.State.data.settings.clickupToken;
          const r = await fetch(cfg.clickup.apiBase + "/list/" + listId + "/task", { method: "POST", headers, body });
          return { ok: r.ok, local: false };
        }
      } catch (e) { return { ok: false, error: String(e), local: false }; }
      return { ok: true, local: true };
    },
  };

  // ---- WhatsApp AI ----
  const WhatsApp = {
    handlers: [],
    since: 0,
    timer: null,
    bc: null,

    onMessage(fn) { this.handlers.push(fn); },
    _emit(msg) {
      // normaliza: {from, text, urgency: 'low'|'normal'|'high', ts}
      const m = {
        id: msg.id || "wa_" + (msg.ts || Date.now()) + "_" + Math.random().toString(36).slice(2, 6),
        from: msg.from || msg.sender || "Desconhecido",
        text: msg.text || msg.body || msg.message || "",
        urgency: ["low", "normal", "high"].includes(msg.urgency) ? msg.urgency : "normal",
        ts: msg.ts || Date.now(),
      };
      this.handlers.forEach((h) => { try { h(m); } catch (e) {} });
    },

    start() {
      // canal local (extensão/script que roda no mesmo browser)
      try {
        this.bc = new BroadcastChannel(cfg.whatsapp.broadcastChannel);
        this.bc.onmessage = (ev) => this._emit(ev.data || {});
      } catch (e) {}
      this._poll();
      // só consulta o servidor quando a aba está visível
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) this._poll();
      });
    },

    async _poll() {
      clearTimeout(this.timer);
      const base = serverBase();
      try {
        const r = await fetch((base || "") + "/api/whatsapp?since=" + this.since, { method: "GET" });
        if (r.ok) {
          const j = await r.json();
          (j.messages || []).forEach((m) => { this._emit(m); this.since = Math.max(this.since, m.ts || 0); });
        }
      } catch (e) { /* sem servidor — silencioso */ }
      if (!document.hidden) {
        this.timer = setTimeout(() => this._poll(), cfg.whatsapp.pollMs);
      }
    },

    simulate() {
      const samples = [
        { from: "Cliente · HIVEN", text: "Oi, o disparo de hoje já saiu? 👀", urgency: "high" },
        { from: "Vitor Fonseca", text: "Subi a base da Opala, dá uma olhada quando puder", urgency: "normal" },
        { from: "Grupo · Walkers", text: "kkkk olha esse meme", urgency: "low" },
        { from: "Cliente · NEUROFOOD", text: "URGENTE: template foi reprovado pela Meta", urgency: "high" },
        { from: "Mãe", text: "Almoça hoje em casa?", urgency: "low" },
        { from: "Paulo Junior", text: "Konsist respondeu sobre a API, te mando o doc", urgency: "normal" },
      ];
      const s = samples[Math.floor(Math.random() * samples.length)];
      this._emit(Object.assign({ ts: Date.now() }, s));
    },
  };

  FA.normalizeTask = normalizeTask;
  FA.ClickUp = ClickUp;
  FA.WhatsApp = WhatsApp;
})();
