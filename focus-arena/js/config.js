/*
 * FOCUS ARENA — configuração global
 * Sem módulos ES (pra funcionar abrindo o index.html direto via file://).
 * Tudo pendura no namespace global window.FA.
 */
window.FA = window.FA || {};

FA.config = {
  version: "1.0.0",
  storageKey: "focusArena.v1",

  // Presets de foco pensados pra TDAH: do micro-sprint ao deep work.
  // "min" = minutos de foco, "brk" = minutos de pausa (arena de mira).
  sprintPresets: [
    { id: "micro", label: "Micro · 10/2", min: 10, brk: 2, hint: "Pra começar quando a tarefa parece grande demais" },
    { id: "curto", label: "Curto · 15/3", min: 15, brk: 3, hint: "Bom equilíbrio pra dias dispersos" },
    { id: "classico", label: "Clássico · 25/5", min: 25, brk: 5, hint: "Pomodoro tradicional" },
    { id: "deep", label: "Deep · 50/10", min: 50, brk: 10, hint: "Quando o hiperfoco aparecer, surfe nele" },
  ],
  defaultPreset: "classico",

  // Economia de XP (recompensa variável = dopamina).
  xp: {
    perFocusMinute: 4, // sprint de 25min = 100 XP base
    noDistractionBonus: 60, // sprint "intocável"
    taskComplete: 120,
    brainDump: 8, // recompensa por parquear a distração em vez de seguir ela
    arenaPerPoint: 0.05, // pontos da arena -> XP
    streakMultiplierPerDay: 0.05, // +5% por dia de streak (cap abaixo)
    streakMultiplierCap: 0.5,
  },

  // Mapeamento de prioridade do ClickUp -> "nível de ameaça" no jogo.
  priority: {
    urgent: { label: "Urgente", threat: "CRÍTICO", color: "#ff3b5c", weight: 4 },
    high: { label: "Alta", threat: "ALTO", color: "#ff8a3d", weight: 3 },
    normal: { label: "Normal", threat: "MÉDIO", color: "#3da5ff", weight: 2 },
    low: { label: "Baixa", threat: "BAIXO", color: "#8b95a7", weight: 1 },
    none: { label: "Sem prioridade", threat: "—", color: "#5a6478", weight: 0 },
  },

  // Status do ClickUp -> tipo visual.
  status: {
    "a fazer": { type: "todo", label: "A fazer", color: "#8b95a7" },
    "fazendo": { type: "doing", label: "Fazendo", color: "#3da5ff" },
    "bloqueio": { type: "blocked", label: "Bloqueio", color: "#ff3b5c" },
    "done": { type: "done", label: "Concluído", color: "#2ec27e" },
  },

  // Integração — tudo opcional e configurável pela UI.
  integrations: {
    // Quando o jogo é servido pelo webhook-server.js, usamos a mesma origem.
    // Caso contrário, o usuário pode apontar pra um servidor remoto.
    defaultServerBase: "", // "" = mesma origem
    clickup: {
      listId: "901326534312", // "Fluxo de tarefas" — Walkers - Equipe
      spaceName: "Walkers - Equipe",
      apiBase: "https://api.clickup.com/api/v2",
    },
    whatsapp: {
      pollMs: 4000, // só roda com a aba visível
      broadcastChannel: "focus-arena-wa",
    },
  },

  // Nudges de bem-estar durante o foco (anti-hiperfoco destrutivo).
  nudges: [
    "💧 Bebe uma água. Sério.",
    "🧍 Ajeita a postura, ombros pra trás.",
    "👀 Olha pra longe 20s (regra 20-20-20).",
    "🫁 Respira fundo 3x. Você tá indo bem.",
    "🦵 Mexe o pé, descruza as pernas.",
  ],
};
