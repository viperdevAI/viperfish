/* The craft: a quiet, dark window frame and a slim sill, just enough to tell you that you are inside something.
   It builds its own DOM, moves the page's header and depth gauge onto the sill, and keeps the frame geometry in sync with the window size.
   script.js drives how far it has settled in (--sub, 0 to 1) and centres the cards and facts in the window. */
(function () {
  "use strict";
  var root = document.documentElement;
  var g = { W: 0, H: 0, bar: 12, side: 12, dash: 76, r: 40, bow: 3 };

  var sub = document.createElement("div");
  sub.className = "sub"; sub.id = "sub"; sub.setAttribute("role", "presentation");
  sub.innerHTML =
    '<canvas class="sub-frame" aria-hidden="true"></canvas>' +
    '<canvas class="sub-glass" aria-hidden="true"></canvas>' +
    '<canvas class="sub-cracks" aria-hidden="true"></canvas>' +
    '<div class="sub-dash">' +
      '<canvas class="sub-dash-bg" aria-hidden="true"></canvas>' +
      '<div class="sub-left"></div>' +
      '<div class="sub-center"></div>' +
      '<div class="sub-right"></div>' +
    '</div>';
  document.body.appendChild(sub);

  // the page's own header and depth gauge live on the sill now
  var top = document.querySelector(".top"), gauge = document.querySelector(".gauge");
  if (top) sub.querySelector(".sub-left").appendChild(top);
  if (gauge) { gauge.removeAttribute("aria-hidden"); sub.querySelector(".sub-center").appendChild(gauge); }

  var cracksC = sub.querySelector(".sub-cracks"), crackSet = [], shardSet = [], crackP = 0, crackStep = -1, crackDpr = 1;
  // quick travel: one button per model. On the main page they glide there (script.js); on a model page they are plain links.
  (function () {
    var onMain = !!document.getElementById("intro"), here = location.pathname.split("/").pop() || "index.html";
    var models = [["sunlight", "Sunlight", "#ffe08a"], ["twilight", "Twilight", "#8fd0ff"], ["midnight", "Midnight", "#9aa7ff"], ["hadal", "Hadal", "#46ffd6"]];
    var nav = document.createElement("nav");
    nav.className = "sub-travel"; nav.setAttribute("aria-label", "Quick travel to a model");
    models.forEach(function (m) {
      var a = document.createElement("a");
      a.href = onMain ? "#" + m[0] : m[0] + ".html"; a.dataset.go = m[0]; a.style.setProperty("--dot", m[2]);
      a.title = "Go to " + m[1]; a.innerHTML = "<i></i><span>" + m[1] + "</span>";
      if (!onMain && here === m[0] + ".html") a.classList.add("on");
      nav.appendChild(a);
    });
    sub.querySelector(".sub-right").appendChild(nav);
  })();

  var frameC = sub.querySelector(".sub-frame"), glassC = sub.querySelector(".sub-glass"), dashC = sub.querySelector(".sub-dash-bg");

  function rngFor(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function noiseCanvas(w, h, amp, rnd) {
    var c = document.createElement("canvas"); c.width = Math.max(2, w); c.height = Math.max(2, h);
    var x = c.getContext("2d"), id = x.createImageData(c.width, c.height), d = id.data;
    for (var i = 0; i < d.length; i += 4) { var v = rnd() > 0.5 ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = rnd() * amp; }
    x.putImageData(id, 0, 0); return c;
  }
  // a big rounded window whose edges bow outward a little: domed glass, so the view feels wide
  function holePath(x0, y0, x1, y1, r, bow) {
    var p = new Path2D(), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    p.moveTo(x0 + r, y0); p.quadraticCurveTo(cx, y0 - 2 * bow, x1 - r, y0);
    p.arcTo(x1, y0, x1, y0 + r, r); p.quadraticCurveTo(x1 + 2 * bow, cy, x1, y1 - r);
    p.arcTo(x1, y1, x1 - r, y1, r); p.quadraticCurveTo(cx, y1 + 2 * bow, x0 + r, y1);
    p.arcTo(x0, y1, x0, y1 - r, r); p.quadraticCurveTo(x0 - 2 * bow, cy, x0, y0 + r);
    p.arcTo(x0, y0, x0 + r, y0, r); p.closePath();
    return p;
  }
  function setSize(cv, w, h, dpr) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + "px"; cv.style.height = h + "px"; var c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); return c; }

  function steel(c, w, h, rnd) {                                                // dark, desaturated, slightly aged steel; nothing that catches the eye
    var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#27302e"); gr.addColorStop(0.5, "#1c2321"); gr.addColorStop(1, "#131817");
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    for (var i = 0; i < 40; i++) {
      var px = rnd() * w, py = rnd() * h, rad = 60 + rnd() * 220, dark = rnd() < 0.6, rg = c.createRadialGradient(px, py, 0, px, py, rad);
      rg.addColorStop(0, dark ? "rgba(0,0,0,.10)" : "rgba(150,165,158,.045)"); rg.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = rg; c.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    c.globalAlpha = 0.7; c.drawImage(noiseCanvas(Math.round(w / 2), Math.round(h / 2), 12, rnd), 0, 0, w, h); c.globalAlpha = 1;
  }

  function drawFrame(dpr) {
    var W = g.W, H = g.H, x0 = g.side, y0 = g.bar, x1 = W - g.side, y1 = H - g.dash, rnd = rngFor(20240611);
    var c = setSize(frameC, W, H, dpr), hole = holePath(x0, y0, x1, y1, g.r, g.bow);
    var body = new Path2D(); body.rect(0, 0, W, H); body.addPath(hole);
    c.save(); c.clip(body, "evenodd");
    steel(c, W, H, rnd);
    // the seal around the glass, and a thin worn lip
    c.lineJoin = "round"; c.strokeStyle = "#060808"; c.lineWidth = 14; c.stroke(hole);
    c.strokeStyle = "rgba(120,136,130,.35)"; c.lineWidth = 1.6; c.stroke(hole);
    // the frame falls into shadow toward the corners
    c.translate(W / 2, (y0 + y1) / 2); c.scale(W / Math.max(H, 1) * 0.62, 1);
    var vg = c.createRadialGradient(0, 0, H * 0.3, 0, 0, H * 0.95); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.5)");
    c.fillStyle = vg; c.fillRect(-W, -H, 2 * W, 2 * H);
    c.restore();
  }

  function drawGlass(dpr) {
    var W = g.W, H = g.H, x0 = g.side, y0 = g.bar, x1 = W - g.side, y1 = H - g.dash, rnd = rngFor(77123), c = setSize(glassC, W, H, dpr);
    var hole = holePath(x0, y0, x1, y1, g.r, g.bow), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ww = x1 - x0, hh = y1 - y0, i;
    c.save(); c.clip(hole);
    // the dome: the view falls off softly toward the rim
    c.save(); c.translate(cx, cy); c.scale(ww / hh, 1);
    var vg = c.createRadialGradient(0, 0, hh * 0.34, 0, 0, hh * 0.78); vg.addColorStop(0, "rgba(0,4,10,0)"); vg.addColorStop(0.65, "rgba(0,4,10,.14)"); vg.addColorStop(1, "rgba(0,4,10,.5)");
    c.fillStyle = vg; c.fillRect(-hh * 2, -hh, hh * 4, hh * 2); c.restore();
    c.shadowColor = "rgba(8,14,12,.5)"; c.shadowBlur = 24; c.strokeStyle = "rgba(10,16,14,.4)"; c.lineWidth = 16; c.stroke(hole); c.shadowBlur = 0;
    // a few droplets of condensation near the edges, barely there
    for (i = 0; i < 26; i++) {
      var ang = rnd() * 6.283, rr = 0.55 + rnd() * 0.45, px = cx + Math.cos(ang) * rr * ww * 0.5, py = cy + Math.sin(ang) * rr * hh * 0.5, d = 1 + rnd() * rnd() * 4.5;
      var dg = c.createRadialGradient(px - d * 0.3, py - d * 0.3, d * 0.1, px, py, d); dg.addColorStop(0, "rgba(230,245,250,.05)"); dg.addColorStop(1, "rgba(255,255,255,.12)");
      c.fillStyle = dg; c.beginPath(); c.arc(px, py, d, 0, 6.283); c.fill();
      c.fillStyle = "rgba(255,255,255,.28)"; c.beginPath(); c.arc(px - d * 0.35, py - d * 0.4, Math.max(0.5, d * 0.2), 0, 6.283); c.fill();
    }
    // one soft reflection of the cabin on the upper left of the glass
    var rg = c.createLinearGradient(x0, y0, x0 + ww * 0.5, y0 + hh * 0.8);
    rg.addColorStop(0, "rgba(255,255,255,.05)"); rg.addColorStop(0.2, "rgba(255,255,255,.008)"); rg.addColorStop(0.3, "rgba(255,255,255,0)");
    c.fillStyle = rg; c.fillRect(x0, y0, ww, hh);
    c.restore();
  }

  function drawSill(dpr) {
    var W = g.W, h = g.dash, rnd = rngFor(5150), c = setSize(dashC, W, h, dpr);
    steel(c, W, h, rnd);
    c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(0, 0, W, 3);
    c.fillStyle = "rgba(120,136,130,.28)"; c.fillRect(0, 3, W, 1.2);
    var vg = c.createLinearGradient(0, 4, 0, 30); vg.addColorStop(0, "rgba(0,0,0,.35)"); vg.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = vg; c.fillRect(0, 4, W, 26);
  }

  // a web of cracks that grows out of three points of impact; progress 0..1 reveals more of it
  function buildCracks() {
    var rnd = rngFor(9001), x0 = g.side, y0 = g.bar, ww = g.W - 2 * g.side, hh = g.H - g.dash - g.bar, out = [], mains = [];
    var hits = [[0.62, 0.34], [0.28, 0.58], [0.78, 0.7]];
    hits.forEach(function (h, hi) {
      var hx = x0 + ww * h[0], hy = y0 + hh * h[1], n = 9 + Math.floor(rnd() * 4), ring = [];
      for (var i = 0; i < n; i++) {
        var ang = (i / n) * 6.283 + (rnd() - 0.5) * 0.5, x = hx, y = hy, pts = [[x, y]], segs = 5 + Math.floor(rnd() * 6);
        for (var k = 0; k < segs; k++) {
          ang += (rnd() - 0.5) * 0.7; var len = (22 + rnd() * 60) * (hh / 520 + 0.4); x += Math.cos(ang) * len; y += Math.sin(ang) * len; pts.push([x, y]);
          if (rnd() < 0.22) { var ba = ang + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), bx = x, by = y, bp = [[bx, by]]; for (var m = 0; m < 3; m++) { bx += Math.cos(ba) * (14 + rnd() * 34); by += Math.sin(ba) * (14 + rnd() * 34); ba += (rnd() - 0.5) * 0.8; bp.push([bx, by]); } out.push({ pts: bp, order: hi * 0.12 + (k + 1) / (segs + 2) * 0.7 + rnd() * 0.1 }); }
        }
        var ord = hi * 0.12 + rnd() * 0.18;
        out.push({ pts: pts, order: ord }); ring.push({ ang: ang, pts: pts, order: ord });
      }
      ring.sort(function (a, b) { return Math.atan2(Math.sin(a.ang), Math.cos(a.ang)) - Math.atan2(Math.sin(b.ang), Math.cos(b.ang)); });
      for (var q = 0; q < ring.length; q++) {                       // the pane of glass between each pair of neighbouring cracks is a shard
        var A = ring[q], B = ring[(q + 1) % ring.length], m = Math.min(A.pts.length, B.pts.length), poly = [];
        for (var u = 0; u < m; u++) poly.push(A.pts[u]);
        for (u = m - 1; u >= 0; u--) poly.push(B.pts[u]);
        mains.push({ poly: poly, order: Math.max(A.order, B.order) + 0.06, tone: rnd(), amt: 0.4 + rnd() * 0.6 });
      }
    });
    crackSet = out; shardSet = mains; crackStep = -1;
  }
  function drawCracks() {
    var W = g.W, H = g.H, c = setSize(cracksC, W, H, crackDpr);
    if (crackP <= 0.001) return;
    var hole = holePath(g.side, g.bar, W - g.side, H - g.dash, g.r, g.bow);
    c.save(); c.clip(hole); c.lineCap = "round"; c.lineJoin = "round";
    var lim = crackP * 1.0;
    // the shards: each pane of broken glass catches the light a little differently and sits slightly off from its neighbours, so the picture behind looks broken up
    shardSet.forEach(function (sh) {
      if (sh.order > lim + 0.02) return;
      var k = Math.min(1, (lim - sh.order + 0.1) / 0.12), light = sh.tone > 0.45;
      c.beginPath(); c.moveTo(sh.poly[0][0], sh.poly[0][1]); for (var i = 1; i < sh.poly.length; i++) c.lineTo(sh.poly[i][0], sh.poly[i][1]); c.closePath();
      c.fillStyle = light ? "rgba(215,235,250," + (0.035 + 0.07 * sh.amt) * k + ")" : "rgba(0,12,26," + (0.10 + 0.16 * sh.amt) * k + ")"; c.fill();
    });
    crackSet.forEach(function (cr) {
      if (cr.order > lim) return;
      var grow = Math.min(1, (lim - cr.order) / 0.12), n = Math.max(1, Math.ceil((cr.pts.length - 1) * grow));
      function path(dx, dy) { c.beginPath(); c.moveTo(cr.pts[0][0] + dx, cr.pts[0][1] + dy); for (var i = 1; i <= n; i++) c.lineTo(cr.pts[i][0] + dx, cr.pts[i][1] + dy); }
      path(0, 0); c.strokeStyle = "rgba(0,6,14,.72)"; c.lineWidth = 4.6; c.stroke();                       // the dark gap in the glass
      path(0, 0); c.strokeStyle = "rgba(170,205,230,.22)"; c.lineWidth = 8; c.stroke();                    // a soft glow where the edges scatter light
      path(1.3, 1.3); c.strokeStyle = "rgba(255,255,255," + (0.3 + 0.25 * crackP) + ")"; c.lineWidth = 1; c.stroke();   // the bright edge of the broken pane
      path(0, 0); c.strokeStyle = "rgba(240,248,255," + (0.8 + 0.2 * crackP) + ")"; c.lineWidth = 1.2; c.stroke(); // the crack itself
    });
    c.restore();
  }

  function layout() {
    var W = innerWidth, H = innerHeight, small = W < 720, dpr = Math.min(devicePixelRatio || 1, 1.5);
    g.W = W; g.H = H;
    g.bar = small ? 8 : 12;
    g.side = small ? 6 : Math.max(10, Math.min(18, W * 0.012));
    g.dash = small ? 66 : Math.max(68, Math.min(88, H * 0.1));
    var hh = H - g.dash - g.bar, ww = W - 2 * g.side;
    g.r = Math.max(small ? 24 : 40, Math.min(small ? 50 : 110, Math.min(ww, hh) * 0.16));   // generous, rounded corners
    g.bow = Math.min(ww, hh) * 0.014;
    root.style.setProperty("--bar", g.bar + "px");
    root.style.setProperty("--side", g.side + "px");
    root.style.setProperty("--dash-h", g.dash + "px");
    root.style.setProperty("--cy", (g.bar + hh / 2) + "px");
    clearTimeout(layout.t);
    crackDpr = dpr; buildCracks();
    layout.t = setTimeout(function () { drawFrame(dpr); drawGlass(dpr); drawSill(dpr); crackStep = -1; drawCracks(); }, layout.first ? 160 : 0);
    layout.first = true;
  }
  layout();
  addEventListener("resize", layout);

  window.Sub = {
    el: sub,
    geom: function () { return g; },
    // where the middle of the window is, in screen pixels
    centre: function () { return { x: g.W / 2, y: g.bar + (g.H - g.bar - g.dash) / 2 }; },
    // 0..1: how cracked the glass is (redrawn only when it changes noticeably)
    setCracks: function (p) {
      crackP = Math.max(0, Math.min(1, p)); var st = Math.round(crackP * 40);
      if (st !== crackStep) { crackStep = st; drawCracks(); }
    },
    // shake the whole window and console by a few pixels
    shake: function (x, y, rot) { sub.style.transform = (x || y || rot) ? "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) rotate(" + (rot || 0).toFixed(2) + "deg)" : ""; },
    // how far the craft has settled in: 0 = out of sight, 1 = in place
    set: function (v) {
      var on = v > 0.002;
      sub.style.setProperty("--sub", v.toFixed(3));
      if (on !== sub.classList.contains("on")) sub.classList.toggle("on", on);
    },
  };
})();
