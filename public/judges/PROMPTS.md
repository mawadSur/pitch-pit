# Judge portrait prompts

Stop-gap is `/public/judges/{gstack,vee,robbins}.svg` — gold-on-black initial monograms.
Replace with real illustrated portraits when generated. Target output: 512×512 PNG (WebP optional), saved as `gstack.png` etc., then update `portrait` paths in `lib/judges/index.ts`.

## Shared style anchor

> Stylized vector illustration portrait. Black void background (#0a0a0a). Single warm gold (#FFB800) accent for highlights/lighting. Limited palette: deep blacks, cool charcoals, one gold accent only. Soft volumetric rim light from above-left. Cinematic, minimalist, premium magazine cover energy. Centered head-and-shoulders crop. Clean edges, no rough sketchy lines. Square 1:1 composition. No text, no logos, no labels.

Append the per-judge brief below to the shared style anchor when running.

---

## Gstack — analytical YC reviewer

> Subject: a poised, composed analyst in their 30s, focused expression, neutral half-smile. Reading glasses optional. Clean technical-startup aesthetic — could be a YC partner. Slight forward lean, attentive. Hand near jaw or steepled fingers (thinking pose). Plain dark turtleneck or button-down. Conveys: precision, restraint, judgment.

## Gary V — attention/distribution lens

> Subject: an energetic, expressive entrepreneur in their late 40s, mid-talking gesture (hand pointing or open-palm). Forward lean, intense eye contact, slightly tilted head. Crew-neck T-shirt, plain. Beard, short hair. Conveys: directness, energy, real-talk, no-nonsense.

## Tony R — conviction/standards lens

> Subject: a tall, charismatic performance coach in his 60s. Wide stance shoulders, square jaw, confident half-smile, eyes warm but commanding. Plain dark T-shirt. Strong hands, posture like he's about to gesture out at an audience. Conveys: presence, authority, motivational gravity.

---

## Generation tips

- If using Midjourney: append `--ar 1:1 --style raw --v 6` (or current).
- If using DALL-E / GPT image: include "head-and-shoulders portrait" + "1:1 aspect ratio" + "no text" explicitly.
- These are *interpretations* of public figures, not photorealistic copies — make them recognizable in spirit, not literally identifying.
- Run the same prompt 3–4 times per judge and pick the one with the cleanest gold rim light.
- Post-process: minor levels nudge to match `#FFB800` accent if the gold drifts too orange/red.

## After saving the PNGs

```ts
// lib/judges/index.ts
portrait: "/judges/gstack.png",
portrait: "/judges/vee.png",
portrait: "/judges/robbins.png",
```

Then `next/image` will automatically pick optimal format (AVIF/WebP) at request time.
