// Dare Lab: three one-thumb games sharing one dare system. Each game is pure and deterministic: the same seed and the
// same input frames always give the same game, so a run can travel inside a link (the frames the player pressed and
// let go) and replay on a friend's phone as a ghost. World units: 400 wide, y up.
(function (g) {
  'use strict';
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Random numbers kept inside the game state (a plain number), so a game can be copied mid-run.
  function rnd(st) { st.rs = (st.rs + 0x6D2B79F5) >>> 0; let t = st.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

  // ---------------- STACK: tap to drop the sliding block; overhang is cut off ----------------
  const Stack = {
    id: 'stack', name: 'Wobble Tower', verb: 'Tap to drop', unit: 'blocks', hold: false,
    create(seed) {
      const st = { rs: hashStr('stack:' + seed) };
      return { rs: st.rs, f: 0, blocks: [{ x: 100, w: 200 }], t0: 0, side: rnd(st) < 0.5 ? -1 : 1, score: 0, dead: false, perfectRun: 0, lastCut: null, speedJit: 0.85 + rnd(st) * 0.3,
        amp: 0, ph: rnd(st) * 6.28, calm: 0, stars: 0 };
    },
    // The wobble: the top of the tower sways side to side. It sways more the taller and more lopsided the tower is,
    // and a perfect drop calms it for a few seconds. Worked out from the game's own frames, so replays stay exact.
    lean(s) { let m = 0, wsum = 0; for (const b of s.blocks) { m += (b.x + b.w / 2) * b.w; wsum += b.w; } return Math.abs(m / wsum - 200); },
    wobbleTarget(s) { const a = Math.min(36, 4 + s.score * 0.9 + this.lean(s) * 0.25); return s.calm > 0 ? a * 0.5 : a; },
    shift(s) { return s.amp * Math.sin(s.ph); },            // how far the top block is pushed sideways right now
    topX(s) { return s.blocks[s.blocks.length - 1].x + this.shift(s); },
    speed(s) { return Math.min(7.5, (2.6 + s.score * 0.09) * s.speedJit); },
    slider(s) { // where the moving block is now: it slides in from one side and bounces between the walls
      const top = s.blocks[s.blocks.length - 1], w = top.w, span = 400 + 40 - w, v = this.speed(s);
      let p = ((s.f - s.t0) * v) % (2 * span); if (p > span) p = 2 * span - p;
      return { x: s.side < 0 ? -20 + p : 420 - w - p, w };
    },
    step(s, input) {
      if (s.dead) return s;
      s.f++;
      s.amp += (this.wobbleTarget(s) - s.amp) * 0.03;
      s.ph += 0.036;
      if (s.calm > 0) s.calm--;
      if (input.press) {
        const m = this.slider(s), top = s.blocks[s.blocks.length - 1], sh = this.shift(s), tx = top.x + sh;
        // everything below is in screen-space (where the swaying top really is), then stored back in tower space
        let x0 = Math.max(m.x, tx), x1 = Math.min(m.x + m.w, tx + top.w);
        if (x1 - x0 <= 0) { s.dead = true; s.lastCut = { x: m.x, w: m.w, all: true }; return s; }
        if (Math.abs(m.x - tx) < 4) {
          x0 = tx; x1 = tx + top.w; s.perfectRun++; s.stars++; s.calm = 120;
          s.lastCut = { perfect: true };
          if (s.stars % 3 === 0) { const grow = Math.min(30, 200 - (x1 - x0)); if (grow > 0) { x0 -= grow / 2; x1 += grow / 2; s.lastCut.grew = true; } }
        }
        else { s.perfectRun = 0; s.lastCut = m.x < tx ? { x: m.x, w: tx - m.x } : { x: tx + top.w, w: m.x + m.w - tx - top.w }; }
        s.blocks.push({ x: x0 - sh, w: x1 - x0 });
        s.score++; s.t0 = s.f; s.side = -s.side;
      }
      return s;
    },
  };

  // ---------------- ORBIT: circle a planet, tap to let go and fly to the next one ----------------
  const Orbit = {
    id: 'orbit', name: 'Orbit', verb: 'Tap to let go', unit: 'planets', hold: false,
    create(seed) {
      const s = { rs: hashStr('orbit:' + seed), f: 0, planets: [], cur: 0, ang: -Math.PI / 2, dir: 1, fly: false, px: 0, py: 0, vx: 0, vy: 0, flyT: 0, score: 0, dead: false };
      s.planets.push({ x0: 200, y: 120, rad: 34, amp: 0, ph: 0 });
      this.more(s, 6);
      this.place(s);
      return s;
    },
    more(s, n) {
      for (let i = 0; i < n; i++) {
        const k = s.planets.length, prev = s.planets[k - 1], r = () => rnd(s);
        const rad = Math.max(16, 32 - k * 0.5 - r() * 6);
        let x = 70 + r() * 260; if (Math.abs(x - prev.x0) < 70) x = prev.x0 + (x < prev.x0 ? -1 : 1) * (70 + r() * 60);
        x = Math.max(55, Math.min(345, x));
        const moving = k > 10 && r() < Math.min(0.6, (k - 10) * 0.05);
        s.planets.push({ x0: x, y: prev.y + 140 + r() * 50 + Math.min(40, k * 1.2), rad, amp: moving ? 30 + r() * 40 : 0, ph: r() * 6.28 });
      }
    },
    px(s, p) { return p.x0 + (p.amp ? p.amp * Math.sin(s.f * 0.025 + p.ph) : 0); },
    place(s) { const p = s.planets[s.cur], R = p.rad + 16; s.px = this.px(s, p) + Math.cos(s.ang) * R; s.py = p.y + Math.sin(s.ang) * R; },
    step(s, input) {
      if (s.dead) return s;
      s.f++;
      if (!s.fly) {
        const w = Math.min(0.085, 0.045 + s.cur * 0.0015);
        s.ang += s.dir * w;
        this.place(s);
        if (input.press) {
          const p = s.planets[s.cur], R = p.rad + 16, sp = 6.6;
          s.vx = -Math.sin(s.ang) * s.dir * sp; s.vy = Math.cos(s.ang) * s.dir * sp;
          s.fly = true; s.flyT = 0;
        }
        return s;
      }
      s.px += s.vx; s.py += s.vy; s.flyT++;
      for (let j = s.cur + 1; j <= s.cur + 3 && j < s.planets.length; j++) {
        const p = s.planets[j], dx = s.px - this.px(s, p), dy = s.py - p.y;
        if (dx * dx + dy * dy < (p.rad + 20) * (p.rad + 20)) {
          s.cur = j; s.score = j; s.fly = false; s.ang = Math.atan2(dy, dx); s.dir = j % 2 ? -1 : 1;
          if (s.planets.length - j < 5) this.more(s, 5);
          this.place(s);
          return s;
        }
      }
      const home = s.planets[s.cur];
      if (s.px < -30 || s.px > 430 || s.py < home.y - 120 || s.flyT > 170) s.dead = true;
      return s;
    },
  };

  // ---------------- SWING: hold to grab a peg, let go to fling forward over the lava ----------------
  const Swing = {
    id: 'swing', name: 'Swing', verb: 'Hold to grab, let go to fling', unit: 'm', hold: true,
    create(seed) {
      const s = { rs: hashStr('swing:' + seed), f: 0, pegs: [], x: 60, y: 380, vx: 4.5, vy: 0, rope: null, best: 60, score: 0, dead: false };
      s.pegs.push({ x: 150, y: 470 });
      this.more(s, 8);
      return s;
    },
    more(s, n) {
      for (let i = 0; i < n; i++) {
        const k = s.pegs.length, prev = s.pegs[k - 1], r = () => rnd(s);
        s.pegs.push({ x: prev.x + 140 + r() * 70 + Math.min(70, k * 1.5), y: 400 + r() * 90 });
      }
    },
    step(s, input) {
      if (s.dead) return s;
      s.f++;
      if (input.down && !s.rope) {
        let best = -1, bd = 1e9;
        s.pegs.forEach((p, i) => {
          if (p.x < s.x - 30 || p.x > s.x + 260) return;
          const d = Math.hypot(p.x - s.x, p.y - s.y);
          if (p.y > s.y + 20 && d < 300 && d < bd) { bd = d; best = i; }
        });
        if (best >= 0) { s.rope = { i: best, len: bd }; s.vx *= 1.06; s.vy *= 1.06; } // a grab gives a little kick
      }
      if (!input.down) s.rope = null;
      s.vy -= 0.3;
      s.x += s.vx; s.y += s.vy;
      if (s.rope) {
        const p = s.pegs[s.rope.i], dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy);
        if (d > s.rope.len) {
          const nx = dx / d, ny = dy / d;
          s.x = p.x + nx * s.rope.len; s.y = p.y + ny * s.rope.len;
          const rv = s.vx * nx + s.vy * ny;
          if (rv > 0) { s.vx -= rv * nx; s.vy -= rv * ny; }
        }
      }
      const sp = Math.hypot(s.vx, s.vy); if (sp > 16) { s.vx *= 16 / sp; s.vy *= 16 / sp; }
      if (s.x > s.best) { s.best = s.x; s.score = Math.floor((s.best - 60) / 40); }
      if (s.pegs[s.pegs.length - 1].x - s.x < 900) this.more(s, 6);
      if (s.y < 20) s.dead = true;          // into the lava
      if (s.y > 560) { s.y = 560; if (s.vy > 0) s.vy = 0; } // the ceiling
      return s;
    },
  };

  const GAMES = { stack: Stack, orbit: Orbit, swing: Swing };

  // Inputs are recorded as the frames where the finger went down (and, for Swing, came up). A run is replayed from them.
  function inputAt(events, hold) {
    const downs = new Set(), ups = new Set();
    for (let i = 0; i < events.length; i++) (hold && i % 2 ? ups : downs).add(events[i]);
    let held = false;
    return f => { const press = downs.has(f); if (press) held = true; if (ups.has(f)) held = false; return { press, down: hold ? held : press }; };
  }
  function replay(game, seed, events, maxFrames) {
    const G = GAMES[game], s = G.create(seed), inp = inputAt(events, G.hold), lim = maxFrames || 60 * 600;
    while (!s.dead && s.f < lim) G.step(s, inp(s.f + 1));
    return s;
  }

  function packDare(d) {
    let prev = 0;
    const deltas = d.events.map(t => { const v = (t - prev).toString(36); prev = t; return v; }).join('.');
    return 'v2~' + d.game + '~' + encodeURIComponent(d.day) + '~' + encodeURIComponent(d.name) + '~' + deltas;
  }
  function unpackDare(s) {
    try {
      if (typeof s !== 'string' || s.length > 12000) return null;
      const p = s.split('~');
      if (p.length !== 5 || p[0] !== 'v2' || !GAMES[p[1]]) return null;
      const day = decodeURIComponent(p[2]);
      if (!/^(\d{4}-\d{2}-\d{2}|free-[a-z0-9]{1,12})$/.test(day)) return null;
      const name = decodeURIComponent(p[3]).replace(/[\u0000-\u001f<>~]/g, '').trim().slice(0, 12) || 'A friend';
      let t = 0;
      const events = p[4] ? p[4].split('.').map(v => { if (!/^[0-9a-z]{1,5}$/.test(v)) throw 0; t += parseInt(v, 36); return t; }) : [];
      if (events.length > 4000) return null;
      return { game: p[1], day, name, events };
    } catch (e) { return null; }
  }

  g.DL = { rng, rnd, hashStr, GAMES, inputAt, replay, packDare, unpackDare };
})(typeof window !== 'undefined' ? window : globalThis);
