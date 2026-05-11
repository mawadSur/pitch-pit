# /judge/[draftId] · Design spec

Cross-referenced from `ui-ux-pro-max` ("Modern Dark / Cinema" style) + the existing minimalist cinematic system in `app/scene.css`.

## Tokens

| token | value |
|---|---|
| bg-canvas | `#0a0a0a` (existing) — never `#000`, OLED smear |
| accent-gold | `#FFB800` (existing) |
| card-surface | `bg-white/[0.03] border border-white/10 backdrop-blur-md` |
| card-elevated | `bg-gradient-to-b from-white/[0.06] to-white/[0.02]` |
| muted-fg | `text-white/55` (AA bump from /40, per A11y-6) |
| label-mono | `font-mono text-[0.65rem] uppercase tracking-[0.16em] text-white/50` |
| value-text | `text-white/90 text-sm font-medium` |
| ease-cinema | `[0.16, 1, 0.3, 1]` (expo-out cubic-bezier) |
| spring-cinema | `{ type: "spring", damping: 20, stiffness: 90 }` |

## Layout

```
desktop ≥1024px
┌──────────────────────────────────────────────────────┐
│ Aggregate Verdict Band                               │ ← appears after 3 land
├─────────────┬────────────────────────────────────────┤
│ Pitch       │ Judge 1 │ Judge 2 │ Judge 3            │ ← grid-cols-3 gap-6
│ Specs       ├────────────────────────────────────────┤
│ (sticky)    │ Soft-gate CTA (anon only)              │
│ w-80        │                                        │
└─────────────┴────────────────────────────────────────┘

mobile <1024px
┌──────────────────────┐
│ Aggregate Band       │
├──────────────────────┤
│ Pitch Specs (accord) │
├──────────────────────┤
│ Judge 1 (full width) │
│ Judge 2              │
│ Judge 3              │
├──────────────────────┤
│ Soft-gate CTA        │
└──────────────────────┘
```

## Surface specs

### 1 · Pitch Specs panel
- `lg:sticky lg:top-24 w-full lg:w-80 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md p-6`
- 2px gold left bar: `before:absolute before:left-0 before:top-6 before:bottom-6 before:w-[2px] before:bg-[#FFB800]/60`
- Spec rows: label-mono + value-text, `border-b border-white/[0.06] py-3`, last row no border
- Specs (v1): Title, Submitted (relative time), Length (chars), Word count
- Mount: `initial={{x:-16, opacity:0}} animate={{x:0, opacity:1}} transition={{duration:0.5, ease:[0.16,1,0.3,1]}}`

### 2 · Judge Portrait card
- `rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md p-6 min-h-[420px] relative overflow-hidden`
- Portrait: `<NextImage>` 96×96 in `rounded-full ring-1 ring-white/15`
- Above portrait (deliberating only): pulsing gold dot `h-1.5 w-1.5 rounded-full bg-[#FFB800] animate-pulse`
- Name (Inter 600 text-lg) + role-label (label-mono)
- Score block: `text-[3.5rem] leading-none font-semibold text-[#FFB800] tabular-nums` + `text-white/40 text-2xl ml-1` "/10"
- Verdict: `italic text-white/85 text-[15px] leading-snug line-clamp-2`
- Reveal: `initial={{opacity:0, y:12, scale:0.98}} animate={{opacity:1, y:0, scale:1}} transition={{duration:0.45, ease:[0.16,1,0.3,1], delay:idx*0.06}}`
- Score number counts up: `useMotionValue(0)` + `animate(mv, finalScore, {duration:0.8, ease:[0.16,1,0.3,1]})`
- On reveal: gold border flash via `box-shadow` keyframes 700ms

### 3 · Deliberating loader (inside JudgeCard)
Three layered effects, NO generic spinner:
1. **Portrait shimmer sweep**: absolutely positioned `motion.div` over portrait — `bg-gradient-to-r from-transparent via-[#FFB800]/15 to-transparent` — `animate={{x:[-120,120]}} transition={{duration:2.5, repeat:Infinity, ease:"linear"}}`
2. **Pulse dots** (3): `[0,0.2,0.4]s` delay, `scale:[0.6,1,0.6]` over 1.2s repeat
3. **Status text cycler**: `AnimatePresence mode="wait"` over `["Reading…","Considering…","Deliberating…","Rendering judgment…"]`, 1.5s per word, fade transitions
- Score placeholder: thin gold underline at `h-[2px] w-12 bg-[#FFB800]/30 animate-pulse`
- Verdict placeholder: `h-3 w-3/4 bg-white/[0.06] rounded animate-pulse`
- Card height locked at `min-h-[420px]` so result swap is CLS-free

### 4 · Soft-gate blur + CTA
- Locked sections wrapped in `<div className="relative select-none pointer-events-none" style={{filter:"blur(8px)"}}>`
- Bottom mask: absolutely positioned `bg-gradient-to-b from-transparent to-[#0a0a0a]` over the bottom 40%
- CTA card sits AFTER the blurred content (in flow):
  - `rounded-2xl bg-[#FFB800]/[0.08] border border-[#FFB800]/30 p-6 text-center backdrop-blur-md`
  - Lock icon (Lucide) gold, 24px
  - Headline: "The judges said more." (Inter 600 text-xl)
  - Sub: "Sign in to read the full deliberation, claim your pitch, see the leaderboard." (text-white/70 text-sm)
  - Primary button: `bg-[#FFB800] text-black font-medium hover:bg-[#FFB800]/90 h-11` "Sign in to unlock"
  - Secondary: text-link "or keep browsing →" (text-white/55 text-sm)
- CTA mount: `initial={{y:24, opacity:0}} animate={{y:0, opacity:1}} transition={{duration:0.4, ease:[0.16,1,0.3,1], delay:0.2}}`

### 5 · Aggregate Verdict band
- Pre-reveal placeholder: `h-32` empty band with thin gold horizontal divider + "Awaiting consensus…" label-mono center
- Post-reveal: `rounded-2xl border border-[#FFB800]/30 bg-gradient-to-r from-[#FFB800]/[0.08] via-transparent to-[#FFB800]/[0.08] p-8 backdrop-blur-md`
- Desktop layout: `flex items-center gap-8`
  - Left: avg score `text-[6rem] leading-none font-semibold text-[#FFB800] tabular-nums` + `/10` muted
  - Right: synthesis line + per-judge breakdown row `font-mono text-xs text-white/55` like `Gstack 8 · Vee 7 · Robbins 9`
  - If avg ≥ 7: `BUILD QUEUE` badge (gold pill, label-mono)
- Mobile: stacked, score centered top
- Reveal (when 3rd judge resolves): border/bg fades from neutral→gold over 0.6s; score counts 0→avg over 0.8s expo-out; ambient gold blob behind via `bg-[#FFB800]/[0.08] blur-3xl rounded-full` pulsing 1.5s once

## Reduced-motion

Wrap the page in `<MotionConfig reducedMotion="user">`. All entrance/score-counter animations collapse to instant fade.

## Accessibility

- Aggregate score has `aria-live="polite"` so SRs announce the final once
- Each judge card's status (deliberating → revealed) announced via `aria-live="polite"` on the inner status text
- Soft-gate CTA: lock icon `aria-hidden`, button has full descriptive label
- Focus ring restored on all CTA buttons, not just hover
- Color contrast: gold #FFB800 on bg #0a0a0a ≈ 10:1 (AAA), white/55 on bg ≈ 6.4:1 (AA)
