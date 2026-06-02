/*
 * Estado do jogador + progressão RPG.
 * Persiste em localStorage. Tudo client-side.
 */
window.FA = window.FA || {};

(function () {
  const KEY = FA.config.storageKey;

  function todayStr(d) {
    d = d || new Date();
    return d.toISOString().slice(0, 10);
  }

  function defaultState() {
    return {
      player: {
        xp: 0,
        streakDays: 0,
        lastFocusDate: null,
        totalFocusMin: 0,
        sessionsCompleted: 0,
        tasksCompleted: 0,
        distractionsParked: 0,
        bestCombo: 0,
        bestAccuracy: 0,
      },
      settings: {
        preset: FA.config.defaultPreset,
        sprintMin: 25,
        breakMin: 5,
        soundOn: true,
        minimalMode: false,
        clickupToken: "",
        listId: FA.config.integrations.clickup.listId,
        serverBase: FA.config.integrations.defaultServerBase,
        writeBack: true, // escrever de volta no ClickUp (concluir/criar tarefa)
      },
      achievements: {}, // id -> timestamp
      brainDump: [], // {id, text, ts, pushed}
      dailyQuests: null, // {date, quests:[{id,label,goal,progress,reward,done}]}
      log: [], // últimos eventos (xp ganho etc.) p/ feedback
    };
  }

  const ACHIEVEMENTS = [
    { id: "first_blood", icon: "🩸", name: "Primeiro Sangue", desc: "Conclua seu 1º sprint de foco" },
    { id: "untouchable", icon: "🛡️", name: "Intocável", desc: "Um sprint inteiro sem distrações" },
    { id: "streak3", icon: "🔥", name: "Pegando Fogo", desc: "3 dias seguidos de foco" },
    { id: "streak7", icon: "⚡", name: "Inabalável", desc: "7 dias seguidos de foco" },
    { id: "hyperfocus", icon: "🌀", name: "Hiperfoco", desc: "4 sprints no mesmo dia" },
    { id: "sniper", icon: "🎯", name: "Sniper", desc: "90%+ de precisão na arena" },
    { id: "combo20", icon: "💥", name: "Combo Insano", desc: "Combo de 20 na arena" },
    { id: "clutch", icon: "🚨", name: "Clutch", desc: "Conclua uma tarefa URGENTE" },
    { id: "dump10", icon: "🧠", name: "Mente Limpa", desc: "Parqueie 10 distrações no brain dump" },
    { id: "centurion", icon: "🏛️", name: "Centurião", desc: "100 sprints concluídos no total" },
    { id: "gold_hunter", icon: "🥇", name: "Caçador de Ouro", desc: "Estoure um alvo dourado na arena" },
    { id: "demolisher", icon: "🧨", name: "Demolidor", desc: "Combo de 30 na arena" },
    { id: "flawless", icon: "💯", name: "Impecável", desc: "100% de precisão numa rodada (com pontos)" },
  ];

  const QUEST_POOL = [
    { id: "q_sprints3", label: "Conclua 3 sprints de foco", goal: 3, reward: 80, track: "sprints" },
    { id: "q_focus60", label: "Acumule 60 min de foco", goal: 60, reward: 90, track: "focusMin" },
    { id: "q_task1", label: "Conclua 1 tarefa do ClickUp", goal: 1, reward: 120, track: "tasks" },
    { id: "q_urgent1", label: "Derrube 1 tarefa URGENTE/ALTA", goal: 1, reward: 140, track: "urgentTasks" },
    { id: "q_dump2", label: "Parqueie 2 distrações (brain dump)", goal: 2, reward: 50, track: "dump" },
    { id: "q_arena1", label: "Jogue 1 rodada na arena de mira", goal: 1, reward: 40, track: "arena" },
    { id: "q_untouched1", label: "Faça 1 sprint sem distrações", goal: 1, reward: 100, track: "untouched" },
  ];

  // ---- Curva de XP: nível n exige acumulado 50*n*(n-1) ----
  function cumXp(n) { return 50 * n * (n - 1); }
  function levelFromXp(xp) {
    let n = 1;
    while (cumXp(n + 1) <= xp) n++;
    return n;
  }
  function levelProgress(xp) {
    const n = levelFromXp(xp);
    const floor = cumXp(n), next = cumXp(n + 1);
    return { level: n, into: xp - floor, span: next - floor, pct: (xp - floor) / (next - floor) };
  }

  const State = {
    data: null,
    listeners: [],
    ACHIEVEMENTS,

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        this.data = raw ? Object.assign(defaultState(), JSON.parse(raw)) : defaultState();
        // merge profundo simples p/ settings/player novos
        this.data.player = Object.assign(defaultState().player, this.data.player);
        this.data.settings = Object.assign(defaultState().settings, this.data.settings);
      } catch (e) {
        this.data = defaultState();
      }
      this.refreshDaily();
      this.refreshStreak();
      return this;
    },

    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
      this.emit();
    },

    onChange(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach((fn) => { try { fn(this.data); } catch (e) {} }); },

    // ---- XP / nível ----
    levelInfo() { return levelProgress(this.data.player.xp); },

    awardXp(amount, reason, allowCrit) {
      amount = Math.round(amount);
      if (amount <= 0) return { amount: 0, crit: 1 };
      // Recompensa variável (dopamina): chance de XP crítico / jackpot.
      let crit = 1;
      if (allowCrit !== false) {
        const c = FA.config.crit || {};
        const r = Math.random();
        if (r < (c.jackpotChance || 0)) crit = c.jackpotMult || 3;
        else if (r < (c.jackpotChance || 0) + (c.chance || 0)) crit = c.mult || 2;
      }
      amount = Math.round(amount * crit);
      const before = levelFromXp(this.data.player.xp);
      this.data.player.xp += amount;
      const after = levelFromXp(this.data.player.xp);
      this.pushLog(`+${amount} XP · ${reason}${crit > 1 ? ` (CRÍTICO x${crit})` : ""}`);
      const leveledUp = after > before ? after : 0;
      this.save();
      return { amount, leveledUp, crit, fromLevel: before, toLevel: after };
    },

    // Patente (título RPG) para um dado nível.
    rankForLevel(level) {
      const ranks = FA.config.ranks || [];
      let r = ranks[0] || { title: "", icon: "" };
      for (const x of ranks) { if (level >= x.min) r = x; }
      return r;
    },

    streakMultiplier() {
      const m = 1 + Math.min(
        this.data.player.streakDays * FA.config.xp.streakMultiplierPerDay,
        FA.config.xp.streakMultiplierCap
      );
      return m;
    },

    pushLog(text) {
      this.data.log.unshift({ text, ts: Date.now() });
      this.data.log = this.data.log.slice(0, 12);
    },

    // ---- Streak diário ----
    refreshStreak() {
      const last = this.data.player.lastFocusDate;
      if (!last) return;
      const lastD = new Date(last + "T00:00:00");
      const today = new Date(todayStr() + "T00:00:00");
      const diffDays = Math.round((today - lastD) / 86400000);
      if (diffDays >= 2) {
        this.data.player.streakDays = 0; // perdeu a sequência (sem punição, só reseta)
      }
    },

    markFocusedToday() {
      const today = todayStr();
      const last = this.data.player.lastFocusDate;
      if (last === today) return;
      const lastD = last ? new Date(last + "T00:00:00") : null;
      const todayD = new Date(today + "T00:00:00");
      const diff = lastD ? Math.round((todayD - lastD) / 86400000) : null;
      if (diff === 1) this.data.player.streakDays += 1;
      else this.data.player.streakDays = 1;
      this.data.player.lastFocusDate = today;
      if (this.data.player.streakDays >= 3) this.unlock("streak3");
      if (this.data.player.streakDays >= 7) this.unlock("streak7");
    },

    // ---- Missões diárias (recompensa variável) ----
    refreshDaily() {
      const today = todayStr();
      if (this.data.dailyQuests && this.data.dailyQuests.date === today) return;
      // sorteia 3 missões do pool
      const pool = [...QUEST_POOL];
      const picked = [];
      for (let i = 0; i < 3 && pool.length; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(Object.assign({}, pool.splice(idx, 1)[0], { progress: 0, done: false }));
      }
      this.data.dailyQuests = { date: today, quests: picked, sprintsToday: 0 };
    },

    progressQuest(track, amount) {
      amount = amount == null ? 1 : amount;
      const dq = this.data.dailyQuests;
      if (!dq) return;
      let completedNow = null;
      dq.quests.forEach((q) => {
        if (q.track === track && !q.done) {
          q.progress = Math.min(q.goal, q.progress + amount);
          if (q.progress >= q.goal) {
            q.done = true;
            completedNow = q;
          }
        }
      });
      if (completedNow) {
        this.awardXp(completedNow.reward, `Missão: ${completedNow.label}`);
      } else {
        this.save();
      }
      return completedNow;
    },

    // ---- Conquistas ----
    unlock(id) {
      if (this.data.achievements[id]) return null;
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (!def) return null;
      this.data.achievements[id] = Date.now();
      this.pushLog(`🏅 Conquista: ${def.name}`);
      this.save();
      return def;
    },

    isUnlocked(id) { return !!this.data.achievements[id]; },

    // ---- Eventos de jogo de alto nível ----
    completeSprint({ minutes, distractions }) {
      const p = this.data.player;
      p.sessionsCompleted += 1;
      p.totalFocusMin += minutes;
      this.markFocusedToday();
      if (this.data.dailyQuests) this.data.dailyQuests.sprintsToday += 1;

      const mult = this.streakMultiplier();
      let xp = minutes * FA.config.xp.perFocusMinute * mult;
      const reward = this.awardXp(xp, `Sprint de ${minutes}min (x${mult.toFixed(2)})`);

      const unlocked = [];
      const fb = this.unlock("first_blood"); if (fb) unlocked.push(fb);
      if (this.data.dailyQuests && this.data.dailyQuests.sprintsToday >= 4) {
        const h = this.unlock("hyperfocus"); if (h) unlocked.push(h);
      }
      if (p.sessionsCompleted >= 100) {
        const c = this.unlock("centurion"); if (c) unlocked.push(c);
      }
      this.progressQuest("sprints", 1);
      this.progressQuest("focusMin", minutes);

      let bonus = null;
      if (distractions === 0) {
        bonus = this.awardXp(FA.config.xp.noDistractionBonus, "Sprint intocável");
        const u = this.unlock("untouchable"); if (u) unlocked.push(u);
        this.progressQuest("untouched", 1);
      }
      this.save();
      return { reward, bonus, unlocked };
    },

    completeTask(task) {
      const p = this.data.player;
      p.tasksCompleted += 1;
      const reward = this.awardXp(FA.config.xp.taskComplete, `Tarefa concluída: ${shorten(task.name)}`);
      const unlocked = [];
      this.progressQuest("tasks", 1);
      if (task.priority === "urgent" || task.priority === "high") {
        this.progressQuest("urgentTasks", 1);
        const c = this.unlock("clutch"); if (c) unlocked.push(c);
      }
      this.save();
      return { reward, unlocked };
    },

    recordArena({ score, accuracy, bestCombo, goldHits }) {
      const p = this.data.player;
      p.bestCombo = Math.max(p.bestCombo, bestCombo || 0);
      p.bestAccuracy = Math.max(p.bestAccuracy, accuracy || 0);
      const xp = Math.round((score || 0) * FA.config.xp.arenaPerPoint);
      const reward = this.awardXp(xp, "Arena de mira");
      const unlocked = [];
      if (accuracy >= 0.9 && score > 0) { const s = this.unlock("sniper"); if (s) unlocked.push(s); }
      if (accuracy >= 1 && score > 0) { const f = this.unlock("flawless"); if (f) unlocked.push(f); }
      if ((bestCombo || 0) >= 20) { const c = this.unlock("combo20"); if (c) unlocked.push(c); }
      if ((bestCombo || 0) >= 30) { const d = this.unlock("demolisher"); if (d) unlocked.push(d); }
      if ((goldHits || 0) >= 1) { const g = this.unlock("gold_hunter"); if (g) unlocked.push(g); }
      this.progressQuest("arena", 1);
      this.save();
      return { reward, unlocked };
    },

    addBrainDump(text) {
      const item = { id: "bd_" + Date.now(), text: text.trim(), ts: Date.now(), pushed: false };
      this.data.brainDump.unshift(item);
      this.data.player.distractionsParked += 1;
      this.awardXp(FA.config.xp.brainDump, "Distração parqueada");
      this.progressQuest("dump", 1);
      if (this.data.player.distractionsParked >= 10) this.unlock("dump10");
      this.save();
      return item;
    },

    removeBrainDump(id) {
      this.data.brainDump = this.data.brainDump.filter((b) => b.id !== id);
      this.save();
    },

    setSettings(patch) {
      Object.assign(this.data.settings, patch);
      this.save();
    },

    reset() {
      this.data = defaultState();
      this.refreshDaily();
      this.save();
    },
  };

  function shorten(s, n) { n = n || 40; return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  FA.shorten = shorten;
  FA.todayStr = todayStr;
  FA.State = State;
})();
