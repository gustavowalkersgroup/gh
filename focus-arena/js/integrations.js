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
      status: typeof status === "string" ? status.toLowerCase() : "a fazer",
      priority: ["urgent", "high", "normal", "low"].includes(priority) ? priority : "none",
      due,
      assignees,
      url: t.url || ("https://app.clickup.com/t/" + t.id),
    };
  }

  const ClickUp = {
    mode: "offline", // offline | server | token

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

    async fetchTasks() {
      const listId = FA.State.data.settings.listId || cfg.clickup.listId;
      await this.detect();

      if (this.mode === "server") {
        try {
          const r = await fetch(serverBase() + "/api/clickup/list/" + listId + "/task?subtasks=true&include_closed=false");
          if (r.ok) {
            const j = await r.json();
            return { source: "ClickUp (ao vivo)", tasks: (j.tasks || []).map(normalizeTask) };
          }
        } catch (e) {}
      }

      if (this.mode === "token") {
        try {
          const r = await fetch(cfg.clickup.apiBase + "/list/" + listId + "/task?subtasks=true", {
            headers: { Authorization: FA.State.data.settings.clickupToken },
          });
          if (r.ok) {
            const j = await r.json();
            return { source: "ClickUp (token)", tasks: (j.tasks || []).map(normalizeTask) };
          }
        } catch (e) { /* provável CORS — cai no seed */ }
      }

      return { source: "Dados embutidos (offline)", tasks: FA.seedTasks.map(normalizeTask) };
    },

    // Concluir tarefa (write-back). Sem permissão/conexão, vira no-op "local".
    async completeTask(task) {
      if (!FA.State.data.settings.writeBack) return { ok: true, local: true };
      const body = JSON.stringify({ status: "done" });
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
