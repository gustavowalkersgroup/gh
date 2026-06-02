/*
 * FOCUS ARENA — camada de "juice" (efeitos visuais + sonoros).
 * Canvas full-screen por cima de tudo (pointer-events:none), partículas/confete,
 * textos flutuantes, screen shake, flash e um motor de áudio (SFX + ruído marrom).
 * Sem dependências. Tudo pendurado em window.FA.FX.
 */
window.FA = window.FA || {};

(function () {
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);

  const FX = {
    canvas: null, ctx: null, w: 0, h: 0, dpr: 1,
    items: [], running: false, _raf: null,
    flashEl: null,
    actx: null, noise: null, noiseGain: null,

    init() {
      this.canvas = document.getElementById("fxCanvas");
      if (this.canvas) {
        this.ctx = this.canvas.getContext("2d");
        this._resize = this._resize.bind(this);
        window.addEventListener("resize", this._resize);
        this._resize();
      }
      // camada de flash (cobre a tela e some)
      const f = document.createElement("div");
      f.id = "fxFlash";
      f.setAttribute("aria-hidden", "true");
      document.body.appendChild(f);
      this.flashEl = f;
    },

    _resize() {
      if (!this.canvas) return;
      this.dpr = window.devicePixelRatio || 1;
      this.w = window.innerWidth; this.h = window.innerHeight;
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    },

    _ensureLoop() {
      if (!this.running) { this.running = true; this._raf = requestAnimationFrame((t) => this._loop(t)); }
    },

    _loop(t) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      const live = [];
      for (const it of this.items) {
        it.life -= 1 / 60;
        if (it.kind === "confetti") {
          it.vy += 0.35; it.x += it.vx; it.y += it.vy; it.rot += it.vr;
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, it.life));
          ctx.translate(it.x, it.y); ctx.rotate(it.rot);
          ctx.fillStyle = it.color;
          ctx.fillRect(-it.s / 2, -it.s / 2, it.s, it.s * 0.5);
          ctx.restore();
        } else if (it.kind === "spark") {
          it.vy += 0.12; it.x += it.vx; it.y += it.vy;
          ctx.globalAlpha = Math.max(0, it.life * 2);
          ctx.fillStyle = it.color;
          ctx.fillRect(it.x, it.y, it.s, it.s);
          ctx.globalAlpha = 1;
        } else if (it.kind === "text") {
          it.y += it.vy; it.vy *= 0.96;
          const a = Math.max(0, Math.min(1, it.life / it.max));
          ctx.globalAlpha = a;
          ctx.font = `800 ${it.size}px "Segoe UI", system-ui, sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.55)";
          ctx.strokeText(it.text, it.x, it.y);
          ctx.fillStyle = it.color;
          ctx.fillText(it.text, it.x, it.y);
          ctx.globalAlpha = 1;
        }
        if (it.life > 0) live.push(it);
      }
      this.items = live;
      if (this.items.length) { this._raf = requestAnimationFrame((tt) => this._loop(tt)); }
      else { this.running = false; ctx.clearRect(0, 0, this.w, this.h); }
    },

    // texto flutuante que sobe e some (ex.: "+24", "CRÍTICO!", "COMBO x10")
    popText(x, y, text, color, opts) {
      opts = opts || {};
      if (!this.ctx) return;
      const max = opts.ttl || 0.9;
      this.items.push({ kind: "text", x, y, vy: opts.vy != null ? opts.vy : -1.4, text, color: color || "#fff", size: opts.size || 22, life: max, max });
      this._ensureLoop();
    },

    burst(x, y, color, n) {
      if (!this.ctx) return;
      n = n || 14;
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), sp = rnd(1, 5);
        this.items.push({ kind: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: rnd(2, 4), color, life: rnd(0.4, 0.8) });
      }
      this._ensureLoop();
    },

    confetti(x, y, count, colors) {
      if (!this.ctx) return;
      count = count || 90;
      colors = colors || ["#3da5ff", "#6c5ce7", "#2ec27e", "#ffd24a", "#ff8a3d", "#ff3b5c"];
      const cx = x == null ? this.w / 2 : x, cy = y == null ? this.h * 0.32 : y;
      for (let i = 0; i < count; i++) {
        this.items.push({
          kind: "confetti", x: cx + rnd(-40, 40), y: cy + rnd(-20, 20),
          vx: rnd(-6, 6), vy: rnd(-11, -3), vr: rnd(-0.3, 0.3), rot: rnd(0, TAU),
          s: rnd(6, 12), color: colors[(Math.random() * colors.length) | 0], life: rnd(1.3, 2.2),
        });
      }
      this._ensureLoop();
    },

    // tremor de tela aplicado num elemento (default: #main)
    shake(intensity, ms, el) {
      if (this._calm()) return;
      el = el || document.getElementById("main") || document.body;
      intensity = intensity || 8; ms = ms || 320;
      const start = performance.now();
      const step = (t) => {
        const k = (t - start) / ms;
        if (k >= 1) { el.style.transform = ""; return; }
        const damp = (1 - k) * intensity;
        el.style.transform = `translate(${rnd(-damp, damp)}px, ${rnd(-damp, damp)}px)`;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },

    flash(color, ms) {
      if (!this.flashEl || this._calm()) return;
      this.flashEl.style.background = color || "rgba(255,255,255,0.35)";
      this.flashEl.style.transition = "none";
      this.flashEl.style.opacity = "1";
      // força reflow e desvanece
      void this.flashEl.offsetWidth;
      this.flashEl.style.transition = `opacity ${ms || 280}ms ease-out`;
      this.flashEl.style.opacity = "0";
    },

    // ---------- ÁUDIO ----------
    _ac() {
      try {
        this.actx = this.actx || new (window.AudioContext || window.webkitAudioContext)();
        if (this.actx.state === "suspended") this.actx.resume();
        return this.actx;
      } catch (e) { return null; }
    },
    _soundOn() { try { return !!FA.State.data.settings.soundOn; } catch (e) { return true; } },
    _calm() { try { return !!FA.State.data.settings.minimalMode; } catch (e) { return false; } },

    tone(freq, dur, type, when, gainPeak) {
      const ac = this._ac(); if (!ac) return;
      const t0 = ac.currentTime + (when || 0);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gainPeak || 0.18, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.12));
      o.connect(g); g.connect(ac.destination);
      o.start(t0); o.stop(t0 + (dur || 0.12) + 0.02);
    },

    // SFX nomeados (respeitam o "som" ligado)
    sfx(name, arg) {
      if (!this._soundOn()) return;
      switch (name) {
        case "hit": this.tone(420 + Math.min(arg || 0, 24) * 22, 0.06, "triangle"); break;
        case "miss": this.tone(140, 0.05, "sawtooth", 0, 0.12); break;
        case "crit": this.tone(700, 0.05, "square"); this.tone(1040, 0.1, "square", 0.05); break;
        case "headshot": this.tone(1300, 0.04, "square"); this.tone(720, 0.14, "sawtooth", 0.03, 0.22); break;
        case "gold": [660, 880, 1320].forEach((f, i) => this.tone(f, 0.12, "triangle", i * 0.06)); break;
        case "bomb": this.tone(90, 0.28, "sawtooth", 0, 0.3); this.tone(60, 0.32, "square", 0.02, 0.25); break;
        case "levelup": [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, "triangle", i * 0.09, 0.2)); break;
        case "victory": [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, "sine", i * 0.1, 0.2)); break;
        case "ui": this.tone(300, 0.04, "sine", 0, 0.08); break;
        default: this.tone(440, 0.08, "sine");
      }
    },

    // ---------- RUÍDO MARROM (soundscape de foco) ----------
    ambientOn() { return !!this.noise; },
    ambientStart() {
      const ac = this._ac(); if (!ac || this.noise) return false;
      const len = 2 * ac.sampleRate;
      const buffer = ac.createBuffer(1, len, ac.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
      const src = ac.createBufferSource(); src.buffer = buffer; src.loop = true;
      const filter = ac.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 850;
      const gain = ac.createGain(); gain.gain.setValueAtTime(0.0001, ac.currentTime);
      gain.gain.linearRampToValueAtTime(0.16, ac.currentTime + 1.2);
      src.connect(filter); filter.connect(gain); gain.connect(ac.destination);
      src.start();
      this.noise = src; this.noiseGain = gain;
      return true;
    },
    ambientStop() {
      if (!this.noise) return;
      const ac = this.actx, src = this.noise, g = this.noiseGain;
      try {
        g.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 0.4);
        setTimeout(() => { try { src.stop(); } catch (e) {} }, 500);
      } catch (e) {}
      this.noise = null; this.noiseGain = null;
    },
    ambientToggle() { return this.ambientOn() ? (this.ambientStop(), false) : this.ambientStart(); },
  };

  FA.FX = FX;
})();
