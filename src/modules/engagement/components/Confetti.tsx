import { useEffect, useRef } from "react";

/* Brand-token confetti on a canvas; skipped entirely when the person prefers reduced motion. */

const TOKENS = ["--primary", "--chart-2", "--chart-3", "--chart-4", "--success", "--warning"];

function tokenColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const colors = TOKENS.map((t) => style.getPropertyValue(t).trim())
    .filter(Boolean)
    .map((v) => `hsl(${v})`);
  return colors.length ? colors : ["hsl(216 93% 37%)"];
}

interface Piece {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
}

export function Confetti({ duration = 3200, pieces = 140 }: { duration?: number; pieces?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      el.width = window.innerWidth * dpr;
      el.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const colors = tokenColors();
    const width = window.innerWidth;
    const parts: Piece[] = Array.from({ length: pieces }, () => ({
      x: width / 2 + (Math.random() - 0.5) * width * 0.4,
      y: window.innerHeight * 0.3 + (Math.random() - 0.5) * 40,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vx: (Math.random() - 0.5) * 14,
      vy: -6 - Math.random() * 10,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const fade = Math.max(0, 1 - Math.max(0, t - duration * 0.6) / (duration * 0.4));
      ctx.globalAlpha = fade;
      for (const p of parts) {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < duration) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [duration, pieces]);

  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-[80] h-full w-full" aria-hidden />;
}
