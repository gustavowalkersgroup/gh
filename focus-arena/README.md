# 🎯 FOCUS ARENA

Um jogo de navegador feito pra te ajudar a **FOCAR no serviço** e domar o TDAH — fundindo
um **treino de mira estilo AimLab** (dopamina rápida nas pausas) com uma **progressão RPG**
(XP, níveis, streaks, missões e conquistas) construída em cima das suas **tarefas reais do ClickUp**.

> Híbrido: cada **sprint de foco** (Pomodoro) é uma batalha; cada **tarefa concluída** é um
> inimigo derrubado; cada **pausa** é uma rodada de mira pra recarregar o cérebro.

---

## ✨ O que tem dentro

### Loop de foco (anti-TDAH)
- **Sprints Pomodoro** com anel de contagem regressiva gigante (body-doubling visual).
- **Presets de ritmo**: Micro `10/2`, Curto `15/3`, Clássico `25/5`, Deep `50/10`.
- **Brain dump** (tecla `B`): bateu um pensamento intrusivo? Parqueia num clique e segue o jogo
  — a ideia não some, e você ainda ganha XP por *não* seguir a distração.
- **Botão "Me distraí…"**: transforma a distração em ação consciente (registra + parqueia).
- **Nudges de bem-estar** durante o foco (água, postura, regra 20-20-20).
- **Sem punição**: encerrar cedo ainda conta o foco parcial. O design é gentil de propósito.
- **Modo minimalista** pra reduzir estímulo visual quando precisar.

### Arena de mira (pausas)
- Mini-game estilo **AimLab** no canvas: alvos surgem, encolhem e somem.
- **Combo** multiplica os pontos; erro zera o combo; dificuldade sobe ao longo da rodada.
- Pontuação vira **XP** e alimenta conquistas (Sniper, Combo Insano…).

### Progressão RPG
- **XP / Níveis** com curva crescente e **multiplicador de streak** (+5%/dia, até +50%).
- **Streak diário** de foco 🔥.
- **Missões diárias** sorteadas (recompensa variável = dopamina).
- **10 conquistas** (Primeiro Sangue, Intocável, Hiperfoco, Clutch, Centurião…).
- Tudo salvo no **localStorage** (nada sai do seu navegador, exceto o que você manda pro ClickUp).

### Integrações
- **ClickUp ao vivo** — o jogo já vem pré-populado com as tarefas reais da sua lista
  *"Fluxo de tarefas" (Walkers - Equipe)*. Prioridade vira "nível de ameaça", status e prazos
  viram chips. Dá pra **concluir** tarefas (write-back) e **criar** tarefas a partir do brain dump.
- **WhatsApp AI (webhook)** — sua IA de leitura faz `POST` das mensagens e elas aparecem num
  dock. **Durante o foco, mensagens viram "escudos"** (ficam seguradas, não te puxam) e você
  decide na pausa. Urgentes dão um aviso discreto.

---

## 🚀 Como rodar

### Opção A — Só abrir (mais simples)
Abra o `index.html` no navegador. O jogo funciona 100% offline, já populado com as suas
tarefas reais embutidas. WhatsApp tem botão **"simular"** pra testar.

> Observação: nesse modo o ClickUp ao vivo só funciona se você colar o token nas Configurações
> (⚙️), e o navegador **pode bloquear por CORS**. Pra integração 100% estável, use a Opção B.

### Opção B — Com servidor (ClickUp ao vivo + webhook do WhatsApp) — recomendado
Servidor em **Node puro, zero dependências**:

```bash
# na pasta focus-arena/
CLICKUP_TOKEN=pk_seu_token node server/webhook-server.js
# abra http://localhost:4173
```

O servidor:
1. Serve o jogo.
2. Faz **proxy autenticado** do ClickUp em `/api/clickup/*` (resolve CORS, esconde o token).
3. Recebe o **webhook do WhatsApp** em `/api/whatsapp`.

Variáveis (veja `.env.example`): `PORT`, `CLICKUP_TOKEN`, `WHATSAPP_SHARED_SECRET`.

---

## 🤖 Plugando sua IA de leitura do WhatsApp

Sua IA só precisa fazer um `POST` quando ler uma mensagem relevante:

```bash
curl -X POST http://localhost:4173/api/whatsapp \
  -H "Content-Type: application/json" \
  -d '{ "from": "Cliente HIVEN", "text": "o disparo já saiu?", "urgency": "high" }'
```

Campos:
| campo     | obrigatório | valores                          |
|-----------|-------------|----------------------------------|
| `from`    | não         | nome do remetente                |
| `text`    | sim         | conteúdo / resumo da mensagem    |
| `urgency` | não         | `"low"` \| `"normal"` \| `"high"` |

Se você definir `WHATSAPP_SHARED_SECRET`, mande também o header `x-fa-secret: <valor>`.

O jogo busca as mensagens sozinho (polling a cada 4s, só com a aba visível). Também há um
`BroadcastChannel("focus-arena-wa")` caso você prefira empurrar via extensão/script local.

### Fluxo n8n pronto (triagem de urgência com IA)

Já existe um workflow no n8n — **"Focus Arena - Triagem de WhatsApp"** — que faz a ponte com
classificação de urgência por IA. Arquitetura em dois saltos:

```
IA de leitura do WhatsApp
        │  POST  { from, text }
        ▼
n8n: webhook /webhook/whatsapp-in
        │
        ▼  classifica urgência (OpenAI) → low | normal | high
        │
        ▼  POST { from, text, urgency }
Focus Arena: /api/whatsapp   ──►  vira "escudo" durante o foco
```

Para ligar:
1. Abra o workflow no n8n e, no nó **"Enviar pro Focus Arena"**, troque a URL pelo endereço
   acessível do seu Focus Arena (ex.: `https://SEU-HOST/api/whatsapp` — um túnel tipo ngrok
   ou um deploy; `localhost` não é alcançável pelo n8n).
2. **Ative** o workflow. A URL de produção do webhook fica `https://<seu-n8n>/webhook/whatsapp-in`.
3. Aponte sua IA de leitura do WhatsApp para fazer `POST` nessa URL do n8n (em vez de direto no jogo).

A credencial de OpenAI é reaproveitada automaticamente; o nó HTTP não precisa de credencial
(a menos que você use `WHATSAPP_SHARED_SECRET` — aí adicione um header `x-fa-secret` via
credencial *Header Auth* no nó HTTP).

---

## ⌨️ Atalhos
- `B` — abre o brain dump
- `espaço` — pausa/retoma o sprint
- `Esc` — fecha modais

## 📁 Estrutura
```
focus-arena/
├── index.html
├── css/styles.css
├── js/
│   ├── config.js        # constantes, presets, economia de XP
│   ├── seed-tasks.js     # tarefas reais do ClickUp (snapshot offline)
│   ├── state.js          # estado + RPG (XP, nível, streak, missões, conquistas)
│   ├── integrations.js   # ClickUp (proxy/token/seed) + WhatsApp (webhook/poll)
│   ├── arena.js          # mini-game de mira (canvas)
│   └── app.js            # controlador / UI / loop de foco
├── server/webhook-server.js   # opcional: estáticos + proxy ClickUp + webhook
└── .env.example
```

Feito pra ser fácil de começar e difícil de largar. Bom foco. 💙
