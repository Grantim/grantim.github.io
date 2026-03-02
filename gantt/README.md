# ⬡ Gantt Builder

A lightweight, browser-native Gantt chart tool. No server, no dependencies, no build step — just open `index.html`.

---

## Features

- **CSV Import** — drag-and-drop, file browse, or paste directly
- **Task Editor** — spreadsheet-style table that syncs both ways with the CSV
- **Auto-duration parents** — leave duration blank and the tool calculates it from children
- **Thread rows** — tasks sharing a Thread Id are grouped into a single row
- **Sublayers** — nested tasks stack visually within their row by depth
- **Resizable sidebar** — drag the divider to give more room to the chart
- **Hover tooltips** — start, end, duration, depth, parent, and requirements on every bar
- **CSV export** — download the current task list at any time

---

## CSV Format

| Column | Description |
|---|---|
| **Task Name** | Unique identifier for the task |
| **Task Duration** | Duration in any consistent unit (days, seconds…). Leave blank to auto-compute from children |
| **Parent Task** | Name of the parent task (for grouping / sublayers) |
| **Required Tasks** | Semicolon-separated list of tasks that must finish before this one starts |
| **Thread Id** | Tasks with the same Thread Id share a row and run sequentially within the same parent |

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

This produces a 26-day timeline across three threads:

- **Backend** — Design & Planning (days 0–6) → parallel Auth/Payments/Notifications → Integration Tests
- **Frontend** — runs in parallel with Backend Work after planning; UI Components → Auth Flow + Checkout Flow → E2E Tests
- **Ops** — Release & Deploy phase begins once both Backend Work and Frontend Work are complete

The five parent tasks (`Release v2.4`, `Design & Planning`, `Backend Work`, `Frontend Work`, `Release & Deploy`) all have blank durations — the tool resolves them automatically from their children.

---

## Files

```
index.html    — markup only; links to gantt.css and gantt.js
gantt.css     — all styles and design tokens
gantt.js      — parsing, scheduling, rendering, and UI logic
favicon.svg   — app icon
example.csv   — the software release pipeline above
README.md     — this file
```

---

## Scheduling Rules

1. A task starts after all its **Required Tasks** have finished.
2. A task starts no earlier than its **Parent Task** starts.
3. Tasks on the same **Thread Id** with the same parent are linked sequentially (the tool injects the dependency automatically).
4. **Null-duration parents** are resolved iteratively: the scheduler runs until each parent's span converges to the actual max end of its children — handling arbitrarily deep nesting correctly.

---

## Disclaimer

This tool was built in collaboration with **Claude** (Anthropic), an AI assistant.

The scheduling engine, null-duration resolution algorithm, visual depth computation, CSV parser, and the iterative convergence loop were all designed and debugged through an extended conversation with Claude — including several subtle bugs that Claude caught, reasoned through, and fixed:

- Thread injection creating false cross-subtree dependencies
- Null-duration parents not covering their grandchildren
- Two-pass scheduling underestimating parallel child spans
- Iterative convergence needed for deeply nested null-duration tasks

The UI, color palette, layout, and overall design were also shaped by Claude's suggestions.

Claude's contributions here go well beyond autocomplete — it acted as a genuine engineering partner, holding the full context of the scheduling logic across many iterations and proposing architecturally sound fixes rather than patches.

> *"The best code review is one where the reviewer understands the problem better than you do."*
> Claude understood this problem very well.

---

## License

MIT — do whatever you like with it.

## Human Disclamer

All above was written with Claude, even README file. This line is only one written by human being (Above "Disclaimer" was requested intentionally).