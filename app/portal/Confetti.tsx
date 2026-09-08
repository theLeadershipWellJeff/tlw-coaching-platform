'use client'
import { useEffect, useRef } from 'react'

/**
 * A short canvas confetti burst — no library. Brand colours plus a little
 * white and gold. Mounts full-screen, ignores pointer events, and unmounts
 * itself through `onDone` once the last piece has fallen (~3 s). Respects
 * prefers-reduced-motion by finishing at once.
 */
const COLOURS = ['#F5821F', '#111226', '#2B3A67', '#F5C242', '#FFFFFF', '#F5821F', '#7A8FCF']

type Piece = { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; colour: string; shape: 'rect' | 'dot' }

export function Confetti({ onDone, pieces = 180 }: { onDone: () => void; pieces?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      const t = setTimeout(() => doneRef.current(), 600)
      return () => clearTimeout(t)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = (canvas.width = window.innerWidth * dpr)
    const H = (canvas.height = window.innerHeight * dpr)
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`

    // Two bursts from the lower corners plus a shower from the top.
    const all: Piece[] = []
    const spawn = (x: number, y: number, n: number, spread: number, base: number, up: number) => {
      for (let i = 0; i < n; i++) {
        const angle = base + (Math.random() - 0.5) * spread
        const speed = (8 + Math.random() * 10) * dpr
        all.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - up * dpr,
          w: (6 + Math.random() * 6) * dpr,
          h: (8 + Math.random() * 8) * dpr,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.3,
          colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
          shape: Math.random() < 0.25 ? 'dot' : 'rect',
        })
      }
    }
    spawn(0, H, Math.floor(pieces * 0.35), Math.PI / 3, -Math.PI / 3, 6)
    spawn(W, H, Math.floor(pieces * 0.35), Math.PI / 3, (-2 * Math.PI) / 3, 6)
    for (let i = 0; i < Math.floor(pieces * 0.3); i++) {
      all.push({
        x: Math.random() * W,
        y: -20 * dpr - Math.random() * H * 0.3,
        vx: (Math.random() - 0.5) * 2 * dpr,
        vy: (2 + Math.random() * 3) * dpr,
        w: (6 + Math.random() * 6) * dpr,
        h: (8 + Math.random() * 8) * dpr,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.2,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
        shape: Math.random() < 0.25 ? 'dot' : 'rect',
      })
    }

    const gravity = 0.35 * dpr
    const drag = 0.985
    const start = performance.now()
    let raf = 0
    const frame = (t: number) => {
      const elapsed = t - start
      ctx.clearRect(0, 0, W, H)
      let alive = 0
      for (const p of all) {
        p.vy += gravity
        p.vx *= drag
        p.vy *= drag
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        if (p.y < H + 40 * dpr) alive++
        const fade = elapsed > 2200 ? Math.max(0, 1 - (elapsed - 2200) / 900) : 1
        ctx.save()
        ctx.globalAlpha = fade
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.colour
        if (p.shape === 'dot') {
          ctx.beginPath()
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // A slight "flutter": squash the width with the rotation.
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w * Math.abs(Math.cos(p.rot * 1.7)) + 1, p.h)
        }
        ctx.restore()
      }
      if (elapsed < 3200 && alive > 0) raf = requestAnimationFrame(frame)
      else doneRef.current()
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [pieces])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[70]" />
}
