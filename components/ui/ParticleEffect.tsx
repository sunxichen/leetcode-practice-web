'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
}

interface ParticleEffectProps {
  x: number;
  y: number;
  active: boolean;
  onComplete?: () => void;
}

const COLORS = ['#2383e2', '#5ba3f5', '#87bfff', '#3d9df5', '#1a6bc4'];

export function ParticleEffect({ x, y, active, onComplete }: ParticleEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = [];
    const count = 15 + Math.floor(Math.random() * 6);

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 4;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        radius: 2 + Math.random() * 3,
        alpha: 1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }

    let animFrame: number;
    const startTime = Date.now();

    function animate() {
      const elapsed = Date.now() - startTime;
      if (elapsed > 600) {
        ctx!.clearRect(0, 0, canvas.width, canvas.height);
        onComplete?.();
        return;
      }

      ctx!.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.alpha = Math.max(0, 1 - elapsed / 600);

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = p.alpha;
        ctx!.fill();
      });

      ctx!.globalAlpha = 1;
      animFrame = requestAnimationFrame(animate);
    }

    animate();
    return () => cancelAnimationFrame(animFrame);
  }, [active, x, y, onComplete]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    />
  );
}
