# Design System: PawTrail

> Single source of truth for generating new PawTrail screens (Google Stitch / any AI screen generation).
> PawTrail reunites lost pets with their people. The user is often **panicked, one-handed, in bright
> sunlight, with shaky input** (persona "Maya"). Every screen must feel calm, warm, and instantly
> legible — *reassuring, not corporate*. This document encodes the live design system in
> `styles.css` and intentionally diverges from generic premium-minimal defaults where the product's
> emotional job requires it. Those divergences are called out explicitly in §8.

---

## 1. Visual Theme & Atmosphere

**Density: 4 (Daily-App Balanced) · Variance: 6 (Offset Asymmetric) · Motion: 5 (Fluid, restrained).**

A warm, sunlit, paper-soft interface — the feeling of a community noticeboard at a neighborhood vet,
not a SaaS dashboard. The canvas is a warm cream (never cold white or gray), surfaces are clean white
cards with diffused honey-toned shadows, and a confident burnt-orange accent carries the brand.

The atmosphere is **emotionally supportive first**. Hierarchy is obvious at a glance; the primary action
is never more than one decision away; copy is plain and human ("Let's bring them home," not "Reunite
your companion"). Layouts lead with an **asymmetric split hero** and avoid the centered, fully-boxed
"AI landing page" cliché. Sections breathe — generous vertical rhythm, one strong focal point each.

Two semantic colors do real work and must never be swapped: **red = Lost / urgent**, **green = Found /
calm & safe**. This color-coding is a product requirement, not decoration.

---

## 2. Color Palette & Roles

Warm, single-temperature palette — every neutral is warm-biased. **Never** introduce cool Zinc/Slate
grays; they read clinical and break the tone.

**Neutrals & surfaces**
- **Warm Canvas** (`#FDF7F0`) — primary page background, the paper the product is printed on
- **Pure Surface** (`#FFFFFF`) — cards, inputs, containers, photo frames
- **Warm Surface** (`#FFFAF4`) — subtly raised panels, soft section bands
- **Ink** (`#1F1A14`) — primary text (warm near-black; never pure `#000000`)
- **Soft Ink** (`#4A4135`) — body copy, subheads, descriptions
- **Muted Clay** (`#8C7D6A`) — metadata, captions, timestamps, labels
- **Hairline** (`#EDE4D8`) — 1px borders, dividers, card edges

**Brand accent (primary)**
- **Trail Orange** (`#E87C2E`) — primary CTAs, active nav, focus rings, links-as-action
- **Orange Ink** (`#A34F0A`) — text links, accent text on light (AA contrast)
- **Orange Wash** (`#FFF0E4`) — active chip / hover fill / soft accent surface

**Semantic accents (functional, not interchangeable)**
- **Lost Red** (`#D93A2E`) / **Lost Wash** (`#FDE9E7`) — "I Lost a Pet" flow, urgency, danger callouts
- **Found Green** (`#2D9B6C`) / **Found Wash** (`#E1F3EC`) — "I Found a Pet" flow, safe/reunited, success
- **Warn Amber** (`#B87800`) / **Warn Wash** (`#FFF8E1`) — caution, scam warnings
- **Info Blue** (`#2561C8`) / **Info Wash** (`#E8F0FB`) — neutral system info only

**Shadows** — always tinted warm (honey), never neutral gray, never neon glow:
- sm `0 2px 8px rgba(100,70,30,.07)` · base `0 4px 18px rgba(100,70,30,.09)` · lg `0 12px 40px rgba(100,70,30,.13)`

**Banned color moves:** pure black `#000000`; cool/neutral grays; AI purple/blue neon; outer-glow
shadows; oversaturated gradients on headlines; more than these defined accents.

---

## 3. Typography Rules

**System sans is intentional, not lazy** — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
A web font would breach the product's hard performance budget (**First Contentful Paint < 1.5s on mobile
4G**), and the panicked user is on a phone on cellular. The character comes from **scale, weight, and
warm color** — not from a boutique typeface.

