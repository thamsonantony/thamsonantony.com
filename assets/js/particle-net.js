(function () {
  'use strict';

  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0;
  const mouse = { x: -9999, y: -9999, vx: 0, vy: 0 };

  const COUNT     = 140;   // more particles = denser clusters
  const CURSOR_R  = 260;   // reveal radius
  const CONNECT_D = 140;   // max bond length
  const FADE_OUT  = 0.025; // fade speed leaving zone
  const FADE_IN   = 0.09;  // fade speed entering zone
  const DAMPING   = 0.96;  // velocity decay per frame
  const MAX_SPD   = 3.5;   // particle speed cap
  const ATTRACT   = 0.008; // gentle pull toward cursor
  const STIR      = 0.18;  // nudge strength from mouse movement

  const CR2 = CURSOR_R * CURSOR_R;
  const CD2 = CONNECT_D * CONNECT_D;

  const particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x:  Math.random() * W,
      y:  Math.random() * H,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r:  Math.random() * 1.3 + 0.5,
      alpha: 0,
    });
  }

  document.addEventListener('mousemove', e => {
    // raw per-event delta — close to pixels/frame at 60fps
    mouse.vx = e.clientX - mouse.x;
    mouse.vy = e.clientY - mouse.y;
    mouse.x  = e.clientX;
    mouse.y  = e.clientY;
  });

  function rgb() {
    return document.documentElement.classList.contains('dark')
      ? '255,255,255'
      : '13,13,20';
  }

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  function tick() {
    requestAnimationFrame(tick);
    ctx.clearRect(0, 0, W, H);

    const c = rgb();
    const mspd = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy);

    for (const p of particles) {
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const d2 = dx * dx + dy * dy;

      if (d2 < CR2) {
        const d = Math.sqrt(d2);
        const t = 1 - d / CURSOR_R; // 0 at edge, 1 at centre

        // Gentle pull toward cursor centre
        p.vx += (dx / d) * ATTRACT * t;
        p.vy += (dy / d) * ATTRACT * t;

        // Stir: push in direction of mouse travel, proportional to speed
        if (mspd > 1) {
          const norm = Math.min(mspd, 20) / 20;
          p.vx += (mouse.vx / mspd) * STIR * t * norm;
          p.vy += (mouse.vy / mspd) * STIR * t * norm;
        }

        p.alpha = Math.min(p.alpha + FADE_IN, 1.0 * t + 0.15);
      } else {
        p.alpha = Math.max(0, p.alpha - FADE_OUT);
      }

      // Integrate
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd > MAX_SPD) { p.vx = p.vx / spd * MAX_SPD; p.vy = p.vy / spd * MAX_SPD; }

      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
    }

    // Decay mouse velocity between frames
    mouse.vx *= 0.8;
    mouse.vy *= 0.8;

    // Lines
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      if (a.alpha < 0.01) continue;
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        if (b.alpha < 0.01) continue;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 > CD2) continue;
        const t  = 1 - Math.sqrt(d2) / CONNECT_D;
        const la = t * Math.min(a.alpha, b.alpha) * 0.85;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${c},${la.toFixed(3)})`;
        ctx.lineWidth = 0.65;
        ctx.stroke();
      }
    }

    // Dots
    for (const p of particles) {
      if (p.alpha < 0.01) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c},${p.alpha.toFixed(3)})`;
      ctx.fill();
    }
  }

  tick();
})();
