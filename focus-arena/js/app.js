/*
 * FOCUS ARENA — controlador principal.
 * Costura estado (RPG), integrações (ClickUp/WhatsApp), foco (Pomodoro) e arena.
 */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const State = FA.State;
  const cfg = FA.config;

  const app = {
    tasks: [],
    taskSource: "",
    waMessages: [],
    waUnread: 0,
    inFocus: false,
    focus: null,
    arena: null,
    pendingTask: null, // tarefa do sprint atual (p/ oferecer concluir)
  };

  // ---------- helpers ----------
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }
  function dueLabel(due) {
    if (!due) return null;
    const days = Math.round((due - Date.now()) / 86400000);
    if (days < 0) return { txt: "atrasada " + Math.abs(days) + "d", cls: "overdue" };
    if (days === 0) return { txt: "vence hoje", cls: "due-soon" };
    if (days <= 3) return { txt: "vence em " + days + "d", cls: "due-soon" };
    return { txt: "em " + days + "d", cls: "" };
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Alertas em segundo plano ----------
  // Em HTTP (sem secure context) a Notification API costuma não funcionar; o título
  // da aba é o sinal confiável que funciona em qualquer contexto.
  const ORIG_TITLE = document.title;
  let _titleFlash = null;
  function setFocusTitle(left) { document.title = fmtClock(left) + " · 🎯 Focus Arena"; }
  function stopTitleFlash() {
    if (_titleFlash) { clearInterval(_titleFlash); _titleFlash = null; }
    document.title = ORIG_TITLE;
  }
  function flashTitle(msg) {
    stopTitleFlash();
    let on = false;
    document.title = msg;
    _titleFlash = setInterval(() => { document.title = (on = !on) ? ORIG_TITLE : msg; }, 1200);
  }
  function requestNotify() {
    try {
      if (window.isSecureContext && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch (e) {}
  }
  function maybeNotify(title, body) {
    try {
      if (window.isSecureContext && "Notification" in window && Notification.permission === "granted") {
        const n = new Notification(title, { body: body || "" });
        setTimeout(() => { try { n.close(); } catch (e) {} }, 8000);
      }
    } catch (e) {}
  }
  function alertBackground(msg, body) {
    if (document.hidden) flashTitle(msg);
    maybeNotify(msg, body);
    if (FA.FX) FA.FX.sfx("levelup");
  }

  // ---------- HUD ----------
  function renderHud() {
    const li = State.levelInfo();
    const rank = State.rankForLevel(li.level);
    $("#levelBadge").textContent = li.level;
    $("#levelBadge").title = rank.icon + " " + rank.title;
    $("#levelLabel").textContent = "Nível " + li.level + " · " + rank.icon + " " + rank.title;
    $("#xpLabel").textContent = li.into + " / " + li.span + " XP";
    $("#xpFill").style.width = Math.round(li.pct * 100) + "%";
    $("#streakVal").textContent = State.data.player.streakDays;
    $("#focusMinVal").textContent = State.data.player.totalFocusMin;
    document.body.classList.toggle("minimal", State.data.settings.minimalMode);
  }

  // ---------- Views ----------
  function showView(name) {
    $$(".view").forEach((v) => (v.hidden = v.id !== "view-" + name));
  }

  // ---------- Missões (tarefas ClickUp) ----------
  async function loadTasks() {
    $("#connPill").textContent = "⏳ verificando…";
    const res = await FA.ClickUp.fetchTasks();
    app.tasks = res.tasks;
    app.taskSource = res.source;
    const mode = FA.ClickUp.mode;
    const pill = $("#connPill");
    if (mode === "server") { pill.textContent = "🟢 ClickUp ao vivo"; pill.className = "conn-pill ok"; }
    else if (mode === "token") { pill.textContent = "🟡 ClickUp via token"; pill.className = "conn-pill warn"; }
    else { pill.textContent = "⚪ Offline · dados reais embutidos"; pill.className = "conn-pill"; }
    $("#missionsSub").textContent =
      "Fonte: " + res.source + " · " + app.tasks.length + " tarefas. Foque em uma de cada vez.";
    renderTasks();
  }

  function renderTasks() {
    const q = ($("#taskSearch").value || "").toLowerCase();
    const sf = $("#statusFilter").value;
    const pf = $("#priorityFilter").value;
    let list = app.tasks.filter((t) => {
      if (sf !== "all" && t.status !== sf) return false;
      if (pf !== "all" && t.priority !== pf) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
    // ordena: prioridade desc, depois prazo asc
    list.sort((a, b) => {
      const pa = cfg.priority[a.priority] ? cfg.priority[a.priority].weight : 0;
      const pb = cfg.priority[b.priority] ? cfg.priority[b.priority].weight : 0;
      if (pb !== pa) return pb - pa;
      return (a.due || Infinity) - (b.due || Infinity);
    });

    const grid = $("#taskGrid");
    if (!list.length) { grid.innerHTML = '<p class="muted">Nenhuma tarefa com esses filtros. 🎉</p>'; return; }
    grid.innerHTML = list.map((t) => {
      const pri = cfg.priority[t.priority] || cfg.priority.none;
      const st = cfg.status[t.status] || cfg.status["a fazer"];
      const dl = dueLabel(t.due);
      const assignees = t.assignees.slice(0, 2).join(", ") + (t.assignees.length > 2 ? " +" + (t.assignees.length - 2) : "");
      return `
        <div class="task-card" style="border-left-color:${pri.color}">
          <div class="threat" style="color:${pri.color}">⚔ ${pri.threat}</div>
          <div class="name">${escapeHtml(t.name)}</div>
          <div class="meta">
            ${t.company ? `<span class="chip company" title="Empresa / cliente">🏢 ${escapeHtml(t.company)}</span>` : ""}
            <span class="chip status" style="color:${st.color}">● ${st.label}</span>
            ${dl ? `<span class="chip ${dl.cls}">${dl.txt}</span>` : ""}
            ${assignees ? `<span class="chip">👤 ${escapeHtml(assignees)}</span>` : ""}
          </div>
          <div class="task-actions">
            <button class="btn primary" data-focus="${t.id}">🎯 Focar</button>
            <button class="btn" data-done="${t.id}" title="Marcar como concluída">✓</button>
          </div>
        </div>`;
    }).join("");

    $$("[data-focus]", grid).forEach((b) => b.addEventListener("click", () => {
      startFocus(app.tasks.find((t) => t.id === b.dataset.focus));
    }));
    $$("[data-done]", grid).forEach((b) => b.addEventListener("click", () => {
      completeTask(app.tasks.find((t) => t.id === b.dataset.done));
    }));
  }

  async function completeTask(task) {
    if (!task) return;
    const r = State.completeTask(task);
    if (FA.FX) { FA.FX.sfx("victory"); FA.FX.confetti(null, null, 70); }
    showReward(r.reward, r.reward.leveledUp, r.unlocked);
    toast("good", "✓ Tarefa derrubada! +" + r.reward.amount + " XP");
    const res = await FA.ClickUp.completeTask(task);
    if (res.ok && !res.local) toast("good", "Sincronizado com o ClickUp ✓");
    else if (res.local && State.data.settings.writeBack) toast("xp", "Marcada localmente");
    else if (!res.ok && !res.local) toast("ach", "⚠️ Não consegui concluir no ClickUp — confira a conexão.");
    // some da lista local
    app.tasks = app.tasks.filter((t) => t.id !== task.id);
    renderTasks();
    renderHud();
    renderQuests();
    renderAchievements();
  }

  // ---------- Missões diárias + conquistas ----------
  function renderQuests() {
    const dq = State.data.dailyQuests;
    const box = $("#questList");
    if (!dq) { box.innerHTML = ""; return; }
    box.innerHTML = dq.quests.map((q) => `
      <div class="quest ${q.done ? "done" : ""}">
        <div class="q-top"><span>${q.done ? "✅ " : ""}${escapeHtml(q.label)}</span><span class="q-reward">+${q.reward}</span></div>
        <div class="q-bar"><div class="q-fill" style="width:${Math.round((q.progress / q.goal) * 100)}%"></div></div>
      </div>`).join("");
  }

  function renderAchievements() {
    const grid = $("#achievementGrid");
    grid.innerHTML = State.ACHIEVEMENTS.map((a) => {
      const on = State.isUnlocked(a.id);
      return `<div class="ach ${on ? "unlocked" : ""}" title="${a.name} — ${a.desc}">${a.icon}</div>`;
    }).join("");
  }

  // ---------- Foco (Pomodoro) ----------
  const RING_CIRC = 2 * Math.PI * 130;

  function startFocus(task) {
    if (!task) return;
    app.pendingTask = task;
    app.inFocus = true;
    const mins = State.data.settings.sprintMin;
    app.focus = {
      task, total: mins * 60, left: mins * 60, paused: false,
      distractions: 0, shielded: 0, lastNudge: 0, interval: null,
      endAt: Date.now() + mins * 60 * 1000, pauseStart: null,
    };
    const boss = (cfg.bossByPriority && cfg.bossByPriority[task.priority]) || cfg.bossByPriority.none;
    $("#bossEmoji").textContent = boss.emoji;
    $("#bossName").textContent = "BOSS · " + boss.name;
    $("#bossHpFill").style.width = "100%";
    if (FA.FX) FA.FX.sfx("ui");
    requestNotify(); // pede permissão de notificação (no-op em HTTP/sem secure context)
    $("#focusTask").textContent = task.name;
    $("#distractCount").textContent = "0";
    $("#shieldCount").textContent = "0";
    $("#nudge").hidden = true;
    $("#ringFg").style.strokeDasharray = RING_CIRC;
    $("#btnPause").textContent = "⏸ Pausar";
    $("#ringState").textContent = "FOCO";
    $("#ringState").className = "ring-state";
    updateRing();
    showView("focus");
    app.focus.interval = setInterval(tickFocus, 1000);
  }

  function updateRing() {
    const f = app.focus;
    $("#ringTime").textContent = fmtClock(f.left);
    const pct = f.left / f.total;
    $("#ringFg").style.strokeDashoffset = RING_CIRC * (1 - pct);
    // a vida do boss = tempo restante (some quando você termina o sprint)
    const hp = $("#bossHpFill");
    if (hp) hp.style.width = Math.max(0, pct * 100) + "%";
    if (!f.paused) setFocusTitle(f.left); // tempo visível no título da aba
  }

  function tickFocus() {
    const f = app.focus;
    if (!f || f.paused) return;
    // Relógio real (não conta ticks): imune ao estrangulamento de timers em abas
    // em segundo plano — o tempo restante fica sempre correto.
    f.left = Math.max(0, Math.round((f.endAt - Date.now()) / 1000));
    updateRing();
    // nudge de bem-estar a cada ~10 min (e nunca nos últimos 60s)
    const elapsed = f.total - f.left;
    if (f.left > 60 && elapsed - f.lastNudge >= 600) {
      f.lastNudge = elapsed;
      showNudge();
    }
    if (f.left <= 0) finishFocus(true);
  }

  function showNudge() {
    const n = $("#nudge");
    n.textContent = cfg.nudges[Math.floor(Math.random() * cfg.nudges.length)];
    n.hidden = false;
    setTimeout(() => { n.hidden = true; }, 6000);
  }

  function togglePause() {
    const f = app.focus; if (!f) return;
    f.paused = !f.paused;
    // pausar congela o relógio; retomar empurra o fim pra frente pelo tempo parado
    if (f.paused) f.pauseStart = Date.now();
    else if (f.pauseStart) { f.endAt += Date.now() - f.pauseStart; f.pauseStart = null; }
    if (FA.FX) FA.FX.sfx("ui");
    $("#btnPause").textContent = f.paused ? "▶ Retomar" : "⏸ Pausar";
    $("#ringState").textContent = f.paused ? "PAUSADO" : "FOCO";
    $("#ringState").className = "ring-state" + (f.paused ? " paused" : "");
  }

  function toggleAmbient() {
    if (!FA.FX) return;
    const on = FA.FX.ambientToggle();
    const b = $("#btnAmbient");
    if (b) { b.classList.toggle("active", !!on); b.textContent = on ? "🎧 Som ambiente ✓" : "🎧 Som ambiente"; }
  }

  function finishFocus(completed) {
    const f = app.focus; if (!f) return;
    clearInterval(f.interval);
    app.inFocus = false;
    const elapsedMin = Math.round((f.total - f.left) / 60);

    if (FA.FX) FA.FX.ambientStop();
    if (completed) {
      const r = State.completeSprint({ minutes: State.data.settings.sprintMin, distractions: f.distractions });
      // BOSS DERROTADO 🎉
      $("#bossHpFill").style.width = "0%";
      if (FA.FX) { FA.FX.sfx("victory"); FA.FX.confetti(); FA.FX.flash("rgba(46,194,126,0.16)", 420); }
      showReward(r.reward, r.reward.leveledUp, r.unlocked);
      if (r.bonus) setTimeout(() => toast("good", "🛡️ Sprint intocável! +" + r.bonus.amount + " XP"), 600);
      if (document.hidden) alertBackground("✅ Sprint concluído!", f.task ? f.task.name : "");
      else stopTitleFlash();
      startBreak();
    } else {
      // Encerrou antes — sem punição. Conta o foco parcial.
      if (elapsedMin >= 1) {
        const r = State.awardXp(elapsedMin * cfg.xp.perFocusMinute, "Foco parcial (" + elapsedMin + "min)");
        State.data.player.totalFocusMin += elapsedMin;
        State.markFocusedToday();
        State.save();
        toast("xp", "Foco parcial conta! +" + r.amount + " XP");
      } else {
        toast("xp", "Tudo bem. Volte quando quiser. 💙");
      }
      goMissions();
    }
    renderHud(); renderQuests(); renderAchievements();
  }

  function registerDistraction() {
    if (!app.focus) return;
    app.focus.distractions++;
    $("#distractCount").textContent = app.focus.distractions;
    // o boss "ri" e contra-ataca — puramente cosmético (sem punição de XP)
    if (FA.FX) { FA.FX.shake(7, 280); FA.FX.flash("rgba(255,138,61,0.14)", 240); }
    const b = $("#bossEmoji");
    if (b) { b.classList.remove("boss-hit"); void b.offsetWidth; b.classList.add("boss-hit"); }
    openBrain(); // parqueia o pensamento em vez de seguir ele
  }

  // ---------- Pausa / Arena ----------
  function modeButtonsHtml() {
    const modes = FA.config.arena.modes;
    return `<div class="mode-row">` + Object.keys(modes).map((k) =>
      `<button class="mode-btn${app.arenaMode === k ? " active" : ""}" data-mode="${k}"><b>${modes[k].emoji} ${modes[k].label}</b><small>${modes[k].hint}</small></button>`
    ).join("") + `</div>`;
  }
  function wireModeButtons(ov) {
    $$("[data-mode]", ov).forEach((b) => b.addEventListener("click", () => startArenaRound(b.dataset.mode)));
  }
  function resetArenaOverlay() {
    const ov = $("#arenaOverlay");
    ov.innerHTML =
      `<h2>🎯 Arena de Mira</h2>
       <p>🥇 ouro vale muito · 💀 bomba você <b>não</b> clica · combo multiplica. Escolha o modo:</p>` +
      modeButtonsHtml();
    wireModeButtons(ov);
  }

  function tickBreak() {
    if (app.breakEndAt == null) return;
    app.breakLeft = Math.max(0, Math.round((app.breakEndAt - Date.now()) / 1000));
    if (app.breakLeft <= 0) {
      clearInterval(app.breakInterval);
      app.breakInterval = null;
      app.breakEndAt = null;
      $("#breakLeft").textContent = "acabou";
      toast("good", "⏰ Pausa encerrada. Bora pro próximo alvo!");
      if (document.hidden) alertBackground("⏰ Pausa acabou!", "Bora pro próximo sprint");
    } else {
      $("#breakLeft").textContent = fmtClock(app.breakLeft);
    }
  }

  function startBreak() {
    showView("arena");
    const breakSec = State.data.settings.breakMin * 60;
    app.breakLeft = breakSec;
    app.breakEndAt = Date.now() + breakSec * 1000;
    $("#breakLeft").textContent = fmtClock(breakSec);
    resetArenaOverlay();
    $("#arenaOverlay").hidden = false;
    $("#btnArenaAgain").hidden = true;
    clearInterval(app.breakInterval);
    app.breakInterval = setInterval(tickBreak, 1000);
  }

  function startArenaRound(modeKey) {
    if (typeof modeKey !== "string") modeKey = null; // ignora o Event quando vem de addEventListener
    app.arenaMode = modeKey || app.arenaMode || FA.config.arena.defaultMode;
    $("#arenaOverlay").hidden = true;
    if (!app.arena) app.arena = new FA.Arena($("#arenaCanvas"));
    $("#btnArenaAgain").hidden = true;
    app.arena.start(null,
      (s) => {
        $("#aScore").textContent = s.score;
        $("#aCombo").textContent = s.combo;
        $("#aAcc").textContent = Math.round(s.accuracy * 100) + "%";
        $("#aTime").textContent = s.remaining;
      },
      (end) => {
        const r = State.recordArena({ score: end.score, accuracy: end.accuracy, bestCombo: end.bestCombo, goldHits: end.goldHits, headshots: end.headshots });
        const ov = $("#arenaOverlay");
        ov.hidden = false;
        ov.innerHTML =
          `<h2>Rodada concluída · ${end.mode}</h2>
           <p>${end.score} pts · combo ${end.bestCombo} · ${Math.round(end.accuracy * 100)}% precisão${end.goldHits ? " · 🥇 " + end.goldHits : ""}${end.headshots ? " · 🎯 " + end.headshots + " HS" : ""}</p>
           <p class="muted">+${r.reward.amount} XP${r.reward.crit > 1 ? " (CRÍTICO x" + r.reward.crit + ")" : ""}</p>
           <button class="btn primary big" id="btnArenaStart2">↻ Jogar de novo</button>` +
          modeButtonsHtml();
        $("#btnArenaStart2").addEventListener("click", () => startArenaRound(app.arenaMode));
        wireModeButtons(ov);
        $("#btnArenaAgain").hidden = false;
        showReward(r.reward, r.reward.leveledUp, r.unlocked);
        if (end.score > 0 && FA.FX) FA.FX.confetti(null, null, 40);
        renderHud(); renderQuests(); renderAchievements();
      },
      app.arenaMode);
  }

  function offerCompletePending() {
    if (app.pendingTask) {
      const t = app.pendingTask;
      if (confirm('Concluir a tarefa "' + FA.shorten(t.name, 60) + '" no ClickUp?')) {
        completeTask(t);
      }
      app.pendingTask = null;
    }
  }

  function goMissions() {
    clearInterval(app.breakInterval);
    app.breakInterval = null;
    app.breakEndAt = null;
    if (app.arena) app.arena.stop();
    if (FA.FX) FA.FX.ambientStop();
    stopTitleFlash();
    showView("missions");
  }

  // Pausa rápida sob demanda: abre a Arena pra "desfocar" sem precisar
  // completar um sprint antes. Bloqueada durante um foco ativo.
  function quickBreak() {
    if (app.inFocus) { toast("xp", "Termine ou encerre o foco antes de pausar. 🙂"); return; }
    startBreak();
    toast("good", "☕ Pausa ativa. Estoure uns alvos e volte renovado.");
  }

  // ---------- WhatsApp dock ----------
  function onWaMessage(m) {
    app.waMessages.unshift(m);
    app.waMessages = app.waMessages.slice(0, 50);
    renderWaList();
    if (app.inFocus) {
      app.focus.shielded++;
      $("#shieldCount").textContent = app.focus.shielded;
      if (m.urgency === "high") toast("ach", "🛡️ Msg urgente segurada — você decide depois");
    } else {
      app.waUnread++;
      updateWaBadge();
      if (m.urgency === "high") toast("ach", "💬 " + m.from + " (urgente)");
    }
  }
  function updateWaBadge() {
    const b = $("#waBadge");
    if (app.waUnread > 0) { b.hidden = false; b.textContent = app.waUnread; }
    else b.hidden = true;
  }
  function renderWaList() {
    const list = $("#waList");
    if (!app.waMessages.length) { list.innerHTML = '<div class="wa-empty">Nenhuma mensagem ainda.<br>Conecte sua IA ou clique em “simular”.</div>'; return; }
    list.innerHTML = app.waMessages.map((m) => {
      const time = new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return `<div class="wa-msg ${m.urgency}">
        <div class="from">${escapeHtml(m.from)}<span class="time">${time}</span></div>
        <div class="text">${escapeHtml(m.text)}</div>
      </div>`;
    }).join("");
  }
  function toggleDock(force) {
    const d = $("#waDock");
    const open = force != null ? force : d.hidden;
    d.hidden = !open;
    if (open) { app.waUnread = 0; updateWaBadge(); renderWaList(); }
  }

  // ---------- Brain dump ----------
  function openBrain() { $("#brainModal").hidden = false; renderBrain(); $("#brainInput").focus(); }
  function renderBrain() {
    const list = $("#brainList");
    const items = State.data.brainDump;
    if (!items.length) { list.innerHTML = '<p class="muted small">Nada parqueado. Tua mente tá limpa. 🧘</p>'; return; }
    list.innerHTML = items.map((b) => `
      <div class="brain-item">
        <span>${b.pushed ? "✅ " : ""}${escapeHtml(b.text)}</span>
        <span class="acts">
          ${State.data.settings.writeBack && !b.pushed ? `<button class="ghost-btn" data-push="${b.id}" title="Criar no ClickUp">↗</button>` : ""}
          <button class="ghost-btn" data-del="${b.id}">✕</button>
        </span>
      </div>`).join("");
    $$("[data-del]", list).forEach((x) => x.addEventListener("click", () => { State.removeBrainDump(x.dataset.del); renderBrain(); }));
    $$("[data-push]", list).forEach((x) => x.addEventListener("click", async () => {
      const item = State.data.brainDump.find((b) => b.id === x.dataset.push);
      if (!item) return;
      const r = await FA.ClickUp.createTask(item.text);
      item.pushed = true; State.save();
      toast(r.ok ? "good" : "xp", r.ok && !r.local ? "Criada no ClickUp" : "Marcada localmente");
      renderBrain();
    }));
  }
  function addBrain() {
    const inp = $("#brainInput");
    const v = inp.value.trim();
    if (!v) return;
    State.addBrainDump(v);
    inp.value = "";
    renderBrain(); renderHud(); renderQuests();
    toast("xp", "🧠 Parqueado. +" + cfg.xp.brainDump + " XP");
  }

  // ---------- Config ----------
  function openConfig() {
    const s = State.data.settings;
    $("#cfgSound").checked = s.soundOn;
    $("#cfgMinimal").checked = s.minimalMode;
    $("#cfgToken").value = s.clickupToken;
    $("#cfgList").value = s.listId;
    $("#cfgServer").value = s.serverBase;
    $("#cfgWrite").checked = s.writeBack;
    $("#waHookUrl").textContent = (s.serverBase || "<servidor>") + "/api/whatsapp";
    renderPresets();
    $("#configModal").hidden = false;
  }
  function renderPresets() {
    const row = $("#presetRow");
    row.innerHTML = cfg.sprintPresets.map((p) => `
      <button class="preset ${State.data.settings.preset === p.id ? "active" : ""}" data-preset="${p.id}">
        <b>${p.label}</b><small>${p.hint}</small>
      </button>`).join("");
    $$("[data-preset]", row).forEach((b) => b.addEventListener("click", () => {
      const p = cfg.sprintPresets.find((x) => x.id === b.dataset.preset);
      State.setSettings({ preset: p.id, sprintMin: p.min, breakMin: p.brk });
      renderPresets();
    }));
  }

  // ---------- Reward / toasts ----------
  function showReward(reward, leveledUp, unlocked) {
    if (!reward || !reward.amount) { if (unlocked) unlocked.forEach(achToast); return; }
    const ov = $("#rewardOverlay"), card = $("#rewardCard");
    const crit = reward.crit && reward.crit > 1;
    let html = `<div class="big-xp${crit ? " crit" : ""}">+${reward.amount} XP</div>`;
    if (crit) html += `<div class="crit-tag">${reward.crit >= 3 ? "💥 JACKPOT" : "✦ CRÍTICO"} x${reward.crit}!</div>`;
    if (leveledUp) html += `<div class="lvl">⬆ NÍVEL ${leveledUp}!</div>`;
    // subiu de patente?
    let rankUp = null;
    if (leveledUp && reward.fromLevel != null) {
      const rOld = State.rankForLevel(reward.fromLevel), rNew = State.rankForLevel(reward.toLevel);
      if (rNew.title !== rOld.title) { rankUp = rNew; html += `<div class="rankup">${rNew.icon} ${rNew.title}</div>`; }
    }
    card.innerHTML = html;
    ov.hidden = false;
    clearTimeout(app._rewardT);
    app._rewardT = setTimeout(() => { ov.hidden = true; }, leveledUp ? 2400 : (crit ? 1500 : 1100));
    if (FA.FX) {
      if (leveledUp) { FA.FX.confetti(); FA.FX.sfx("levelup"); }
      else if (crit) { FA.FX.confetti(null, null, 50, ["#ffd24a", "#ff9f1a", "#fff3c4"]); FA.FX.sfx("crit"); }
      if (rankUp) setTimeout(() => { FA.FX.flash("rgba(108,92,231,0.25)", 500); FA.FX.confetti(null, null, 70); }, 250);
    }
    if (unlocked && unlocked.length) unlocked.forEach((a, i) => setTimeout(() => achToast(a), 400 + i * 500));
  }
  function achToast(a) { toast("ach", "🏅 " + a.name + " desbloqueada!"); FA.beep(880, 0.12, "triangle"); }
  function toast(kind, text) {
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.textContent = text;
    $("#toasts").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 2600);
    setTimeout(() => t.remove(), 3000);
  }

  // ---------- Conexão (teste manual) ----------
  async function testConnection() {
    $("#connResult").textContent = "testando…";
    saveConfigFromForm();
    await FA.ClickUp.detect();
    const mode = FA.ClickUp.mode;
    const txt = mode === "server" ? "🟢 Servidor + ClickUp OK"
      : mode === "token" ? "🟡 Token salvo (browser pode bloquear por CORS)"
      : "⚪ Sem conexão — usando dados embutidos";
    $("#connResult").textContent = txt;
    await loadTasks();
  }
  function saveConfigFromForm() {
    State.setSettings({
      soundOn: $("#cfgSound").checked,
      minimalMode: $("#cfgMinimal").checked,
      clickupToken: $("#cfgToken").value.trim(),
      listId: $("#cfgList").value.trim() || cfg.integrations.clickup.listId,
      serverBase: $("#cfgServer").value.trim(),
      writeBack: $("#cfgWrite").checked,
    });
    renderHud();
  }

  // ---------- Boot ----------
  function wire() {
    $("#btnConfig").addEventListener("click", openConfig);
    $("#btnBreak").addEventListener("click", quickBreak);
    $("#btnBrain").addEventListener("click", openBrain);
    $("#btnWa").addEventListener("click", () => toggleDock());
    $("#btnWaClose").addEventListener("click", () => toggleDock(false));
    $("#btnWaSim").addEventListener("click", () => FA.WhatsApp.simulate());
    $("#btnReload").addEventListener("click", loadTasks);

    $("#taskSearch").addEventListener("input", renderTasks);
    $("#statusFilter").addEventListener("change", renderTasks);
    $("#priorityFilter").addEventListener("change", renderTasks);

    $("#btnPause").addEventListener("click", togglePause);
    $("#btnDistract").addEventListener("click", registerDistraction);
    $("#btnAmbient").addEventListener("click", toggleAmbient);
    $("#btnGiveUp").addEventListener("click", () => finishFocus(false));

    $("#btnArenaStart").addEventListener("click", startArenaRound);
    $("#btnArenaAgain").addEventListener("click", startArenaRound);
    $("#btnNextSprint").addEventListener("click", () => { offerCompletePending(); if (app.pendingTask === null) startFocus(app.focus ? app.focus.task : app.tasks[0]); });
    $("#btnBackMissions").addEventListener("click", () => { offerCompletePending(); goMissions(); });

    $("#btnBrainAdd").addEventListener("click", addBrain);
    $("#brainInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addBrain(); });

    $("#btnTestConn").addEventListener("click", testConnection);
    $("#btnReset").addEventListener("click", () => {
      if (confirm("Zerar TODO o progresso (XP, nível, streak, conquistas)?")) {
        State.reset(); renderHud(); renderQuests(); renderAchievements();
        toast("xp", "Progresso zerado.");
      }
    });

    // fechar modais
    $$("[data-close]").forEach((b) => b.addEventListener("click", (e) => {
      const m = e.target.closest(".modal-back"); if (m) { m.hidden = true; saveConfigFromForm(); }
    }));
    $$(".modal-back").forEach((mb) => mb.addEventListener("click", (e) => {
      if (e.target === mb) { mb.hidden = true; saveConfigFromForm(); }
    }));

    // ao voltar pra aba, recalcula os relógios na hora (corrige drift de timer em background)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      stopTitleFlash(); // limpa o "piscar" de aviso ao voltar pra aba
      if (app.inFocus && app.focus && !app.focus.paused) tickFocus();
      if (app.breakEndAt != null) tickBreak();
    });

    // atalhos
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea, select")) {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (e.key === "Escape") $$(".modal-back").forEach((m) => { if (!m.hidden) { m.hidden = true; saveConfigFromForm(); } });
      if (e.key.toLowerCase() === "b") { e.preventDefault(); openBrain(); }
      if (e.key.toLowerCase() === "p") { e.preventDefault(); quickBreak(); }
      if (e.key.toLowerCase() === "a") { e.preventDefault(); toggleAmbient(); }
      if (e.code === "Space" && app.inFocus) { e.preventDefault(); togglePause(); }
    });
  }

  function boot() {
    State.load();
    if (FA.FX) FA.FX.init();
    renderHud();
    renderQuests();
    renderAchievements();
    renderWaList();
    wire();
    FA.WhatsApp.onMessage(onWaMessage);
    FA.WhatsApp.start();
    loadTasks();
    showView("missions");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
