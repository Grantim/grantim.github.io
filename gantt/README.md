# ⬡ Gantt Builder

A lightweight, browser-native Gantt chart tool. No server, no dependencies, no build step — just open `index.html`.

**[Live demo →](https://grantim.github.io/gantt)**

---

## Features

- **CSV Import** — drag-and-drop, file browse, or paste directly; chart auto-updates on change
- **Task Editor** — spreadsheet-style table that syncs both ways with the CSV
- **Auto-duration parents** — leave duration blank and the tool calculates it from children
- **Thread rows** — tasks sharing a Thread Id are grouped into a single row with sublayers
- **Dependency-order scheduling** — topological sort ensures correct ordering regardless of CSV row order
- **Hover tooltips** — start, end, duration, depth, parent, and requirements on every bar
- **Light / dark theme** — toggle in the topbar; preference persisted to localStorage
- **CSV export** — download the current task list at any time
- **SVG export** — download a self-contained, fully styled SVG (transparent background, fills container width)
- **Mobile responsive** — bottom-nav tab layout, touch tooltips, auto re-render on rotation
- **LocalStorage persistence** — CSV content saved automatically and restored on reload

---

## CSV Format

| Column | Required | Description |
|---|---|---|
| **Task Name** | ✓ | Unique identifier for the task |
| **Task Duration** | ✓ | Duration in any consistent unit (seconds, days…). Leave blank to auto-compute from children |
| **Parent Task** | | Name of the parent task — for grouping and sublayer nesting |
| **Required Tasks** | | Semicolon-separated tasks that must finish before this one starts |
| **Thread Id** | | Tasks with the same Thread Id share a row and are chained sequentially within the same parent |

---

## Example — Software Release Pipeline

```csv
Task Name,Task Duration,Parent Task,Required Tasks,Thread Id
Release v2.4,,,,Backend
Design & Planning,,Release v2.4,,Backend
Requirements,2,Design & Planning,,Backend
Architecture,3,Design & Planning,Requirements,Backend
API Contract,1,Design & Planning,Architecture,Backend
Backend Work,,Release v2.4,Design & Planning,Backend
Auth Service,4,Backend Work,,Backend
Payments API,5,Backend Work,Auth Service,Backend
Notifications,3,Backend Work,Auth Service,Backend
Integration Tests,2,Backend Work,Payments API;Notifications,Backend
Frontend Work,,Release v2.4,Design & Planning,Frontend
UI Components,3,Frontend Work,,Frontend
Auth Flow,2,Frontend Work,UI Components,Frontend
Checkout Flow,4,Frontend Work,UI Components,Frontend
E2E Tests,2,Frontend Work,Auth Flow;Checkout Flow,Frontend
Release & Deploy,,Release v2.4,Backend Work;Frontend Work,Ops
Staging Deploy,1,Release & Deploy,,Ops
QA Sign-off,2,Release & Deploy,Staging Deploy,Ops
Production Deploy,1,Release & Deploy,QA Sign-off,Ops
Post-deploy Monitor,2,Release & Deploy,Production Deploy,Ops
```

Three threads running in parallel across a 26-day timeline. Parent tasks (`Release v2.4`, `Design & Planning`, etc.) have blank durations — resolved automatically from their children.

---

## Scheduling Rules

1. A task starts after all its **Required Tasks** have finished.
2. A task starts no earlier than its **Parent Task** starts.
3. Tasks on the same **Thread Id** with the same parent are topologically sorted then linked sequentially — works correctly regardless of CSV row order.
4. **Null-duration parents** are resolved iteratively: the scheduler reruns until each parent's span converges to the actual max end of its children, handling arbitrarily deep nesting.

---

## File Structure

```
index.html          — app shell; loads gantt-core.js + gantt-ui.js
gantt-core.js       — pure logic: CSV parsing, scheduling, SVG export (no DOM)
gantt-ui.js         — DOM: tooltips, panels, table editor, export, theme, auto-render
gantt.css           — styles and design tokens (light + dark theme)
favicon.svg         — app icon
example.csv         — the software release pipeline above
svg/
  index.html        — SVG-only endpoint: ?csv=<b64>&w=&h=&theme= → raw SVG
README.md           — this file
```

---

## SVG Export

Click **↓ SVG** in the topbar to download a self-contained SVG of the current chart.

The SVG uses `width="100%"` with a `viewBox`, so it scales to any container. The export function also accepts options programmatically:

```js
buildGanttSVG(tasks, threadOrder, {
  width:  1600,      // internal coordinate width (default: 1600)
  height: null,      // null = auto-fit to row count
  theme:  'dark',    // 'dark' | 'light' | null (reads live CSS vars)
})
```

To embed in a GitHub README, download the SVG, commit it to your repo, and link the raw URL:

```markdown
![Gantt Chart](https://raw.githubusercontent.com/you/repo/main/docs/gantt.svg)
```

---

## Disclaimer

Built in collaboration with **Claude** (Anthropic). The scheduling engine, null-duration resolution, topological sort, visual depth computation, CSV parser, SVG renderer, mobile layout, and iterative convergence logic were all designed and debugged through an extended conversation with Claude — including several subtle bugs caught, reasoned through, and fixed along the way.

---

## License

MIT — do whatever you like with it.

## Human Disclamer

All above was written with Claude, even README file. This line is only one written by human being (Above "Disclaimer" was requested intentionally).