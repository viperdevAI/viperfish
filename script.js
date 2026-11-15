(() => {
  const $ = (s) => document.querySelector(s);
  const ARTICLE = document.body.classList.contains("article-mode");   // a long-read page: the ocean stays put at one shallow depth, so the text is easy to read
  const LEN = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--len")) || 1;   // the dive is this many times longer than the baseline: scrolling feels LEN times slower
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- sections and depth ---------- */
  const secs = [...document.querySelectorAll("[data-d0]")].map((el) => ({
    el, d0: +el.dataset.d0, d1: +el.dataset.d1, name: el.dataset.name,
  }));
  let layout = [];
  function measure() {
    const y = scrollY;
    layout = secs.map((s) => {
      const r = s.el.getBoundingClientRect();
      return { ...s, top: r.top + y, h: r.height };
    });
  }

  // Depth is a smooth curve through the zones: each zone covers a different number of metres per screen (Sunlight 200 m, Twilight 800 m), so a plain
  // linear map would make the depth readout and the water lurch faster at the boundary. The speed at each boundary is blended (harmonic mean) instead.
  function slopeAt(i, atEnd) {
    const s = layout[i], own = (s.d1 - s.d0) / s.h, j = atEnd ? i + 1 : i - 1, n = layout[j];
    if (!n) return own;
    const touching = atEnd ? (Math.abs(s.top + s.h - n.top) < 3 && s.d1 === n.d0) : (Math.abs(n.top + n.h - s.top) < 3 && n.d1 === s.d0);
    const o = (n.d1 - n.d0) / n.h;
    // coming out of the surface section (no depth of its own) the counter starts from standstill: the slow plunge through the waterline
    // is still carrying the camera there, so a full-speed start makes the water lurch just under the surface
    if (!atEnd && touching && n.d1 === n.d0) return 0;
    return touching && own > 0 && o > 0 ? 2 * own * o / (own + o) : own;
  }
  function depthAt(y) {
    for (let i = 0; i < layout.length; i++) {
      const s = layout[i];
      if (y >= s.top && y < s.top + s.h) {
        const t = clamp((y - s.top) / s.h), t2 = t * t, t3 = t2 * t;
        const m0 = slopeAt(i, false) * s.h, m1 = slopeAt(i, true) * s.h;   // cubic Hermite: same end depths, matching speed across the boundary
        const d = (2 * t3 - 3 * t2 + 1) * s.d0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * s.d1 + (t3 - t2) * m1;
        return { d: clamp(d, s.d0, s.d1), name: s.name };
      }
    }
    const last = layout[layout.length - 1];
    return { d: last ? last.d1 : 0, name: last ? last.name : "" };
  }

  /* ---------- background colour by depth ---------- */
  const stops = [[0, "#165f94"], [200, "#0f4c81"], [1000, "#071d3a"], [4000, "#020a1a"], [6000, "#000206"], [11000, "#000103"]];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function rgbAt(d) {
    for (let i = 1; i < stops.length; i++) {
      if (d <= stops[i][0]) {
        const [d0, c0] = stops[i - 1], [d1, c1] = stops[i];
        const t = (d - d0) / (d1 - d0), a = hex(c0), b = hex(c1);
        return a.map((v, k) => Math.round(v + (b[k] - v) * t));
      }
    }
    return hex(stops[stops.length - 1][1]);
  }
  const colorAt = (d) => `rgb(${rgbAt(d).join(",")})`;

  /* ---------- WebGL ocean + splash (falls back to the CSS scene when WebGL is unavailable) ---------- */
  const GL = window.Ocean && $("#ocean") ? Ocean.create($("#ocean")) : null;
  const FX = null;   // splash/drops on the lens removed
  if (GL) document.documentElement.classList.add("gl");
  let glScale = 0.8, frameEma = 16, frameCount = 0;     // render scale adapts to keep the page smooth
  function glSize() {
    if (!GL) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    GL.resize(Math.max(2, Math.round(innerWidth * dpr * glScale)), Math.max(2, Math.round(innerHeight * dpr * glScale)));
  }
  const sst = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  let subV = 0, zoomAcc = 0, prevAlt = null, lastGlT = 0, underFac = 1;   // 0 above the water, 1 below (hides plankton and bubbles in the sky)
  window.__vf = { alt: null, exit: (p) => FX && FX.exit(p == null ? 1 : p), enter: (p) => FX && FX.enter(p == null ? 1 : p) };

  /* ---------- plankton, bubbles, glowing creatures ---------- */
  const cv = $("#life"), ctx = cv.getContext("2d");
  let W = 0, H = 0;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    glSize(); if (FX) FX.resize();
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  // Every dot lives at an offset from the middle of the screen plus a scale: scrolling changes the scale (zoom), never the position.
  const mk = (o) => Object.assign({ x: rnd(-0.55, 0.55), y: rnd(-0.55, 0.55), s: rnd(0.2, 2.2) }, o);
  const snow = Array.from({ length: 110 }, () => mk({ z: rnd(0.2, 1), r: rnd(0.6, 1.8), fl: [0, 1, 2].map((j) => [j ? rnd(-0.7, 0.7) : 0, j ? rnd(-0.7, 0.7) : 0, j ? rnd(0.5, 0.9) : 1]) }));
  const flake = (() => {                                          // one soft blob, drawn many times
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(185,215,235,.9)"); grd.addColorStop(0.35, "rgba(160,195,225,.35)"); grd.addColorStop(1, "rgba(140,180,215,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return c;
  })();
  /* Deep-sea animals: each kind is painted once into a small off-screen picture, then stamped with additive blending (light adds up, as it does in dark water). */
  const sprite = (w, h, fn) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.lineCap = "round"; g.lineJoin = "round"; fn(g); return c; };
  const combSprite = sprite(128, 256, (g) => {                    // comb jelly: a clear body with rows of beating combs that split light into colours
    const cx = 64, cy = 128, rx = 42, ry = 104;
    const body = g.createRadialGradient(cx, cy, 4, cx, cy, ry); body.addColorStop(0, "hsla(195,70%,70%,.05)"); body.addColorStop(0.42, "hsla(195,80%,72%,.11)"); body.addColorStop(0.5, "hsla(195,80%,72%,0)");
    g.save(); g.translate(cx, cy); g.scale(rx / ry, 1); g.translate(-cx, -cy); g.fillStyle = body; g.fillRect(-200, 0, 528, 256); g.restore();
    g.strokeStyle = "hsla(195,90%,85%,.30)"; g.lineWidth = 1.2; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 6.283); g.stroke();
    for (let r = 0; r < 5; r++) {
      const u = -0.84 + r * 0.42;
      for (let k = 0; k < 30; k++) {
        const v = -0.92 + (k / 29) * 1.84, x = cx + rx * u * Math.sqrt(1 - v * v), y = cy + ry * v, w = 2.0 + 3.2 * Math.sqrt(1 - v * v) * (1 - 0.5 * Math.abs(u));
        g.fillStyle = `hsla(${(k * 23 + r * 55) % 360},100%,72%,${(0.34 + 0.4 * Math.abs(Math.sin(k * 0.9 + r))).toFixed(2)})`;
        g.fillRect(x - w, y - 0.9, 2 * w, 1.8);
      }
    }
  });
  const chainSprite = sprite(96, 512, (g) => {                    // siphonophore: a long colony, one bright float leading a string of lights
    const xAt = (y) => 48 + 20 * Math.sin(y * 0.014 + 0.5) + 8 * Math.sin(y * 0.041);
    g.strokeStyle = "hsla(200,80%,80%,.20)"; g.lineWidth = 1; g.beginPath();
    for (let y = 22; y < 500; y += 6) g.lineTo(xAt(y), y);
    g.stroke();
    for (let y = 22, i = 0; y < 500; y += 9 + i * 0.25, i++) {
      const k = 1 - y / 520, rad = (i === 0 ? 13 : 3 + 6 * k * (0.6 + 0.4 * Math.sin(i * 2.3))), x = xAt(y);
      const gg = g.createRadialGradient(x, y, 0, x, y, rad), hue = i === 0 ? 30 : 185 + 40 * Math.sin(i * 0.7);
      gg.addColorStop(0, `hsla(${hue},100%,84%,${(0.2 + 0.6 * k).toFixed(2)})`); gg.addColorStop(0.3, `hsla(${hue},100%,70%,${(0.28 * k).toFixed(2)})`); gg.addColorStop(1, `hsla(${hue},100%,60%,0)`);
      g.fillStyle = gg; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
    }
  });
  const KINDS = [combSprite, chainSprite];
  const glows = Array.from({ length: 6 }, (_, i) => { const kind = i % 2; return mk({ z: rnd(0.45, 1), kind, size: kind === 1 ? rnd(0.36, 0.56) : rnd(0.10, 0.17), rot: rnd(-3.14, 3.14), vr: rnd(-0.05, 0.05), ph: rnd(0, 6.28), sp: rnd(0.7, 1.3) }); });

  let depth = 0, lastY = scrollY, lastT = 0;
  const ZOOMRATE = Math.log(2.6);   // matches the cards: scrolling a screen shrinks things by 2.6x (the camera pulls away from them)
  // advance a dot's scale with the scroll; when it shrinks into the distance it comes back large at the edge (and the reverse when scrolling up)
  function zoomStep(p, dy) {
    p.s *= Math.exp(-(dy / H) * ZOOMRATE * (0.5 + 0.5 * p.z));
    if (p.s < 0.18) { p.s = rnd(1.8, 2.4); p.x = rnd(-0.55, 0.55); p.y = rnd(-0.55, 0.55); }
    else if (p.s > 2.5) { p.s = rnd(0.2, 0.3); p.x = rnd(-0.55, 0.55); p.y = rnd(-0.55, 0.55); }
    return smooth01(0.18, 0.4, p.s) * (1 - smooth01(1.7, 2.5, p.s));   // fade near both ends of the loop
  }
  const smooth01 = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const px = (p) => (0.5 + p.x * p.s) * W, py = (p) => (0.5 + p.y * p.s) * H;

  function draw(t, dy) {
    ctx.clearRect(0, 0, W, H);
    const dt = Math.min(50, t - lastT); lastT = t;
    const deep = clamp((depth - 500) / 1500);

    // marine snow: soft, pale-blue flakes, a little clumped, sinking very slowly. Never hard white points (that reads as stars).
    const snowFade = 1 - 0.55 * clamp(depth / 6000);              // fewer and fainter the deeper you go
    for (const p of snow) {
      const f = zoomStep(p, dy);
      p.y += dt * 0.000010 * p.z;                                  // slow sinking
      if (p.y > 0.6) p.y -= 1.2;
      const a = (0.05 + 0.13 * p.z) * snowFade * underFac * f;
      if (a < 0.004) continue;
      const k = (p.r * p.z * 3.2 + 2.2) * (0.5 + 0.5 * Math.min(p.s, 1.6)), x = px(p), y = py(p);
      ctx.globalAlpha = a;
      for (let j = 0; j < 3; j++) { const o = p.fl[j]; ctx.drawImage(flake, x + o[0] * k - k, y + o[1] * k - k, 2 * k * o[2], 2 * k * o[2]); }
    }
    // animals of the deep: they drift, turn slowly and pulse; like everything else they recede as you sink past them
    if (deep > 0.01) {
      const sparse = clamp((depth - 900) / 3600);                       // thin out toward the abyss
      const keep = Math.round(glows.length * (1 - 0.72 * sparse));
      ctx.globalCompositeOperation = "lighter";
      for (let gi = 0; gi < glows.length; gi++) {
        const g = glows[gi], f = zoomStep(g, dy);
        if (gi >= keep) continue;
        const ts = t / 1000;
        g.rot += g.vr * dt / 1000;
        g.x += Math.sin(g.rot) * dt * 0.0000040; g.y -= Math.cos(g.rot) * dt * 0.0000040;   // swimming slowly the way it points
        const beat = Math.sin(ts * g.sp * 0.6 + g.ph);
        const a = (0.78 + 0.22 * beat) * deep * f * (1 - 0.3 * sparse) * (0.5 + 0.5 * g.z);
        if (a < 0.01) continue;
        const img = KINDS[g.kind], hgt = g.size * H * (0.35 + 0.65 * Math.min(g.s, 2)), wid = hgt * img.width / img.height;
        ctx.save(); ctx.translate(px(g), py(g)); ctx.rotate(g.rot);
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(img, -wid / 2, -hgt / 2, wid, hgt);
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- model cards: pinned to the screen and flown through (zoom, not scroll) ---------- */
  const cards = [...document.querySelectorAll(".model .inner")].map((el) => ({ el, sec: el.closest("section"), y0: 0 }));
  // Cards are position:fixed at the spot where they sit when centred. Nothing moves them with the scroll (that always lags a frame and shakes);
  // only their size and opacity change.
  function measureCards() {
    const vh = innerHeight;
    for (const c of cards) {
      const st = c.el.style;
      st.position = ""; st.left = ""; st.top = ""; st.width = ""; st.margin = ""; st.transform = "none";
      const r = c.el.getBoundingClientRect(), sr = c.sec.getBoundingClientRect();
      const top = r.top + scrollY, sTop = sr.top + scrollY;
      const at = parseFloat(c.sec.dataset.at); const frac = isNaN(at) ? 0.5 : at;   // where in its depth zone the card appears (0.5 = middle)
      c.y0 = sTop + sr.height * frac - vh / 2;           // scroll position where this card is centred on screen
      const mid = window.Sub ? Sub.centre() : { x: innerWidth / 2, y: vh / 2 };   // the middle of the submarine window
      const screenTop = mid.y - r.height / 2, screenLeft = mid.x - r.width / 2;
      st.position = "fixed"; st.margin = "0"; st.zIndex = "2";
      st.left = screenLeft + "px"; st.top = screenTop + "px"; st.width = r.width + "px";
      st.transformOrigin = "50% 50%";                  // scale about the card's own centre, which is the centre of the window
    }
  }
  const ss = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const ZOOM = 2.6;   // size factor per screen of scrolling (bigger = faster zoom)
  function zoomCards(y) {
    const vh = innerHeight, maxY = document.documentElement.scrollHeight - vh;
    cards.forEach((c, i) => {
      const rel = (c.y0 - y) / (vh * LEN);                        // +1 = a screen away ahead, -1 = a screen behind
      const el = c.el;
      if (rel > 1.2 || rel < -1.2) { if (el.style.visibility !== "hidden") { el.style.opacity = "0"; el.style.visibility = "hidden"; } return; }
      // constant zoom rate: the scale changes by the same factor per screen of scroll, so there is no pause at full size
      const sc = Math.pow(ZOOM, rel);
      let op = 1 - ss(0.30, 1.0, Math.abs(rel));
      if (i === cards.length - 1) op *= ss(0, 0.5, (maxY - y) / vh);   // the last card is completely gone by the bottom of the page
      el.style.visibility = op > 0.003 ? "visible" : "hidden";
      el.style.transform = `scale(${sc.toFixed(4)})`;
      el.style.opacity = op.toFixed(3);
      el.style.pointerEvents = op > 0.5 ? "" : "none";
    });
  }
  // Facts: one-liners in the open water between the cards. Same flight as the cards (scale at a constant rate, fade in and out around the centre).
  const facts = [...document.querySelectorAll(".fact")].map((el) => ({ el, sec: el.closest("section"), y0: 0 }));
  function measureFacts() {
    for (const f of facts) {
      const sr = f.sec.getBoundingClientRect();
      f.y0 = sr.top + scrollY + sr.height * (parseFloat(f.el.dataset.at) || 0) - innerHeight / 2;   // scroll position where the fact is centred
      // the small depth label always matches what the gauge reads at that point
      const d = depthAt(f.y0 + innerHeight * 0.5).d, label = d < 100 ? Math.round(d / 10) * 10 : Math.round(d / 100) * 100;
      const tag = f.el.querySelector(".fact-d"); if (tag) tag.textContent = label.toLocaleString("en-US") + " m";
    }
  }
  function zoomFacts(y) {
    const vh = innerHeight;
    for (const f of facts) {
      const rel = (f.y0 - y) / (vh * LEN), el = f.el;
      if (Math.abs(rel) > 0.6) { if (el.style.visibility !== "hidden") { el.style.visibility = "hidden"; el.style.opacity = "0"; } continue; }
      const op = 1 - ss(0.1, 0.55, Math.abs(rel));
      el.style.visibility = op > 0.003 ? "visible" : "hidden";
      el.style.opacity = op.toFixed(3);
      el.style.transform = `translate(-50%, -50%) scale(${Math.pow(ZOOM, rel).toFixed(4)})`;
    }
  }
  cards.forEach((c) => { c.el.style.transition = "none"; c.el.style.willChange = "transform, opacity"; });

  /* ---------- pressure dial: a round gauge whose needle climbs with depth ---------- */
  const pressEl = $("#press");
  let needle = null, dialAtm = null;
  if (pressEl) {
    const ticks = Array.from({ length: 28 }, (_, i) => {
      const f = i / 27, a = (-135 + 270 * f) * Math.PI / 180, major = i % 3 === 0, r0 = major ? 33 : 36, r1 = 41;
      const red = f > 0.8;
      return `<line x1="${(50 + r0 * Math.sin(a)).toFixed(2)}" y1="${(50 - r0 * Math.cos(a)).toFixed(2)}" x2="${(50 + r1 * Math.sin(a)).toFixed(2)}" y2="${(50 - r1 * Math.cos(a)).toFixed(2)}" stroke="${red ? "#ff6a4d" : "rgba(255,255,255,.7)"}" stroke-width="${major ? 1.6 : 1}"/>`;
    }).join("");
    const arc = (f0, f1, rad) => {
      const p = (f) => { const a = (-135 + 270 * f) * Math.PI / 180; return [50 + rad * Math.sin(a), 50 - rad * Math.cos(a)]; };
      const [x0, y0] = p(f0), [x1, y1] = p(f1);
      return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${rad} ${rad} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    };
    pressEl.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="rgba(2,8,20,.55)" stroke="rgba(255,255,255,.45)" stroke-width="2.2"/>
      <circle cx="50" cy="50" r="43.5" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
      <path d="${arc(0.8, 1, 44.5)}" fill="none" stroke="#ff6a4d" stroke-width="2" opacity=".8"/>
      ${ticks}
      <text id="dialAtm" x="50" y="71" text-anchor="middle" font-size="8.5" fill="rgba(255,255,255,.75)" font-family="ui-monospace,Menlo,monospace" letter-spacing=".5">1 ATM</text>
      <g class="needle" id="dialNeedle"><line x1="50" y1="57" x2="50" y2="14" stroke="#ffe08a" stroke-width="1.8" stroke-linecap="round"/><circle cx="50" cy="50" r="3.6" fill="#ffe08a"/></g>
      </svg>`;
    needle = pressEl.querySelector("#dialNeedle"); dialAtm = pressEl.querySelector("#dialAtm");
  }
  let lastAngle = null;
  function updateDial(d) {
    if (!needle) return;
    const frac = Math.pow(clamp(d / 11000), 0.7);                       // fast at first, then creeping: like a real dive gauge
    const angle = -135 + 270 * frac;
    if (lastAngle === null || Math.abs(angle - lastAngle) > 0.05) { needle.setAttribute("transform", `rotate(${angle.toFixed(2)} 50 50)`); lastAngle = angle; }
  }

  /* ---------- per-frame update ---------- */
  const sea = $("#sea"), rays = $("#rays"), depthEl = $("#depth"), zoneEl = $("#zone"), fill = $("#gfill");
  let shown = 0;
  const SKY_TOP = GL ? "#1e3153" : "#0c2147";      // colour at the very top of the sky (shader / CSS fallback)
  const hasSky = !!document.querySelector(".sky");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  let lastTheme = 0;
  function update(t) {
    const y = scrollY, dy = ARTICLE ? 0 : y - lastY; lastY = y;
    const { d, name } = ARTICLE ? { d: 60, name: "Sunlight zone" } : depthAt(y + innerHeight * 0.5);
    depth = d;
    shown += (d - shown) * (reduce ? 1 : 0.18);
    if (Math.abs(d - shown) < 0.5) shown = d;

    const seaColor = colorAt(shown);
    sea.style.background = seaColor;
    document.documentElement.style.setProperty("--sea", seaColor);   // waves at the waterline match the water
    // Safari's rubber-band bounce shows the page's own background past the top and bottom edges.
    // Keep it the same colour as what is on screen: sky-navy at the very top, the water colour elsewhere.
    document.documentElement.style.backgroundColor = hasSky && y < 4 ? SKY_TOP : seaColor;
    rays.style.setProperty("--rays", (0.55 * clamp(1 - shown / 450)).toFixed(3));
    depthEl.textContent = Math.round(shown).toLocaleString("en-US");
    if (dialAtm) { const txt = Math.round(1 + shown / 10).toLocaleString("en-US") + " ATM"; if (dialAtm.textContent !== txt) dialAtm.textContent = txt; }   // about one atmosphere more per 10 m
    updateDial(shown);
    if (zoneEl.textContent !== name) {
      zoneEl.textContent = name;
      if (document.getElementById("intro")) document.querySelectorAll(".sub-travel a[data-go]").forEach((a) => a.classList.toggle("on", name.toLowerCase().indexOf(a.dataset.go) === 0));
    }
    const max = document.documentElement.scrollHeight - innerHeight;
    fill.style.width = (max > 0 ? clamp(y / max) * 100 : 0).toFixed(1) + "%";
    // The browser-bar tint changes at most a few times a second (changing it every frame makes Safari stutter).
    if (t - lastTheme > 250) { lastTheme = t; themeMeta.content = colorAt(shown); }

    if (GL) {
      const s = y / (innerHeight * LEN);   // progress through the descent in baseline screens
      // camera altitude in metres: above the water at the top of the page, then sinking into it, then the real depth
      let alt = hasSky ? 1.2 - 4.0 * Math.min(s, 2.9) / 2.9 - shown : -(1.5 + shown);   // slow, steady descent through the surface (the water line is reached about one screen down)   // continuous: no jump when the real depth starts counting
      if (window.__vf.alt != null) alt = window.__vf.alt;
      const dtS = clamp((t - lastGlT) / 1000, 0.001, 0.05); lastGlT = t;
      if (prevAlt === null) prevAlt = alt;
      if (!reduce && FX) {
        const v = Math.abs(alt - prevAlt) / dtS, power = clamp(v / 15, 0.12, 1);
        if (prevAlt < 0 && alt >= 0) FX.exit(power);
        else if (prevAlt >= 0 && alt < 0) FX.enter(power);
        FX.update(dtS); FX.draw();
      }
      prevAlt = alt;
      // the deeper you are, the slower things drift past: the same scroll covers less ground down there, so the dark feels vast
      zoomAcc -= (dy / innerHeight) * 0.2 * (1 - 0.62 * sst(300, 7500, shown));
      underFac = 1 - sst(-0.6, 0.5, alt);
      subV = hasSky ? sst(0.3, 1.05, s) : 1;
      if (window.Sub) Sub.set(subV);   // the submarine rises into view as you begin to descend
      if (window.DeepAudio) DeepAudio.update({ depth: shown, under: underFac });
      const Dm = Math.max(-alt, 0);
      // camera tilt: always facing the surface while in the sea; it only tilts down to the horizon once it is out of the water
      const look = 90, horizon = 11.7;
      const outside = sst(-0.2, 1.1, alt);
      const pitch = (look + (horizon - look) * outside) * Math.PI / 180;
      // the water only ever gets darker with depth: the page colour at 200-1000 m is brighter than what the shader makes at 100 m, so pull it down there
      const dk = Math.min(1, 1 - 0.8 * sst(40, 260, shown) + 0.45 * sst(600, 3000, shown));
      const rgb = rgbAt(shown).map((v) => v * dk);
      const cover = 0;
      GL.render({ curve: (ARTICLE || document.documentElement.classList.contains("introing")) ? 0 : 0.34 * subV,   // the glass bend belongs to the window frame: no frame (article page, opening animation), no bend
                zoom: zoomAcc, time: reduce ? 3 : (t / 1000) % 3600, alt, pitch,
                  deep: [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255], cover,
                  drops: FX ? FX.drops() : [], shake: reduce ? [0, 0] : [shakeX, shakeY] });
      // keep the frame rate healthy: lower the render resolution if frames are slow, raise it again if there is headroom
      frameEma = frameEma * 0.95 + (dtS * 1000) * 0.05;
      if (++frameCount % 90 === 0) {
        if (frameEma > 24 && glScale > 0.42) { glScale = Math.max(0.42, glScale * 0.85); glSize(); }
        else if (frameEma < 13 && glScale < 1.0) { glScale = Math.min(1.0, glScale * 1.08); glSize(); }
      }
    }

    if (!reduce) { zoomCards(y); zoomFacts(y); draw(t, dy); }
    computer(y, t);
  }
  function loop(t) { update(t); requestAnimationFrame(loop); }

  /* ---------- reveal on scroll ---------- */
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.25 })
    : null;
  document.querySelectorAll(".reveal").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));

  /* ---------- intro: start on the seafloor, then rush up to the surface ---------- */
  let diving = false;
  function startDive({ hideBottom = true, hold = 120 } = {}) {
    if (diving) return;
    diving = true;
    const root = document.documentElement;
    root.style.scrollBehavior = "auto";
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
    let max = root.scrollHeight - innerHeight;
    scrollTo(0, max);
    shown = depthAt(max + innerHeight * 0.5).d;   // gauge starts at the bottom depth
    lastY = scrollY;
    if (hideBottom) root.classList.add("diving");  // keep the bottom message hidden at the very start
    root.classList.remove("dive");                 // reveal the page, already at the bottom

    const DUR = 11000;
    let done = false, elapsed = 0, last = null;
    // The intro cannot be interrupted: scrolling, touch, keys and clicks are all locked until it lands.
    const lockEvents = ["wheel", "touchmove", "keydown", "mousedown", "click", "dragstart"];
    const swallow = (e) => { if (e.target && e.target.closest && e.target.closest("#sound, #skip")) return; e.preventDefault(); e.stopPropagation(); };   // everything is locked except the sound and skip buttons
    lockEvents.forEach((e) => addEventListener(e, swallow, { capture: true, passive: false }));
    root.style.overflow = "hidden"; document.body.style.pointerEvents = "none";
    root.classList.add("introing");
    // Skip: an instant jump to the top, with no easing. The depth, the water colour and the camera snap to the surface too (they normally ease toward the scroll position).
    window.__skipIntro = () => { if (done) return; scrollTo(0, 0); shown = 0; lastY = 0; prevAlt = null; finish(); };
    function finish() {
      if (done) return; done = true; diving = false;
      root.style.scrollBehavior = ""; root.classList.remove("diving");
      lockEvents.forEach((e) => removeEventListener(e, swallow, { capture: true }));
      root.style.overflow = ""; document.body.style.pointerEvents = "";
      root.classList.remove("introing"); window.__skipIntro = null;   // input is back: now "Scroll to begin descent" fades in
    }
    // The clock only advances on frames that are actually drawn. If the tab or window is in the
    // background when the page loads (animation frames are paused), the intro waits instead of
    // running its whole timeline unseen and landing straight on the top.
    function step(now) {
      if (done) return;
      if (last === null) last = now;
      elapsed += Math.min(now - last, 50); last = now;
      const t = clamp((elapsed - hold) / DUR);
      // gets moving quickly (cubic for the first 30%), then a long soft landing (quintic) over the remaining 70%. The two pieces meet with the same position and speed.
      const e = t < 0.3 ? 15.434 * t * t * t : 1 - 3.471 * Math.pow(1 - t, 5);
      max = root.scrollHeight - innerHeight;
      scrollTo(0, max * (1 - e));
      if (t < 1) requestAnimationFrame(step); else finish();
    }
    requestAnimationFrame(step);
  }

  // "Back to the surface" replays the same intro
  document.querySelectorAll("[data-dive]").forEach((a) => a.addEventListener("click", (ev) => {
    if (reduce || !document.getElementById("intro")) return;
    ev.preventDefault();
    startDive({ hideBottom: false, hold: 120 });
  }));

  /* ---------- the ship's computer: a red popup and a robotic voice ---------- */
  const alertEl = document.createElement("div"), edgeEl = document.createElement("div");
  alertEl.className = "alert"; alertEl.setAttribute("role", "alert"); edgeEl.className = "alert-edge";
  document.body.append(alertEl, edgeEl);
  let alertTimer = 0;
  function showAlert(text, kind, ms) {
    clearTimeout(alertTimer);
    alertEl.textContent = text; alertEl.dataset.kind = kind;
    alertEl.classList.remove("on"); void alertEl.offsetWidth; alertEl.classList.add("on");
    edgeEl.classList.toggle("on", kind === "warning");
    if (ms < 1e8) alertTimer = setTimeout(() => { alertEl.classList.remove("on"); edgeEl.classList.remove("on"); }, ms);
  }
  function hideAlert() { clearTimeout(alertTimer); alertEl.classList.remove("on"); edgeEl.classList.remove("on"); }
  const speak = (text, queue) => { if (window.Voice && window.DeepAudio && DeepAudio.isOn()) Voice.say(text, queue); };   // voice only when the sound is on
  const THOUSANDS = ["zero", "one thousand", "two thousand", "three thousand", "four thousand", "five thousand", "six thousand", "seven thousand", "eight thousand", "nine thousand", "ten thousand", "eleven thousand"];
  // past the Hadal model the warning never stops, and it gets worse the deeper you go
  const WARN = [
    { at: 0, text: "Warning! Pressure levels high!", say: "Warning! Pressure levels high!" },
    { at: 9500, text: "Hull integrity critical!", say: "Hull integrity critical!" },
    { at: 10500, text: "Hull failure imminent!", say: "Warning! Hull failure imminent!" },
  ];
  let traveling = false;
  const comp = { began: false, lastK: null, warned: false, boot: performance.now(), line: 0, lastWarn: 0, nextCreak: 0, bottomSince: 0, imploding: false, panic: 0, crack: 0 };   // crack: the worst the glass has been damaged so far (it never heals)
  let shakeX = 0, shakeY = 0;
  function announceDepth(k) {
    const say = "Depth, " + THOUSANDS[k] + " meters.";
    if (comp.warned) speak(say, true);                           // the warning stays on screen; the depth is only spoken, after the warning
    else { showAlert("Depth " + (k * 1000).toLocaleString("en-US") + " m", "depth", 3200); speak(say); }
  }
  function computer(y, t) {
    if (!hasSky || !cards.length) return;
    const root = document.documentElement, vh = innerHeight, now = performance.now();
    const k = Math.min(11, Math.floor(shown / 1000));
    const hadalY = cards[cards.length - 1].y0, warnY = hadalY + 0.9 * vh * LEN;
    if (comp.imploding) return;
    if (traveling) {   // gliding to a model with the quick-travel buttons: no call-outs on the way, and no warning left over from further down
      comp.lastK = k; comp.began = subV > 0.05; comp.warned = y > warnY;
      if (!comp.warned) { hideAlert(); if (comp.panic) { comp.panic = 0; shakeX = shakeY = 0; if (window.Sub) { Sub.shake(0, 0); Sub.setCracks(comp.crack); } root.style.setProperty("--panic", "0"); } }
      return;
    }
    const quiet = root.classList.contains("introing") || root.classList.contains("dive") || now - comp.boot < 1500;
    if (quiet) { comp.lastK = k; comp.warned = y > warnY; comp.began = subV > 0.05; comp.panic = 0; return; }   // never during the opening animation, and not on a page that loads part-way down
    // the start of the descent
    if (!comp.began && subV > 0.05) { comp.began = true; showAlert("Beginning descent", "alert", 4200); speak("Beginning descent."); }
    else if (comp.began && subV < 0.01) comp.began = false;
    // a call-out every 1,000 metres on the way down
    if (comp.lastK === null) comp.lastK = k;
    else if (k > comp.lastK) { comp.lastK = k; announceDepth(k); }
    else if (shown < comp.lastK * 1000 - 350) comp.lastK = k;    // climbing back up: the next descent calls them out again
    // past the Hadal model: the warning, which repeats and escalates until the bottom
    if (!comp.warned && y > warnY) {
      comp.warned = true; comp.line = 0; comp.lastWarn = now; comp.nextCreak = now + 2500;
      showAlert(WARN[0].text, "warning", 2e9);
      if (window.DeepAudio) DeepAudio.alarm();
      setTimeout(() => { if (comp.warned && !comp.imploding) speak(WARN[0].say); }, 1500);
    } else if (comp.warned && y < hadalY) { comp.warned = false; hideAlert(); }
    if (comp.warned) {
      let line = 0; WARN.forEach((w, i) => { if (shown >= w.at && i > 0) line = i; });
      if (line > comp.line) { comp.line = line; comp.lastWarn = now; showAlert(WARN[line].text, "warning", 2e9); if (window.DeepAudio) DeepAudio.alarm(); speak(WARN[line].say); }
      else if (now - comp.lastWarn > 9000 - 3500 * comp.panic) { comp.lastWarn = now; if (window.DeepAudio) DeepAudio.alarm(); setTimeout(() => speak(WARN[comp.line].say), 1500); }
      if (now > comp.nextCreak && window.DeepAudio) { DeepAudio.creak(comp.panic); comp.nextCreak = now + 5200 - 3800 * comp.panic + Math.random() * 2200; }
      // the pressure builds: the window shakes, the glass cracks, the edges glow redder
      const p = sst(7200, 11000, shown), tt = t / 1000;
      comp.panic = p;
      const amp = p * p;
      shakeX = Math.sin(tt * 37) * amp * 0.0035 + Math.sin(tt * 91) * amp * 0.0025; shakeY = Math.cos(tt * 43) * amp * 0.0035 + Math.cos(tt * 83) * amp * 0.0025;
      if (window.Sub) { Sub.shake(shakeX * innerHeight * 1.4, shakeY * innerHeight * 1.4); comp.crack = Math.max(comp.crack, sst(0.66, 1.0, p)); Sub.setCracks(comp.crack); }
      root.style.setProperty("--panic", p.toFixed(3));
      // the very bottom: the hull gives way
      if (shown >= 10985 && !reduce) implode();   // the instant you reach the seafloor: the pressure is too much, there is no warning left to give
    } else if (comp.panic) { comp.panic = 0; shakeX = shakeY = 0; if (window.Sub) { Sub.shake(0, 0); Sub.setCracks(comp.crack); } root.style.setProperty("--panic", "0"); }
  }

  /* ---------- the implosion: the hull gives way, the cabin floods, and the dive starts over ---------- */
  const impl = document.createElement("div");
  impl.className = "impl"; impl.setAttribute("aria-hidden", "true");
  impl.innerHTML = '<canvas class="impl-flood"></canvas><div class="impl-flash"></div><div class="impl-black"></div>';
  document.body.appendChild(impl);
  const floodC = impl.querySelector(".impl-flood"), flashEl = impl.querySelector(".impl-flash"), blackEl = impl.querySelector(".impl-black");
  let implLock = null;
  function lockAll() {
    const root = document.documentElement, ev = ["wheel", "touchmove", "keydown", "mousedown", "click", "dragstart"];
    const swallow = (e) => { if (e.target && e.target.closest && e.target.closest("#sound")) return; e.preventDefault(); e.stopPropagation(); };
    ev.forEach((e) => addEventListener(e, swallow, { capture: true, passive: false }));
    root.style.overflow = "hidden"; document.body.style.pointerEvents = "none";
    return () => { ev.forEach((e) => removeEventListener(e, swallow, { capture: true })); root.style.overflow = ""; document.body.style.pointerEvents = ""; };
  }
  // ---- the flood: not a rising waterline, a blast. Jets of white water through every crack, a whiteout of spray, then the cabin fills in under a second.
  const puff = (() => {                                         // one soft white puff of spray, reused for every plume
    const cv = document.createElement("canvas"); cv.width = cv.height = 96;
    const g = cv.getContext("2d"), gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(235,246,252,.65)"); gr.addColorStop(1, "rgba(210,236,248,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 96, 96); return cv;
  })();
  const rnd01 = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // a stable "random" per index, so streaks do not flicker
  const bubbles = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: 1.5 + Math.random() * 7, v: 0.2 + Math.random() * 0.7 }));
  let jets = [];
  function buildJets(W, H) {
    const win = { x: W * 0.02, y: H * 0.03, w: W * 0.96, h: H * 0.82 }, out = [];
    [[0.62, 0.34], [0.28, 0.58], [0.78, 0.70], [0.45, 0.2], [0.12, 0.35], [0.9, 0.42]].forEach((p, i) => out.push({ x: win.x + win.w * p[0], y: win.y + win.h * p[1], ang: 0, spread: 6.283, n: 22, power: 0.9 - i * 0.05, kind: "burst" }));
    for (let i = 0; i < 9; i++) out.push({ x: W * (0.05 + 0.1 * i), y: 0, ang: Math.PI / 2 + (i % 2 ? 0.2 : -0.2), spread: 0.55, n: 14, power: 0.85, kind: "ceiling" });   // water pouring in from above
    for (let i = 0; i < 5; i++) { out.push({ x: 0, y: H * (0.15 + 0.17 * i), ang: 0, spread: 0.7, n: 14, power: 1.0, kind: "side" }); out.push({ x: W, y: H * (0.2 + 0.17 * i), ang: Math.PI, spread: 0.7, n: 14, power: 1.0, kind: "side" }); }
    jets = out;
  }
  function drawFlood(e, W, H) {
    const c = floodC.getContext("2d"), t = e / 1000;
    c.clearRect(0, 0, W, H);
    // how full the cabin is: almost all of it within the first 0.8 s
    const level = Math.min(1, e / 1000), aer = Math.max(0, 1 - e / 2100);   // the water rises at a constant speed: the whole cabin in one second     // aer: how much white water is still churning
    c.lineCap = "round";
    // 1) jets and spray: white water bursting through the glass and the seams, as turbulent plumes of spray
    const jetA = Math.max(0, 1 - Math.max(0, e - 650) / 800);
    if (jetA > 0) {
      jets.forEach((j, ji) => {
        for (let i = 0; i < j.n; i++) {
          const r1 = rnd01(ji * 97 + i), r2 = rnd01(ji * 31 + i * 7), r3 = rnd01(ji * 13 + i * 3);
          const ang = j.kind === "burst" ? r1 * 6.283 : j.ang + (r1 - 0.5) * j.spread;
          const speed = (0.9 + r2 * 1.5) * W * j.power, len = Math.min(speed * t, W * 1.05);
          if (len <= 0) continue;
          const dx = Math.cos(ang), dy0 = Math.sin(ang), grav = 0.3 * t * t * H;
          const K = 9;
          for (let m = 1; m <= K; m++) {                                         // the plume: puffs of spray that grow and thin out along the jet
            const f = m / K, d = len * f, wob = Math.sin(t * 22 + i * 3 + m * 1.7) * 14 * f;
            const px = j.x + dx * d - dy0 * wob, py = j.y + dy0 * d + dx * wob + grav * f * f;
            const size = (22 + 130 * f * (0.5 + r3)) * (0.7 + 0.5 * Math.min(1, t * 3));
            c.globalAlpha = Math.min(1, 0.5 * jetA * (1 - 0.55 * f)); c.drawImage(puff, px - size / 2, py - size / 2, size, size);
          }
          // a thin, fast core of water inside the spray
          const seg = 40 + r3 * 110, a0 = Math.max(0, len - seg);
          c.globalAlpha = 0.85 * jetA; c.strokeStyle = "rgba(250,253,255,1)"; c.lineWidth = 2 + r3 * 4;
          c.beginPath(); c.moveTo(j.x + dx * a0, j.y + dy0 * a0 + grav * (a0 / len) ** 2); c.lineTo(j.x + dx * len, j.y + dy0 * len + grav); c.stroke();
        }
        if (j.kind === "burst" && e < 750) {                               // a ball of spray where each crack lets go
          const rad = 60 + e * 1.1; c.globalAlpha = Math.max(0, 1 - e / 750); c.drawImage(puff, j.x - rad, j.y - rad, rad * 2, rad * 2);
        }
      });
      c.globalAlpha = 1;
    }
    if (level <= 0.001) return;
    // 2) the water itself: a violent, foaming surface that keeps slopping about as it rises
    const base = H * (1 - level);
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) {
      const wave = Math.sin(x * 0.018 + t * 11) * 34 + Math.sin(x * 0.047 - t * 17) * 18 + Math.sin(x * 0.007 + t * 4) * 46 + Math.sin(x * 0.13 + t * 31) * 6;
      c.lineTo(x, Math.max(-60, base + wave * (0.25 + 0.75 * (1 - level))));
    }
    c.lineTo(W, H); c.closePath();
    const gr = c.createLinearGradient(0, base - 40, 0, Math.min(H * 1.2, base + H * 0.9));
    gr.addColorStop(0, "rgba(232,246,252,.98)"); gr.addColorStop(0.08, "rgba(150,205,225,.97)"); gr.addColorStop(0.3, "rgba(34,102,132,.98)"); gr.addColorStop(0.7, "rgba(6,34,52,.99)"); gr.addColorStop(1, "rgba(1,8,14,1)");
    c.fillStyle = gr; c.fill();
    c.save(); c.clip();
    // 3) aerated, white, churning water throughout: it clears and darkens as the pressure settles
    if (aer > 0) {
      c.fillStyle = `rgba(215,238,248,${0.55 * aer * aer})`; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) {
        const bx = (rnd01(i * 5) * 1.2 - 0.1) * W + Math.sin(t * (2 + rnd01(i)) + i) * 60, by = rnd01(i * 9) * H + ((t * (300 + rnd01(i + 3) * 700)) % (H * 0.6)), rad = 40 + rnd01(i * 3) * 150;
        const g = c.createRadialGradient(bx, by, 0, bx, by, rad); g.addColorStop(0, `rgba(255,255,255,${0.35 * aer})`); g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g; c.fillRect(bx - rad, by - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 90; i++) {                                                  // streaks of water tearing downward
        const sx = rnd01(i * 11) * W, sl = 80 + rnd01(i * 17) * 320, sy = ((rnd01(i * 23) * (H + sl) + t * (1100 + rnd01(i) * 1400)) % (H + sl)) - sl;
        c.strokeStyle = `rgba(255,255,255,${0.35 * aer})`; c.lineWidth = 1.5 + rnd01(i * 29) * 3; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 6, sy + sl); c.stroke();
      }
    }
    for (const b of bubbles) {                                                         // air tearing up through the water
      b.y -= b.v * 0.03 * (1 + level); if (b.y < 0) b.y = 1;
      const bx = b.x * W + Math.sin(t * 3 + b.r) * 10, by = b.y * H;
      if (by < base) continue;
      c.strokeStyle = `rgba(235,248,255,${0.35 + 0.4 * aer})`; c.lineWidth = 1.2; c.beginPath(); c.arc(bx, by, b.r, 0, 6.283); c.stroke();
    }
    c.restore();
    // 4) thick white foam riding the surface, and spray flung off it
    c.beginPath();
    for (let x = 0; x <= W + 8; x += 8) {
      const wave = Math.sin(x * 0.018 + t * 11) * 34 + Math.sin(x * 0.047 - t * 17) * 18 + Math.sin(x * 0.007 + t * 4) * 46 + Math.sin(x * 0.13 + t * 31) * 6, y = Math.max(-60, base + wave * (0.25 + 0.75 * (1 - level)));
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = `rgba(255,255,255,${0.9})`; c.lineWidth = 16; c.stroke();
    c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 34; c.globalAlpha = 0.35 + 0.4 * aer; c.stroke(); c.globalAlpha = 1;
    if (level < 0.995) for (let i = 0; i < 70; i++) {
      const fx = rnd01(i * 41 + Math.floor(t * 20)) * W, wave = Math.sin(fx * 0.018 + t * 11) * 34 + Math.sin(fx * 0.007 + t * 4) * 46;
      c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); c.arc(fx, base + wave * (0.25 + 0.75 * (1 - level)) - rnd01(i * 7 + Math.floor(t * 25)) * 50, 2 + rnd01(i) * 6, 0, 6.283); c.fill();
    }
  }
  function implode() {
    if (comp.imploding) return;
    comp.imploding = true; implLock = lockAll();
    const root = document.documentElement;
    root.classList.add("imploding");   // the seafloor message and everything else on the page clears away
    const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 1.5);
    floodC.width = Math.round(W * dpr); floodC.height = Math.round(H * dpr); floodC.style.width = W + "px"; floodC.style.height = H + "px";
    floodC.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    impl.classList.add("on"); blackEl.style.transition = "none"; blackEl.style.opacity = "0";
    void blackEl.offsetWidth; blackEl.style.transition = "opacity 1.1s cubic-bezier(.4, 0, .8, .7)"; blackEl.style.opacity = "1";   // the fade to black starts the instant the hull goes
    showAlert("Hull breach!", "warning", 2e9);
    if (window.Voice) Voice.cancel(); speak("Hull breach!");
    if (window.DeepAudio) { DeepAudio.boom(); DeepAudio.duck(true); }                          // everything but the disaster goes quiet
    flashEl.classList.remove("go"); void flashEl.offsetWidth; flashEl.classList.add("go");
    if (window.Sub) Sub.setCracks(1);
    const t0 = performance.now(), RESET_AT = 1750;
    buildJets(W, H);
    let floodStarted = false, finished = false, alertHidden = false;
    const shakeEls = [...document.querySelectorAll(".model .inner, .fact, #life, .alert, .alert-edge, .sound, .skip"), floodC];
    function tick(now) {
      if (finished) return;
      const e = now - t0;
      // violent shaking that dies down as the water comes in
      // the whole screen is thrown around, a new random kick every frame: the ocean, the window, the cards, the plankton and the water itself
      const amp = 1 - 0.65 * Math.min(1, e / 1700), kick = () => (Math.random() * 2 - 1) * amp;
      const jx = kick() * 46, jy = kick() * 46, jr = kick() * 1.5;
      shakeX = jx / H * 1.2; shakeY = jy / H * 1.2;                                // the ocean view itself
      if (window.Sub) Sub.shake(jx, jy, jr);
      shakeEls.forEach((el) => { el.style.translate = (jx * 0.8 + kick() * 10).toFixed(1) + "px " + (jy * 0.8 + kick() * 10).toFixed(1) + "px"; el.style.rotate = (jr * 0.8).toFixed(2) + "deg"; });
      if (!floodStarted) { floodStarted = true; if (window.DeepAudio) DeepAudio.flood(3.2); }   // the water is in the instant the glass goes
      drawFlood(e, W, H);
      if (e > 900 && !alertHidden) { alertHidden = true; hideAlert(); }
      if (e > RESET_AT) { finished = true; reset(); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    function reset() {
      // back to the surface: clear every trace of the disaster, then play the opening animation again from the seafloor
      if (implLock) implLock(); implLock = null;
      if (window.Voice) Voice.cancel(); if (window.DeepAudio) DeepAudio.unduckAll();
      comp.crack = 0; shakeX = shakeY = 0; if (window.Sub) { Sub.shake(0, 0, 0); Sub.setCracks(0); }   // a new dive: the glass is whole again
      shakeEls.forEach((el) => { el.style.translate = ""; el.style.rotate = ""; });
      root.style.setProperty("--panic", "0");
      root.classList.remove("imploding");
      comp.warned = false; comp.began = false; comp.lastK = null; comp.panic = 0; comp.bottomSince = 0; comp.line = 0; comp.imploding = false;
      floodC.getContext("2d").clearRect(0, 0, W, H); flashEl.classList.remove("go");
      startDive({ hideBottom: true, hold: 500 });
      setTimeout(() => { blackEl.style.transition = "opacity 1.4s ease"; blackEl.style.opacity = "0"; setTimeout(() => impl.classList.remove("on"), 1500); }, 250);
    }
  }

  /* ---------- sound toggle (off until asked: browsers do not allow sound before a click anyway) ---------- */
  const soundBtn = $("#sound");
  if (soundBtn) {
    if (!window.DeepAudio) soundBtn.hidden = true;
    else {
      const KEY = "viperfish-sound";
      let pref = "on"; try { pref = localStorage.getItem(KEY) || "on"; } catch (e) {}
      const show = (on) => { soundBtn.setAttribute("aria-pressed", String(on)); soundBtn.textContent = on ? "Sound on" : "Sound off"; };
      // On by default. Browsers keep it silent until the visitor's first click or key press, then it starts by itself.
      if (pref === "on" && DeepAudio.enable()) show(true); else show(false);
      soundBtn.addEventListener("click", () => {
        const turnOn = !DeepAudio.isOn();
        if (turnOn) { if (!DeepAudio.enable()) { soundBtn.hidden = true; return; } } else DeepAudio.disable();
        show(turnOn);
        if (!turnOn && window.Voice) Voice.cancel();
        try { localStorage.setItem(KEY, turnOn ? "on" : "off"); } catch (e) {}
      });
    }
  }

  /* ---------- skip intro ---------- */
  if (document.getElementById("intro")) {
    const skip = document.createElement("button");
    skip.className = "skip"; skip.id = "skip"; skip.type = "button"; skip.textContent = "Skip intro"; skip.setAttribute("aria-label", "Skip the opening animation");
    skip.addEventListener("click", () => { if (window.__skipIntro) window.__skipIntro(); });
    document.body.appendChild(skip);
  }

  /* ---------- quick travel: the buttons on the console glide to a model ---------- */
  let travelRaf = 0;
  function cancelTravel() { if (travelRaf) { cancelAnimationFrame(travelRaf); travelRaf = 0; traveling = false; document.documentElement.style.scrollBehavior = ""; } }
  function travelTo(id) {
    const card = cards.find((c) => c.sec.id === id);
    if (!card || diving) return;
    cancelTravel();
    const root = document.documentElement, from = scrollY, to = Math.max(0, Math.min(card.y0, root.scrollHeight - innerHeight)), dist = Math.abs(to - from);
    if (dist < 4) return;
    const dur = Math.min(4600, 1500 + (dist / innerHeight) * 55);
    traveling = true; root.style.scrollBehavior = "auto";
    const t0 = performance.now();
    const stop = (e) => { if (e.target && e.target.closest && e.target.closest(".sub-travel")) return; cancelTravel(); ["wheel", "touchstart", "keydown", "mousedown"].forEach((n) => removeEventListener(n, stop, true)); };
    ["wheel", "touchstart", "keydown", "mousedown"].forEach((n) => addEventListener(n, stop, { capture: true, passive: true }));
    const step = (now) => {
      const k = clamp((now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      scrollTo(0, from + (to - from) * e);
      if (k < 1) travelRaf = requestAnimationFrame(step);
      else { travelRaf = 0; traveling = false; root.style.scrollBehavior = ""; ["wheel", "touchstart", "keydown", "mousedown"].forEach((n) => removeEventListener(n, stop, true)); }
    };
    travelRaf = requestAnimationFrame(step);
  }
  document.querySelectorAll(".sub-travel a[data-go]").forEach((a) => {
    if (document.getElementById("intro")) a.addEventListener("click", (ev) => { ev.preventDefault(); travelTo(a.dataset.go); });
  });

  /* ---------- go ---------- */
  size(); measure(); measureCards(); measureFacts();
  addEventListener("resize", () => { size(); measure(); measureCards(); measureFacts(); if (reduce) update(0); });
  addEventListener("load", () => { measure(); measureCards(); measureFacts(); });
  if (reduce) { update(0); addEventListener("scroll", () => update(0), { passive: true }); }
  else {
    if (window.__dive && document.getElementById("intro")) { measure(); startDive(); }
    requestAnimationFrame(loop);
  }
})();
