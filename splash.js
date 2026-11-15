/* Splash effects when the camera breaks the surface: flying spray, foam, a camera kick, a white-out of aerated water,
   and water drops on the "lens" that run down the screen. The drops are refracted by the ocean shader (see ocean.js);
   this file simulates them and paints the glassy rims, highlights and trails on a 2D overlay canvas. */
(function () {
  "use strict";
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  function create(canvas) {
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1;
    var parts = [], drops = [], bubbles = [];
    var cover = 0, shakeAmp = 0, active = false;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    // Burst out of the water (p = 0..1 strength)
    function exit(p) {
      p = clamp(p, 0.1, 1);
      if (parts.length > 900) return;                  // hard cap if someone scrolls back and forth through the surface
      var i, n = Math.round(60 + 200 * p);
      for (i = 0; i < n; i++) {
        var big = Math.random() < 0.08;
        parts.push({ kind: "spray", x: rnd(-0.05, 1.05) * W, y: rnd(0.50, 1.10) * H,
                     vx: rnd(-230, 230) * (0.4 + p), vy: -rnd(260, 1500) * (0.35 + 0.65 * p),
                     r: big ? rnd(3.5, 7.5) : rnd(0.7, 2.8), life: rnd(0.8, 2.2), age: 0 });
      }
      for (i = 0; i < 18; i++) {
        parts.push({ kind: "foam", x: rnd(0.02, 0.98) * W, y: rnd(0.50, 1.0) * H, vx: rnd(-50, 50), vy: -rnd(40, 280) * p,
                     r: rnd(34, 100), life: rnd(0.5, 1.1), age: 0 });
      }
      var aspect = W / H, nd = Math.round(9 + 8 * p);
      for (i = 0; i < nd && drops.length < 16; i++) {
        var r = Math.random() < 0.25 ? rnd(0.034, 0.062) : rnd(0.012, 0.032);
        drops.push({ x: rnd(-0.5, 0.5) * aspect, y: rnd(-0.45, 0.50), r: r, a: 1, v: 0, t: 0, y0: 0,
                     delay: rnd(0.15, 2.6) + (r > 0.03 ? 0 : 0.6), life: rnd(5.5, 9.5), pause: 0, vmax: 0.035 + r * 5.5 });
        drops[drops.length - 1].y0 = drops[drops.length - 1].y;
      }
      cover = Math.max(cover, p);
      shakeAmp = Math.max(shakeAmp, 0.012 * p);
      active = true;
    }

    // Dive into the water: a burst of bubbles
    function enter(p) {
      p = clamp(p, 0.1, 1);
      if (bubbles.length > 400) return;
      var n = Math.round(40 + 140 * p);
      for (var i = 0; i < n; i++) {
        bubbles.push({ x: rnd(0, W), y: rnd(0.10, 0.75) * H, vx: rnd(-30, 30), vy: -rnd(70, 330), r: rnd(1.5, 6.5), life: rnd(0.9, 2.0), age: 0 });
      }
      cover = Math.max(cover, 0.5 * p);
      shakeAmp = Math.max(shakeAmp, 0.005 * p);
      active = true;
    }

    function update(dt) {
      dt = Math.min(dt, 0.05);
      cover *= Math.exp(-dt / 0.30);
      shakeAmp *= Math.exp(-dt / 0.18);
      var i, p;
      for (i = parts.length - 1; i >= 0; i--) {
        p = parts[i]; p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        if (p.kind === "spray") p.vy += 1750 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === "foam") { p.r += 40 * dt; }
      }
      for (i = bubbles.length - 1; i >= 0; i--) {
        p = bubbles[i]; p.age += dt;
        if (p.age >= p.life) { bubbles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (i = drops.length - 1; i >= 0; i--) {
        p = drops[i]; p.t += dt;
        if (p.t > p.life) { drops.splice(i, 1); continue; }
        if (p.t > p.delay) {
          p.pause -= dt;
          if (p.pause <= 0) {
            p.v = Math.min(p.vmax, p.v + (0.25 + p.r * 9) * dt);          // heavier drops pick up speed faster
            if (Math.random() < dt * 0.9) { p.pause = rnd(0.12, 0.45); p.v *= 0.2; }  // stick-and-slide
            p.y -= p.v * dt;
            p.r = Math.max(0.006, p.r - 0.0006 * dt);                      // loses a little water as it runs
          }
        }
        p.a = clamp((p.life - p.t) / 2.5, 0, 1);
        if (p.y < -0.62) drops.splice(i, 1);
      }
      active = parts.length || bubbles.length || drops.length || cover > 0.01;
    }

    function draw() {
      if (!active && !draw.dirty) return;
      draw.dirty = !!active;
      ctx.clearRect(0, 0, W, H);
      var i, p, a;
      // wet trails and drops (glass rims, highlights)
      var aspect = W / H;
      for (i = 0; i < drops.length; i++) {
        p = drops[i];
        var x = p.x * H + W / 2, y = H / 2 - p.y * H, r = p.r * H, y0 = H / 2 - p.y0 * H;
        a = p.a;
        if (y - y0 > 2) {
          var tg = ctx.createLinearGradient(0, y0, 0, y);
          tg.addColorStop(0, "rgba(220,240,255,0)"); tg.addColorStop(1, "rgba(220,240,255," + (0.13 * a) + ")");
          ctx.strokeStyle = tg; ctx.lineWidth = Math.max(1, r * 0.28); ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke();
        }
        // dark crescent along the lower-right inside edge (glass shading)
        ctx.strokeStyle = "rgba(0,14,34," + (0.34 * a) + ")"; ctx.lineWidth = Math.max(1.2, r * 0.11);
        ctx.beginPath(); ctx.arc(x, y, r * 0.93, -0.35, 1.95); ctx.stroke();
        // thin bright rim on the upper-left
        ctx.strokeStyle = "rgba(255,255,255," + (0.55 * a) + ")"; ctx.lineWidth = Math.max(1, r * 0.07);
        ctx.beginPath(); ctx.arc(x, y, r * 0.96, 2.75, 4.35); ctx.stroke();
        // small sharp highlight
        var hx = x - r * 0.36, hy = y - r * 0.38, hr = Math.max(1.5, r * 0.20);
        var hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
        hl.addColorStop(0, "rgba(255,255,255," + (0.95 * a) + ")"); hl.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 6.2832); ctx.fill();
        // faint caustic glow on the opposite side
        ctx.fillStyle = "rgba(255,255,255," + (0.14 * a) + ")";
        ctx.beginPath(); ctx.arc(x + r * 0.34, y + r * 0.40, r * 0.28, 0, 6.2832); ctx.fill();
      }
      // foam clumps
      for (i = 0; i < parts.length; i++) {
        p = parts[i];
        if (p.kind !== "foam") continue;
        a = 1 - p.age / p.life;
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, "rgba(240,250,255," + (0.42 * a) + ")"); g.addColorStop(1, "rgba(240,250,255,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      }
      // spray: bright droplets with motion streaks
      ctx.lineCap = "round";
      for (i = 0; i < parts.length; i++) {
        p = parts[i];
        if (p.kind !== "spray") continue;
        a = 1 - p.age / p.life; a = a * a * (3 - 2 * a);
        var sx = p.vx * 0.014, sy = p.vy * 0.014;
        ctx.strokeStyle = "rgba(235,248,255," + (0.75 * a) + ")"; ctx.lineWidth = p.r * 1.0;
        ctx.beginPath(); ctx.moveTo(p.x - sx, p.y - sy); ctx.lineTo(p.x, p.y); ctx.stroke();
        if (p.r > 3.5) {
          ctx.fillStyle = "rgba(255,255,255," + (0.9 * a) + ")";
          ctx.beginPath(); ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.35, 0, 6.2832); ctx.fill();
        }
      }
      // bubbles
      for (i = 0; i < bubbles.length; i++) {
        p = bubbles[i]; a = 1 - p.age / p.life;
        ctx.strokeStyle = "rgba(230,248,255," + (0.65 * a) + ")"; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255," + (0.5 * a) + ")";
        ctx.beginPath(); ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, Math.max(0.6, p.r * 0.22), 0, 6.2832); ctx.fill();
      }
    }

    return {
      resize: resize, exit: exit, enter: enter, update: update, draw: draw,
      cover: function () { return cover; },
      drops: function () { return drops; },
      shake: function (t) { return [Math.sin(t * 0.061) * shakeAmp, Math.cos(t * 0.047) * shakeAmp * 0.8]; },
      busy: function () { return active; },
    };
  }

  window.Splash = { create: create };
})();