- **Display / Hero:** weight **800**, tracking tight (`-0.035em`), line-height `~0.98–1.1`,
  `clamp(38px, 6.4vw, 68px)`. Short and human — 1–3 words ideal. Hierarchy via weight + color, not size alone.
- **Section headings:** weight 800, `clamp(18px, 3vw, 24px)`, tracking `-0.02em`.
- **Body:** Soft Ink, `~15px`, line-height `1.55`, comfortable measure (target ≤ 65ch). Minimum `14px`.
- **Metadata / labels:** Muted Clay, `11–13px`, occasional uppercase with `letter-spacing: .04em`.
- **Numbers / stats:** weight 800, Orange Ink for emphasis (e.g. live counts, stat cells).

**Banned:** web-font dependency on critical path; pure-black text; thin display weights (< 700 for
headlines); all-caps body copy; gradient-filled headlines; generic serifs. (No serif anywhere in this product.)

---

## 4. Component Stylings

- **Buttons** — radius `9px` (`14px` on large CTAs). Primary = Trail Orange fill, white text. Lost =
  red fill, Found = green fill (semantic, with a soft top→base gradient on the big hero CTAs). Secondary =
  white surface + hairline border. Ghost = transparent → Orange Wash on hover. Tactile: lift `translateY(-2..3px)`
  + warm shadow on hover, press down on `:active`. **No outer glow, no custom cursor.** Min tap target 44px.
- **Action CTAs (Lost / Found)** — the signature component. Horizontal row: emoji glyph · stacked
  title + subline · trailing arrow that nudges right on hover. Gradient fill in the semantic color,
  generous `16px` radius, warm elevation. Always presented as a clear two-up pair.
- **Cards** — white surface, radius `14px`, hairline border, diffused warm shadow. Used when elevation
  communicates hierarchy (listings, testimonials, how-it-works). Photo media sits in fixed-aspect frames
  with consistent radius. Avoid cards-inside-cards and giant boxed section wrappers.
- **Chips / tags** — pill `999px`. Status tags use the semantic wash + ink pairing (Lost Wash/Lost,
  Found Wash/Found). Keep them meaningful — no decorative filler pills.
- **Inputs** — white fill, `1.5px` warm border, radius `9px`, label above. Focus = Trail Orange border
  + `3px` orange focus ring (`rgba(232,124,46,.13)`). Errors inline below the field.
- **Stats band** — single rounded container, hairline dividers between cells (not a heavy grid),
  big Orange-Ink numbers over Muted-Clay uppercase labels.
- **Loaders** — skeletal blocks matching real layout dimensions; no generic circular spinners.
- **Empty states** — warm, composed, reassuring ("No active cases near you yet — here's what to do"),
  never a bare "No data."

---

## 5. Layout Principles

- **Containment:** centered, `max-width: 1100px`, fluid gutter `clamp(12px, 4vw, 24px)`.
- **Hero:** asymmetric **split** — calm copy + the two semantic CTAs + ZIP search on one side, a
  **framed layered pet-photo cluster** with a floating live "reunited" badge on the other. No centered,
  fully-bordered hero box. One strong headline focal point + one image focal point.
- **Sections:** asymmetric premium marketing flow with varied rhythm (split hero → marquee strip →
  stats band → zig-zag content). Avoid three-equal-cards-in-a-row as a crutch; when a 3-up grid is used
  (e.g. "How it works"), give it real numbered structure and breathing room.
- **Grid over math:** CSS Grid for multi-column structure; no `calc()` percentage hacks.
- **Spacing:** generous and even. Section rhythm `~36–40px`; let negative space do work. Don't overfill
  the first viewport — it must stay clean and legible on a small laptop.
- **Full-height:** use `min-h-[100dvh]`, never `h-screen` (iOS Safari jump). PawTrail itself avoids
  forced full-height sections.

---

## 6. Responsive Rules

- **Single-column collapse < 768–860px:** every multi-column layout stacks. **No horizontal scroll —
  ever** (a critical failure on this product, used overwhelmingly on phones).
