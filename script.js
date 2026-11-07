(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Lantern position (current) and target (where the pointer is)
  let x = innerWidth / 2, y = innerHeight / 2;
  let tx = x, ty = y;
  let lastInput = 0;            // time of last pointer movement

  function setRadius() {
    const r = Math.max(180, Math.min(innerWidth, innerHeight) * 0.28);
    root.style.setProperty("--radius", r + "px");
  }
  setRadius();
  addEventListener("resize", setRadius);

  function aim(e) {
    tx = e.clientX;
    ty = e.clientY;
    lastInput = performance.now();
  }
  addEventListener("pointermove", aim, { passive: true });
  addEventListener("pointerdown", aim, { passive: true });

  function frame(t) {
    // When nobody is touching the screen for a few seconds
    // (e.g. phones), the lantern drifts around by itself.
    if (!reduceMotion && t - lastInput > 3500) {
      const s = t / 1000;
      tx = innerWidth  * (0.5 + 0.30 * Math.sin(s * 0.55));
      ty = innerHeight * (0.5 + 0.18 * Math.sin(s * 0.83 + 1.3));
    }

    // Ease toward the target so the light feels like it has weight
    const ease = reduceMotion ? 1 : 0.14;
    x += (tx - x) * ease;
    y += (ty - y) * ease;

    // Gentle flame flicker
    const flicker = reduceMotion
      ? 1
      : 0.94 + 0.04 * Math.sin(t / 90) + 0.02 * Math.sin(t / 37 + 2);

    root.style.setProperty("--x", x.toFixed(1) + "px");
    root.style.setProperty("--y", y.toFixed(1) + "px");
    root.style.setProperty("--flicker", flicker.toFixed(3));

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
