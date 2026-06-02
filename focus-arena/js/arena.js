/*
 * Arena de mira — mini-game estilo AimLab pras pausas.
 * Canvas puro, sem dependências. Alvos surgem, crescem e somem;
 * clique pra estourar. Combo multiplica os pontos. Erros quebram o combo.
 */
window.FA = window.FA || {};

(function () {
  function now() { return performance.now(); }

  // beep curto via WebAudio (respeita o som ligado/desligado)
  let audioCtx = null;
  function beep(freq, dur, type) {
    if (!FA.State.data.settings.soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (dur || 0.08));
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + (dur || 0.08));
    } catch (e) {}
  }
  FA.beep = beep;

  class Arena {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.running = false;
      this.targets = [];
      this.particles = [];
      this._onTick = null;
      this._onEnd = null;
      this._click = this._handleClick.bind(this);
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

    start(durationSec, onTick, onEnd) {
      this._resizeCanvas();
      window.addEventListener("resize", this._resize);
      this.canvas.addEventListener("pointerdown", this._click);
      this.duration = durationSec * 1000;
      this.startTs = now();
      this.lastSpawn = 0;
      this.score = 0; this.combo = 0; this.bestCombo = 0;
      this.hits = 0; this.shots = 0;
      this.targets = []; this.particles = [];
      this.running = true;
      this._onTick = onTick; this._onEnd = onEnd;
      this._loop();
    }

    stop() {
      this.running = false;
      window.removeEventListener("resize", this._resize);
      this.canvas.removeEventListener("pointerdown", this._click);
      cancelAnimationFrame(this._raf);
    }

    _difficulty() {
      // 0 -> 1 ao longo da rodada
      const t = Math.min(1, (now() - this.startTs) / this.duration);
      return t;
    }

    _spawn() {
      const d = this._difficulty();
      const maxR = 34 - d * 14;       // alvos encolhem
      const minR = 16 - d * 6;
      const r = minR + Math.random() * (maxR - minR);
      const pad = r + 8;
      this.targets.push({
        x: pad + Math.random() * (this.w - pad * 2),
        y: pad + Math.random() * (this.h - pad * 2),
        r,
        born: now(),
        life: 1500 - d * 700,         // somem mais rápido
        hit: false,
      });
    }

    _handleClick(ev) {
      if (!this.running) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      this.shots++;
      // acerta o alvo mais próximo sob o cursor (do topo da pilha)
      let hitIdx = -1;
      for (let i = this.targets.length - 1; i >= 0; i--) {
        const t = this.targets[i];
        const dx = x - t.x, dy = y - t.y;
        if (dx * dx + dy * dy <= t.r * t.r) { hitIdx = i; break; }
      }
      if (hitIdx >= 0) {
        const t = this.targets[hitIdx];
        this.targets.splice(hitIdx, 1);
        this.hits++;
        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const base = Math.round(40 - t.r);            // alvos menores valem mais
        const pts = Math.max(5, base) * (1 + this.combo * 0.1);
        this.score += Math.round(pts);
        this._burst(t.x, t.y, "#2ec27e");
        beep(420 + Math.min(this.combo, 20) * 24, 0.06, "triangle");
      } else {
        this.combo = 0; // errou -> zera combo
        this._burst(x, y, "#ff3b5c", 6);
        beep(140, 0.05, "sawtooth");
      }
    }

    _burst(x, y, color, n) {
      n = n || 14;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 4;
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
      }
    }

    _loop() {
      if (!this.running) return;
      const t = now();
      const elapsed = t - this.startTs;
      const remaining = Math.max(0, this.duration - elapsed);

      // spawn ritmado pela dificuldade
      const d = this._difficulty();
      const interval = 900 - d * 520;
      if (t - this.lastSpawn > interval && this.targets.length < 6) {
        this._spawn();
        this.lastSpawn = t;
      }

      // expira alvos não acertados (quebra combo)
      this.targets = this.targets.filter((tg) => {
        if (t - tg.born > tg.life) { this.combo = 0; return false; }
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
        if (this._onEnd) {
          this._onEnd({
            score: this.score, bestCombo: this.bestCombo,
            accuracy: this.shots ? this.hits / this.shots : 0,
            hits: this.hits, shots: this.shots,
          });
        }
        return;
      }
      this._raf = requestAnimationFrame(() => this._loop());
    }

    _render(d) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);

      // fundo radial sutil
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, 10, this.w / 2, this.h / 2, Math.max(this.w, this.h) / 1.2);
      g.addColorStop(0, "rgba(61,165,255,0.06)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);

      const t = now();
      this.targets.forEach((tg) => {
        const age = (t - tg.born) / tg.life; // 0..1
        const grow = age < 0.2 ? age / 0.2 : 1;        // cresce no início
        const fade = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1; // some no fim
        const r = tg.r * grow;
        ctx.globalAlpha = Math.max(0, fade);
        // anel externo
        ctx.beginPath(); ctx.arc(tg.x, tg.y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#ff8a3d"; ctx.fill();
        ctx.beginPath(); ctx.arc(tg.x, tg.y, r * 0.66, 0, Math.PI * 2);
        ctx.fillStyle = "#10141c"; ctx.fill();
        ctx.beginPath(); ctx.arc(tg.x, tg.y, r * 0.33, 0, Math.PI * 2);
        ctx.fillStyle = "#ff3b5c"; ctx.fill();
        ctx.globalAlpha = 1;
      });

      // partículas
      this.particles = this.particles.filter((p) => p.life > 0);
      this.particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.03;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
        ctx.globalAlpha = 1;
      });
    }
  }

  FA.Arena = Arena;
})();
