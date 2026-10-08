# AdiCorp HR palette

Source of truth: `src/styles/palette.css` (imported by `src/index.css`). Tailwind names come from
`tailwind.config.ts`. Everything is built around the AdiCorp blue `hsl(216 93% 37%)` / `#074DB7`,
which stays `--primary` and is `brand-700` on the scale.

Rule of thumb: **reach for semantic tokens first** (`primary`, `muted`, `success`, `chart-3`...).
They switch correctly in dark mode. The raw scales (`brand-*`, `neutral-*`) are absolute and do not
flip, so use them only where a fixed colour is the point (brand art, the loader, gradients).

## Core (shadcn) tokens

| Token | Light | Use |
|---|---|---|
| `background` / `card` / `popover` | white | page, cards, menus |
| `foreground` | neutral-900 ink `#141925` | body text, headings |
| `muted` | neutral-100 `#f2f4f8` | quiet fills, table header rows, skeletons |
| `muted-foreground` | neutral-500 `#656e7c` | secondary text. AA on white (5.2:1) and on `muted` (4.7:1). Do not fade it further with `/70` for small text |
| `border` / `input` | neutral-200 `#e3e7ee` | hairlines, field borders |
| `primary` | `#074DB7` | primary buttons, links, active nav, focus ring |
| `destructive` | = `danger` | destructive buttons (shadcn name kept) |

## Brand scale `brand-50` … `brand-950`

Perceptually even OKLCH steps. 50 is an airy tint, 700 is the brand blue, 950 is the deep navy of the logo.

- `brand-50/100`: selected-row wash, hover tints on brand surfaces, illustration fills.
- `brand-400/500`: accents on dark brand surfaces (gradient ends, loader arc).
- `brand-600`: chart slot 1 (`chart-1`), the brighter brand blue for marks.
- `brand-700`: = `primary`.
- `brand-900/950`: text or fills on light brand panels, the navy end of `gradient-brand`.

## Neutral scale `neutral-0` … `neutral-950`

Greys with a faint blue cast so they sit with the brand instead of looking dead.
0 white · 50 page wash · 100 muted fill · 200 border · 300 strong border · 400 disabled/placeholder icons ·
500 muted text · 600 secondary text · 700/800 dark UI · 900 ink · 950 darkest surface.

## Status: `success`, `warning`, `danger`, `info`

Each has three tokens:

| Token | Meaning | Contrast |
|---|---|---|
| `success` (DEFAULT) | strong tone: text, icons, dots, solid fills | >= 5.4:1 on white, on `-soft`, and on a `/15` tint |
| `success-soft` | tinted background for badges, banners, icon wells | |
| `success-foreground` | text on a solid `bg-success` | white (>= 5.4:1) |

Patterns:

- **Status badge:** `bg-success-soft text-success border-success/15` (the kit's `StatusBadge` does this; use `<StatusBadge status="approved" />`).
- **Banner / callout:** `bg-warning-soft border-warning/20 text-warning` with an icon. Body copy inside can stay `text-foreground`.
- **Solid pill / count:** `bg-danger text-danger-foreground`.
- **Stat tile tone:** `<StatTile tone="success" />` gives a `success-soft` icon well and a strong value colour.

Meanings are fixed: success = done/approved/present/paid, warning = pending/needs attention,
danger = rejected/overdue/failed/absent, info = scheduled/in progress/on leave. Always pair a status
colour with an icon or a label; colour is never the only signal. `danger` and `destructive` are the
same colour; prefer `danger` for state and `destructive` for destructive actions.

## Highlight accent: `highlight`, `highlight-soft`, `highlight-foreground`

A restrained teal that harmonises with the blue. Use **sparingly**: a "New" pill, a featured marker,
one callout per screen. Never for status (it is not "success") and never as a second primary button.

## Charts: `chart-1` … `chart-8`

Fixed categorical order, colour-blind checked (protan/deutan, normal vision) and >= 3:1 on white:

| Slot | Family | Light |
|---|---|---|
| 1 | blue (brand-600) | `#0464e1` |
| 2 | sky | `#05a0cf` |
| 3 | green | `#018451` |
| 4 | amber | `#cc8305` |
| 5 | violet | `#7152c4` |
| 6 | red | `#cf4040` |
| 7 | teal | `#10a49e` |
| 8 | magenta | `#b2417f` |

- Assign slots **in order** (1, 2, 3...) and keep an entity's colour stable when filters change the
  series count. Use `chartColor(i)` / `chartConfig([...])` from `@/components/kit`.
- Never cycle: past 8 series, fold into "Other" (`CHART_OTHER`) or use small multiples.
- Scatter/bubble charts (any two marks can touch): at most 3 series (slots 1-3 pass the all-pairs check).
- A single series uses `chart-1`; no legend needed, the title names it.
- When a series **means** a status (present/absent, paid/overdue) use `statusColor(status)` /
  `STATUS_COLORS`, not chart slots, and do not mix the two in one chart.
- Labels, values and legends use text tokens (`foreground`, `muted-foreground`), never the series colour.
- Chrome: gridlines `CHART_CHROME.grid` (border), ticks `CHART_CHROME.axis` (muted-foreground).
- One y-axis per chart. Two measures of different scale go in two charts.

## Gradients

| Utility | Token | Use |
|---|---|---|
| `bg-gradient-brand` | `--gradient-brand` navy 950 → 800 → brand 700 → azure 500 | brand moments only: auth hero panel, onboarding hero, marketing headers. White text is AA over the 950-700 part; keep small text off the azure end |
| `bg-gradient-surface` | `--gradient-surface` | calm full-page backdrops: loader, auth, onboarding, error pages. Pair with `bg-background` |

Do not use gradients on cards, tables, buttons, badges or charts. One gradient per screen at most.

## Loading

- Full-screen and section loading: `BrandLoader` (`@/components/common/BrandLoader`), with `fullScreen` for
  route/session waits. It phase-locks with the static splash in `index.html`, so consecutive loaders do not jump.
- Inside a page (data still loading): kit skeletons (`PageSkeleton`, `TableSkeleton`, `StatGridSkeleton`...).
- Buttons: inline `Loader2` spinner in the button itself.

## Dark mode

`.dark` (on `<html>`, or any subtree) redefines the core tokens, status tones (light text on dark tints;
solid fills take dark ink), the chart palette (re-stepped and re-validated on the dark card `#141925`)
and both gradients. Scales stay fixed.

## Shape, size and focus (kit conventions)

| Element | Rule |
|---|---|
| Buttons, inputs, selects, textareas, menus, popovers | `rounded-xl` (12px). Default height `h-10` (40px) so a button lines up with a field; `size="sm"` / filter bars `h-9` |
| Cards, sections, stat tiles, dialogs, sheets | `rounded-2xl` (16px), `border-border`, `shadow-sm` |
| Phone hit targets | at least 40px (`h-10 w-10`) for icon buttons, pagination, row menus and tabs |
| Focus | keyboard only: `focus-visible:ring-2 focus-visible:ring-ring` (inset inside scrollers) |
| Counts | `bg-primary/10 text-primary` pills; solid `bg-primary` on the active row or tab. Red (`destructive`) only for the unread bell |
| Dates | `formatDate` gives `8 Oct 2026`, `formatDateTime` gives `8 Oct 2026, 14:05`; relative times carry the exact time in `title` |
| Overlays | `bg-neutral-950/50` with a 2px blur; dialogs keep a 12px margin on phones and scroll inside themselves |