- **Action-first DOM order:** on mobile the Lost/Found CTAs come *before* decorative media in the DOM —
  the panicked one-handed user reaches action without scrolling past imagery.
- **Hero media on mobile:** the layered photo cluster simplifies to one reassuring photo; decorative
  rotated thumbs and the floating badge are hidden.
- **Type scaling:** headlines via `clamp()`; body never below `14px`.
- **Touch targets:** all interactive elements ≥ `44px`.
- **Spacing:** vertical section gaps scale down proportionally (`clamp(3rem, 8vw, 6rem)` in spirit).
- **Navigation:** desktop horizontal nav collapses to a clean slide-in mobile menu + overlay, with the
  Lost/Found CTAs pinned at the bottom of the menu.

---

## 7. Motion & Interaction

- **Restrained and warm — never showy.** Ease with soft cubic-bezier (`cubic-bezier(.2,.7,.2,1)`);
  no harsh linear easing.
- **Entrance:** staggered float-up — hero copy then media rise with a small delay cascade (~0.6–0.7s).
- **Perpetual micro-loops:** the live "active cases" pulse dot; slow ambient float/drift on the hero
  photo cluster and reunited badge. Subtle, never distracting.
- **Interaction feedback:** CTAs lift + warm-shadow on hover, press on active; arrows nudge on hover;
  chips tint on hover.
- **Performance:** animate **only** `transform` and `opacity` — never `top/left/width/height`.
- **Accessibility:** all non-essential motion is gated behind `@media (prefers-reduced-motion: reduce)`.

---

## 8. Deliberate Divergences from Generic Premium-Minimal Defaults

PawTrail knowingly breaks several "premium" conventions because its emotional and accessibility job
requires it. These are decisions, not oversights:

1. **Emojis are kept** (😰 Lost, 🤝 Found, 🐾 brand, 🎉 reunited). They give instant, language-light
   meaning to a user in distress and reinforce warmth. New screens may use them purposefully — never as
   decorative filler.
2. **Multiple accents are kept** (orange brand + red Lost + green Found). The red/green split is a PRD
   color-coding requirement that communicates urgency vs. safety pre-cognitively. This overrides the
   usual "max one accent" rule.
3. **A fully warm palette is kept** — warm cream canvas, honey-tinted shadows, warm near-black ink. No
   cool Zinc/Slate neutrals anywhere.
4. **System font over a boutique typeface** — mandated by the < 1.5s FCP performance budget on mobile 4G.

Everything else in the generic premium playbook (asymmetric hero, no centered AI box, spring-soft motion,
strict single-column collapse, tinted shadows, anti-AI-slop layout) is fully adopted.

---

## 9. Anti-Patterns (Banned)

- ❌ Pure black `#000000`; cool/neutral grays; warm/cool temperature drift within the palette.
- ❌ AI purple/blue neon; outer-glow or neon shadows; oversaturated gradient headlines.
- ❌ Centered, fully-bordered "AI landing" hero box; giant rounded wrappers around whole sections.
- ❌ Cards-inside-cards-inside-cards; dashboard-style compartment stacking.
- ❌ Three-equal-cards-in-a-row used as a layout crutch; cloned left-text/right-image blocks repeated.
- ❌ Overlapping text/elements; absolute-positioned content collisions.
- ❌ Web-font dependency on the critical render path.
- ❌ Filler UI: "Scroll to explore", bouncing chevrons, scroll arrows, decorative system-status pills,
  fake technical micro-labels.
- ❌ AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen", "Revolutionize".
- ❌ Generic placeholder names (John Doe, Acme, Nexus) or fake round-number stats (`99.99%`).
- ❌ Broken/expired image links — use stable curated photo sources already wired into `data.js`
  (`PHOTOS`, `RECENT_REUNIONS`); fall back to `picsum.photos` or SVG avatars, never dead Unsplash URLs.
- ❌ Horizontal scroll on mobile (critical failure).
- ❌ Corporate, clinical, or cold copy. Always plain, calm, human, reassuring.
