---
name: motionsites
description: >-
  MotionSites.ai prompt library — 65 production-ready prompts for motion-heavy landing pages, hero
  sections, SaaS/AI screens, portfolios, agency sites and a loader component (React, Tailwind CSS,
  Framer Motion, HLS.js background video). Use when building or redesigning a landing page, hero
  section or marketing page and you want a concrete reference layout to start from or adapt, or when
  the user mentions motionsites / a MotionSites design by name.
---

# MotionSites.ai prompt library

Source: https://github.com/xiiiabu/motionsites.ai (MIT, by Aayush Soam). The SessionStart hook
(`.claude/hooks/session-start.sh` in the MathChois repo) clones it next to this file with a sparse
checkout of `README.md`, `LICENSE` and `prompts/` only — the ~780MB of preview videos/GIFs under
`assets/` are left out, so the `../assets/...` preview links inside the prompt files do not resolve.

## How to use

1. Read `README.md` (in this directory) — a gallery table grouped by category (Landing Pages,
   SaaS & AI, Hero Sections & Components, Portfolio, Video & Agency) linking to each prompt.
2. Open the chosen `prompts/<Name>.md`. The spec is the fenced block under `## 📋 Prompt`: structure,
   fonts, colors, spacing, animation timings and any background-video URL.
3. Treat the prompt as a design reference, not a drop-in: adapt it to the project's own stack,
   tokens and components (for MathChois: React 19 + Tailwind 4, no Framer Motion dependency unless
   added on purpose). Replace demo brand names/copy, and do not hotlink third-party video URLs in
   production without checking their license.
