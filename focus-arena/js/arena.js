/*
 * Arena de mira — mini-game estilo AimLab pras pausas (versão "Boss Hunt").
 * Canvas puro, sem dependências. Alvos de vários tipos surgem, crescem e somem:
 *   normal  — laranja, pontos padrão
 *   mini    — pequeno e raro, vale 3x (sai "CRÍTICO!")
 *   gold 🥇 — dourado, pontos altos fixos + brilho
 *   bomb 💀 — NÃO clique! Clicar zera combo, tira pontos e treme a tela
 * Combo multiplica os pontos; erro/expirar zera o combo.
 * Efeitos visuais/sonoros via FA.FX.
 */
window.FA = window.FA || {};

(function () {
  function now() { return performance.now(); }

  // Compat: FA.beep continua existindo (usado em app.js), roteando pro FX.
  function beep(freq, dur, type) {
    if (FA.FX) FA.FX.tone(freq, dur, type, 0, 0.18);
  }
  FA.beep = beep;

  function sfx(name, arg) { if (FA.FX) FA.FX.sfx(name, arg); }

  class Arena {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.running = false;
      this.targets = [];
      this.mx = -999; this.my = -999;
      this._onTick = null;
      this._onEnd = null;
      this._click = this._handleClick.bind(this);
      this._move = this._handleMove.bind(this);
      this._resize = this._resizeCanvas.bind(this);
    }

    _resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const r = this.canvas.getBoundingClientRect();
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    start(durationSec, onTick, onEnd, modeKey) {
      const A = FA.config.arena;
      this.mode = A.modes[modeKey] || A.modes[A.defaultMode];
      this.TYPES = A.types;
      this._resizeCanvas();
      window.addEventListener("resize", this._resize);
      this.canvas.addEventListener("pointerdown", this._click);
      this.canvas.addEventListener("pointermove", this._move);
      this.duration = (durationSec || this.mode.dur) * 1000;
      this.startTs = now();
      this.lastSpawn = 0;
      this.score = 0; this.combo = 0; this.bestCombo = 0;
      this.hits = 0; this.shots = 0; this.goldHits = 0; this.bombHits = 0;
      this.targets = [];
      this.running = true;
      this._onTick = onTick; this._onEnd = onEnd;
      this._loop();
    }

    stop() {
      this.running = false;
      window.removeEventListener("resize", this._resize);
      this.canvas.removeEventListener("pointerdown", this._click);
      this.canvas.removeEventListener("pointermove", this._move);
      cancelAnimationFrame(this._raf);
    }

    _difficulty() { return Math.min(1, (now() - this.startTs) / this.duration); }

    _pickType() {
      const m = this.mode, d = this._difficulty();
      const r = Math.random();
      // bombas e minis ficam um pouco mais comuns conforme a rodada esquenta
      const bomb = m.bombChance * (0.6 + d * 0.8);
      const gold = m.goldChance;
      const mini = m.miniChance * (0.7 + d * 0.6);
      if (r < bomb) return "bomb";
      if (r < bomb + gold) return "gold";
      if (r < bomb + gold + mini) return "mini";
      return "normal";
    }

    _spawn() {
      const m = this.mode, d = this._difficulty();
      const type = this._pickType();
      const tcfg = this.TYPES[type] || this.TYPES.normal;
      const baseMax = m.sizeMax - d * (m.sizeMax - m.sizeMin) * 0.7;
      let r = m.sizeMin + Math.random() * Math.max(3, baseMax - m.sizeMin);
      if (tcfg.sizeMul) r *= tcfg.sizeMul;
      const pad = r + 10;
      this.targets.push({
        x: pad + Math.random() * (this.w - pad * 2),
        y: pad + Math.random() * (this.h - pad * 2),
        r, born: now(), life: m.lifeMax - d * (m.lifeMax - m.lifeMin), hit: false, type,
      });
    }

    _handleMove(ev) {
      const rect = this.canvas.getBoundingClientRect();
      this.mx = ev.clientX - rect.left; this.my = ev.clientY - rect.top;
    }

    _handleClick(ev) {
      if (!this.running) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      this.shots++;
      let hitIdx = -1;
      for (let i = this.targets.length - 1; i >= 0; i--) {
        const t = this.targets[i];
        const dx = x - t.x, dy = y - t.y;
        if (dx * dx + dy * dy <= t.r * t.r) { hitIdx = i; break; }
      }
      if (hitIdx < 0) {            // errou o tiro
        this.combo = 0;
        sfx("miss");
        if (FA.FX) FA.FX.burst(ev.clientX, ev.clientY, "#ff3b5c", 6);
        return;
      }

      const t = this.targets[hitIdx];
      this.targets.splice(hitIdx, 1);
      const tcfg = this.TYPES[t.type] || this.TYPES.normal;

      if (t.type === "bomb") {     // clicou na bomba — penalidade
        this.combo = 0;
        this.score = Math.max(0, this.score - (tcfg.penalty || 30));
        this.bombHits++;
        sfx("bomb");
        if (FA.FX) {
          FA.FX.shake(11, 360); FA.FX.flash("rgba(255,59,92,0.28)", 320);
          FA.FX.burst(ev.clientX, ev.clientY, "#ff3b5c", 22);
          FA.FX.popText(ev.clientX, ev.clientY, "-" + (tcfg.penalty || 30), "#ff3b5c", { size: 26 });
        }
        return;
      }

      // acerto bom
      this.hits++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
      const baseRaw = Math.max(5, Math.round(40 - t.r));
      let pts = (tcfg.flat || baseRaw) * (tcfg.scoreMul || 1) * (1 + this.combo * 0.1);
      pts = Math.round(pts);
      this.score += pts;

      const color = t.type === "gold" ? "#ffd24a" : t.type === "mini" ? "#a29bfe" : "#2ec27e";
      if (FA.FX) {
        FA.FX.burst(ev.clientX, ev.clientY, color, t.type === "gold" ? 22 : 12);
        FA.FX.popText(ev.clientX, ev.clientY, "+" + pts, color, { size: t.type === "gold" ? 28 : 22 });
      }

      if (t.type === "gold") { this.goldHits++; sfx("gold"); if (FA.FX) FA.FX.flash("rgba(255,210,74,0.18)", 260); }
      else if (t.type === "mini") { sfx("crit"); if (FA.FX) FA.FX.popText(ev.clientX, ev.clientY - 26, "CRÍTICO!", "#a29bfe", { size: 16, ttl: 0.7 }); }
      else { sfx("hit", this.combo); }

      // callouts de combo
      if ([5, 10, 15, 20, 30, 40].includes(this.combo) && FA.FX) {
        FA.FX.popText(this.w / 2 + rect.left, 46 + rect.top, "COMBO x" + this.combo + " 🔥", "#ff8a3d", { size: 30, ttl: 1.0, vy: -0.6 });
        if (this.combo >= 10) FA.FX.shake(4 + this.combo * 0.15, 200);
      }
    }

    _loop() {
      if (!this.running) return;
      const t = now();
      const elapsed = t - this.startTs;
      const remaining = Math.max(0, this.duration - elapsed);
      const d = this._difficulty();

      const interval = this.mode.spawnMax - d * (this.mode.spawnMax - this.mode.spawnMin);
      if (t - this.lastSpawn > interval && this.targets.length < this.mode.maxTargets) {
        this._spawn(); this.lastSpawn = t;
      }

      this.targets = this.targets.filter((tg) => {
        if (t - tg.born > tg.life) { if (tg.type !== "bomb") this.combo = 0; return false; }
        return true;
      });

      this._render(d);

      if (this._onTick) {
        this._onTick({
          score: this.score, combo: this.combo, bestCombo: this.bestCombo,
          accuracy: this.shots ? this.hits / this.shots : 0,
          remaining: Math.ceil(remaining / 1000),
        });
      }

      if (elapsed >= this.duration) {
        this.stop();
        if (this._onEnd) this._onEnd({
          score: this.score, bestCombo: this.bestCombo,
          accuracy: this.shots ? this.hits / this.shots : 0,
          hits: this.hits, shots: this.shots, goldHits: this.goldHits, bombHits: this.bombHits,
          mode: this.mode.label,
        });
        return;
      }
      this._raf = requestAnimationFrame(() => this._loop());
    }

    _render(d) {
      const ctx = this.ctx, t = now();
      ctx.clearRect(0, 0, this.w, this.h);

      // fundo radial sutil, intensifica com combo
      const heat = Math.min(0.22, 0.06 + this.combo * 0.008);
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, 10, this.w / 2, this.h / 2, Math.max(this.w, this.h) / 1.2);
      g.addColorStop(0, `rgba(61,165,255,${heat})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);

      this.targets.forEach((tg) => {
        const age = (t - tg.born) / tg.life;
        const grow = age < 0.18 ? age / 0.18 : 1;
        const fade = age > 0.72 ? 1 - (age - 0.72) / 0.28 : 1;
        const r = tg.r * grow;
        ctx.globalAlpha = Math.max(0, fade);

        if (tg.type === "bomb") {
          ctx.beginPath(); ctx.arc(tg.x, tg.y, r, 0, Math.PI * 2);
          ctx.fillStyle = "#1a1d26"; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = "#ff3b5c"; ctx.stroke();
          ctx.font = `${Math.round(r * 1.1)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("💀", tg.x, tg.y + 1);
        } else if (tg.type === "gold") {
          ctx.shadowColor = "#ffd24a"; ctx.shadowBlur = 18;
          ctx.beginPath(); ctx.arc(tg.x, tg.y, r, 0, Math.PI * 2); ctx.fillStyle = "#ffd24a"; ctx.fill();
          ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.arc(tg.x, tg.y, r * 0.6, 0, Math.PI * 2); ctx.fillStyle = "#ff9f1a"; ctx.fill();
          ctx.font = `${Math.round(r * 0.9)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("★", tg.x, tg.y + 1);
        } else {
          const tcfg = this.TYPES[tg.type] || this.TYPES.normal;
          ctx.beginPath(); ctx.arc(tg.x, tg.y, r, 0, Math.PI * 2); ctx.fillStyle = tcfg.color; ctx.fill();
          ctx.beginPath(); ctx.arc(tg.x, tg.y, r * 0.66, 0, Math.PI * 2); ctx.fillStyle = "#10141c"; ctx.fill();
          ctx.beginPath(); ctx.arc(tg.x, tg.y, r * 0.33, 0, Math.PI * 2); ctx.fillStyle = tcfg.inner; ctx.fill();
        }
        ctx.globalAlpha = 1;
      });

      // mira reativa (cor escala com o combo)
      if (this.mx > -100) {
        const cc = this.combo >= 20 ? "#ff8a3d" : this.combo >= 10 ? "#ffd24a" : "#3da5ff";
        const sz = 10 + Math.min(this.combo, 25) * 0.4;
        ctx.strokeStyle = cc; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(this.mx, this.my, sz, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.mx - sz - 6, this.my); ctx.lineTo(this.mx - sz + 2, this.my);
        ctx.moveTo(this.mx + sz - 2, this.my); ctx.lineTo(this.mx + sz + 6, this.my);
        ctx.moveTo(this.mx, this.my - sz - 6); ctx.lineTo(this.mx, this.my - sz + 2);
        ctx.moveTo(this.mx, this.my + sz - 2); ctx.lineTo(this.mx, this.my + sz + 6);
        ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
  }

  FA.Arena = Arena;
})();
