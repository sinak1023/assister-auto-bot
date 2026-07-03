# Design system — Arc Vault

A compact token system for an institution-grade lending terminal. Written down
before building the UI, and self-critiqued against default "AI look" traps at
the end.

## Concept

The subject is **programmable dollars (USDC) borrowed against Bitcoin collateral
(cirBTC), settled institutionally on Arc.** The identity is a **precision
financial instrument** — a well-made trading terminal, not a crypto casino:
legible, dense-but-calm, trustworthy. Dark-first, because that is the native
habitat of a settlement/risk terminal and it makes the one bright moment — the
health-factor gauge — carry.

The palette is built on a single idea drawn straight from the product: a
**two-metal system**. Cool **azure** stands for the dollar/settlement side
(USDC, primary actions, links). Warm **gold** stands for the Bitcoin-collateral
side (cirBTC). Dollars are blue, Bitcoin is gold — the two things the protocol
weighs against each other are the two colors of the interface. A separate,
strictly **functional** signal ramp (green → amber → red) is reserved for risk,
so risk never competes with brand.

## Color tokens (OKLCH)

Six named colors carry the identity; a three-stop signal ramp carries risk.

| Token         | Role                                   | Dark (primary)            |
|---------------|----------------------------------------|---------------------------|
| `ink`         | app background (deep cool slate)       | `oklch(0.17 0.018 255)`   |
| `surface`     | cards / panels / popovers              | `oklch(0.21 0.020 255)`   |
| `mist`        | primary text                           | `oklch(0.96 0.008 250)`   |
| `azure`       | primary — USDC, actions, links, focus  | `oklch(0.68 0.150 245)`   |
| `gold`        | collateral accent — cirBTC             | `oklch(0.80 0.120 85)`    |
| `slate-line`  | borders / hairlines (subtle, cool)     | `oklch(1 0 0 / 10%)`      |

Functional risk ramp (used **only** for health/risk, states, and data series):

| Token       | Role                    | Dark                    |
|-------------|-------------------------|-------------------------|
| `positive`  | healthy / success       | `oklch(0.72 0.16 150)`  |
| `caution`   | at-risk / warning       | `oklch(0.80 0.14 75)`   |
| `danger`    | liquidatable / error    | `oklch(0.63 0.22 25)`   |

Notes:
- `gold` (hue 85, yellower) and `caution` (hue 75, more orange) are deliberately
  separated so the collateral accent never reads as a warning.
- A light theme is defined for accessibility/completeness, but dark is the
  designed-for primary. Both are theme-token driven — no hard-coded colors in
  components.
- `chart-1..5` map to azure / gold / positive / caution / danger so the interest
  and utilization charts speak the same language as the rest of the UI.

## Type

Three faces, each with one job. All financial values use **tabular figures** so
digits never shift as they tick.

- **Display — Space Grotesk.** Section titles and the gauge headline. Technical,
  geometric, a little engineered — instrument energy without novelty.
- **Body — IBM Plex Sans.** UI copy and labels. Institutional and highly legible;
  chosen over Inter precisely to avoid the default look.
- **Data / numbers — IBM Plex Mono.** Every balance, rate, HF, and address.
  Monospaced and tabular by construction, so columns of figures align.

Type scale (rem): 0.75 · 0.8125 · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.25.
Labels are small, uppercase-tracked Plex Sans; numbers are Plex Mono one step up.

## Signature element — the Health Factor gauge

One bold, well-executed moment; everything else stays quiet around it.

A **semicircular arc gauge**: a 180° track from `danger` (left) through `caution`
to `positive` (right), with a needle pointing to the current health factor and
the HF value in large Space Grotesk at the center. The arc's fill and the needle
share the risk color at the current HF, so the whole instrument changes color as
a position approaches liquidation. When the oracle price moves, the needle
sweeps — the single orchestrated animation in the app (respecting
`prefers-reduced-motion`). HF 1.0 sits at a marked tick so "the edge" is a
physical place on the dial.

## Motion

Restraint. The gauge needle sweep is the one deliberate transition. Elsewhere:
150–200ms fades on state changes only. No decorative/looping animation.

## Self-critique — is this a default?

- **Not the cream + serif + terracotta look:** background is a deep cool slate,
  body is a sans (Plex), there is no terracotta and no serif anywhere.
- **Not the near-black + single acid accent look:** background is slate-blue not
  black, and the identity is a *two-color* dollar/Bitcoin system plus a separate
  functional ramp — not one neon accent on black. Azure is a confident, mid-
  chroma blue, not acid.
- **Not the broadsheet/newspaper look:** this is a dense card-based terminal with
  a radial signature instrument, not hairline-ruled columns of prose.

The two-metal (azure/gold) concept is derived from the product's own mechanics
(dollars vs. Bitcoin), which is what keeps it from being a generic dashboard.
