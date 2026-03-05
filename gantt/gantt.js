// ════════════════════════════════════════════════════════
//  PARSING
// ════════════════════════════════════════════════════════

const COL = {
  'task name':'name','name':'name','task':'name',
  'task duration':'duration','duration':'duration',
  'parent task':'parent','parent':'parent',
  'required tasks':'required','required':'required',
  'dependencies':'required','depends on':'required',
  'thread id':'thread_id','thread':'thread_id','threadid':'thread_id',
};

function parseReqStr(s) {
  if (!s || !s.trim()) return [];
  return s.split(s.includes(';') ? ';' : ',')
          .map(r => r.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
}

function splitCSVLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i+1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) throw Error('Empty input');

  const header = splitCSVLine(lines[0]);
  const colMap = {};
  header.forEach((h, i) => { const k = h.trim().toLowerCase(); if (COL[k]) colMap[COL[k]] = i; });
  if (!('name' in colMap))     throw Error("Missing 'Task Name' column");
  if (!('duration' in colMap)) throw Error("Missing 'Task Duration' column");

  const ec = header.length;
  const tasks = {}, threadOrder = {};

  for (let li = 1; li < lines.length; li++) {
    let row = splitCSVLine(lines[li]);
    if (!row.length || row.every(c => !c.trim())) continue;

    // Heal rows with stray empty fields
    if (row.length !== ec) {
      const h2 = row.filter(c => c.trim() !== '');
      while (h2.length < ec) h2.push('');
      if (h2.length >= ec) row = h2.slice(0, ec);
    }

    const g = (f, d = '') => {
      const i = colMap[f];
      return (i !== undefined && i < row.length) ? (row[i].trim() || d) : d;
    };

    const name = g('name');
    if (!name) continue;

    const durRaw = g('duration', '');
    let duration = null;
    if (durRaw !== '') {
      const d = parseFloat(durRaw);
      if (isNaN(d)) throw Error(`Bad duration '${durRaw}' for '${name}'`);
      duration = d;
    }

    tasks[name] = {
      name, duration,
      parent:    g('parent') || null,
      required:  parseReqStr(g('required', '')),
      thread_id: g('thread_id') || null,
      start: null, end: null,
    };

    const tid = tasks[name].thread_id;
    if (tid) {
      if (!threadOrder[tid]) threadOrder[tid] = [];
      threadOrder[tid].push(name);
    }
  }

  // Topologically sort each thread's task list using their explicit requires,
  // so injection order matches dependency order regardless of CSV row order.
  function topoSortThread(names) {
    const nameSet = new Set(names);
    const inDeg = {}, adj = {};
    for (const n of names) { inDeg[n] = 0; adj[n] = []; }
    for (const n of names) {
      for (const r of tasks[n].required) {
        if (nameSet.has(r)) { adj[r].push(n); inDeg[n]++; }
      }
    }
    const queue = names.filter(n => inDeg[n] === 0);
    const result = [];
    while (queue.length) {
      const n = queue.shift();
      result.push(n);
      for (const m of adj[n]) { if (--inDeg[m] === 0) queue.push(m); }
    }
    return result.length === names.length ? result : names; // fallback: keep original order
  }

  for (const tid of Object.keys(threadOrder)) {
    threadOrder[tid] = topoSortThread(threadOrder[tid]);
  }

  // Thread-sequential injection — same-parent siblings only
  for (const names of Object.values(threadOrder)) {
    for (let i = 1; i < names.length; i++) {
      const [prev, curr] = [names[i-1], names[i]];
      if (tasks[curr].parent !== tasks[prev].parent) continue;
      if (tasks[curr].parent === prev) continue;
      if (!tasks[curr].required.includes(prev)) tasks[curr].required.push(prev);
    }
  }

  return { tasks, threadOrder };
}

// ════════════════════════════════════════════════════════
//  SCHEDULING
// ════════════════════════════════════════════════════════

function scheduleAll(tasks) {
  function gs(name, vis = new Set()) {
    const t = tasks[name];
    if (t.start !== null) return t.start;
    if (vis.has(name)) throw Error(`Circular dependency involving '${name}'`);
    vis.add(name);
    let e = 0;
    for (const r of t.required) {
      if (!tasks[r]) throw Error(`Unknown required '${r}' for '${name}'`);
      e = Math.max(e, gs(r, vis) + tasks[r].duration);
    }
    if (t.parent) {
      if (!tasks[t.parent]) throw Error(`Unknown parent '${t.parent}' for '${name}'`);
      e = Math.max(e, gs(t.parent, vis));
    }
    t.start = e;
    t.end   = e + t.duration;
    vis.delete(name);
    return e;
  }
  for (const n of Object.keys(tasks)) gs(n);
}

function resolveNulls(tasks) {
  const nullSet = new Set(Object.keys(tasks).filter(n => tasks[n].duration === null));
  for (const n of nullSet) tasks[n].duration = 0;

  for (let iter = 0; iter < 25; iter++) {
    for (const t of Object.values(tasks)) { t.start = null; t.end = null; }
    scheduleAll(tasks);

    let anyChanged = false, wave = true;
    while (wave) {
      wave = false;
      for (const name of nullSet) {
        const task = tasks[name];
        const kids = Object.values(tasks).filter(t => t.parent === name);
        if (!kids.length) continue;
        const re = Math.max(...kids.map(t => t.end));
        if (re > task.end) {
          const od = task.duration;
          task.end      = re;
          task.duration = re - task.start;
          if (Math.abs(task.duration - od) > 1e-9) anyChanged = true;
          wave = true;
        }
      }
    }
    if (!anyChanged) break;
  }
}

// ════════════════════════════════════════════════════════
//  VISUAL DEPTHS
// ════════════════════════════════════════════════════════

function computeDepths(tasks, threadOrder) {
  const t2row = {};
  for (const [tid, ns] of Object.entries(threadOrder))
    for (const n of ns) t2row[n] = tid;

  const order = [], rem = new Set(Object.keys(tasks));
  while (rem.size) {
    const ready = [...rem].filter(n => !tasks[n].parent || !rem.has(tasks[n].parent));
    (ready.length ? ready : [[...rem][0]]).forEach(n => { order.push(n); rem.delete(n); });
  }

  const vd = {};
  for (const n of order) {
    const par = tasks[n].parent;
    if (!par || !tasks[par]) { vd[n] = 0; continue; }
    const mr = t2row[n], pr = t2row[par];
    if (pr === mr) { vd[n] = vd[par] + 1; continue; }
    const sibs = threadOrder[pr] || [];
    const comp = sibs.filter(s => vd[s] !== undefined).map(s => vd[s]);
    const rmin = comp.length ? Math.min(...comp) : 0;
    vd[n] = (vd[par] - rmin) + 1;
  }
  return vd;
}

// ════════════════════════════════════════════════════════
//  RENDER ENGINE
// ════════════════════════════════════════════════════════

const PALETTE = [
  ['#5b8af5','#3a62c8'], ['#e06c8a','#b84468'], ['#3ecfa6','#259c7c'],
  ['#e0a04a','#b87a2c'], ['#a07ef5','#7855c8'], ['#5bc8e0','#3898ac'],
  ['#e07a50','#b85530'], ['#7fc85b','#58a038'],
];
const BRIGHT = [1, .82, .68, .57];

function fmt(s) {
  s = Math.round(s * 1000) / 1000;
  const frac = s % 1;
  const fs = frac > 5e-4
    ? '.' + String(Math.round(frac * 1000)).padStart(3, '0').replace(/0+$/, '')
    : '';
  const w = Math.floor(s);
  if (w < 60)   return w + fs + 's';
  if (w < 3600) return Math.floor(w / 60) + 'm ' + (w % 60) + fs + 's';
  return Math.floor(w / 3600) + 'h ' + Math.floor((w % 3600) / 60) + 'm ' + (w % 60) + fs + 's';
}

function pickStep(total, ticks) {
  const raw = total / ticks;
  const steps = [.1,.2,.5,1,2,5,10,15,30,60,120,300,600,1800,3600,7200,14400,86400];
  return steps.find(v => v >= raw) || steps[steps.length - 1];
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

let colorIdx = 0;
const colorCache = {};
function getColor(key) {
  if (!colorCache[key]) colorCache[key] = PALETTE[colorIdx++ % PALETTE.length];
  return colorCache[key];
}

function buildGantt(tasks, threadOrder) {
  Object.keys(colorCache).forEach(k => delete colorCache[k]);
  colorIdx = 0;

  const total    = Math.max(...Object.values(tasks).map(t => t.end));
  const vd       = computeDepths(tasks, threadOrder);
  const threaded = new Set(Object.values(threadOrder).flat());

  function makeSubs(list) {
    const rmin = Math.min(...list.map(t => vd[t.name]));
    const byD = {}, depths = {};
    for (const t of list) {
      const d = vd[t.name] - rmin;
      depths[t.name] = d;
      if (!byD[d]) byD[d] = [];
      byD[d].push(t);
    }
    return {
      layers: Object.keys(byD).sort((a, b) => +a - +b).map(d => byD[d]),
      depths,
    };
  }

  // Build row list
  const rows = [];
  for (const [tid, ns] of Object.entries(threadOrder)) {
    const list = ns.map(n => tasks[n]);
    const { layers, depths } = makeSubs(list);
    rows.push({ label: tid, tid, layers, depths, rs: Math.min(...list.map(t => t.start)) });
  }
  for (const [name, t] of Object.entries(tasks)) {
    if (threaded.has(name)) continue;
    const { layers, depths } = makeSubs([t]);
    rows.push({ label: name, tid: null, layers, depths, rs: t.start });
  }
  rows.sort((a, b) => a.rs - b.rs);

  // Build DOM
  const root = document.getElementById('ganttRoot');
  root.innerHTML = '';
  const wrap = el('div', 'gantt-wrap');

  // Header
  const hdr = el('div', 'g-hdr');
  const lh  = el('div', 'g-lbl-hdr'); lh.textContent = 'Thread / Task';
  const tlh = el('div', 'tl-hdr');    tlh.id = 'tlh';
  hdr.append(lh, tlh);
  wrap.appendChild(hdr);

  for (const row of rows) {
    const color = getColor(row.tid || 'solo:' + row.label);
    const rowEl = el('div', 'g-row' + (row.tid ? ' threaded' : ''));

    // Label column
    const lbl = el('div', 'g-lbl');
    const li  = el('div', 'g-lbl-inner');
    if (row.tid) {
      const pill = el('div', 'tpill');
      pill.textContent = row.tid.slice(0, 1).toUpperCase();
      pill.style.cssText = `background:${color[0]}22;color:${color[0]};border:1px solid ${color[0]}44`;
      li.appendChild(pill);
    }
    const ls = el('span');
    ls.textContent = row.label;
    ls.title = row.label;
    li.appendChild(ls);
    lbl.appendChild(li);
    if (row.layers.length > 1) {
      const sn = el('div', 'sublayer-note');
      sn.textContent = row.layers.length + ' sublayers';
      lbl.appendChild(sn);
    }

    // Timeline column
    const tl = el('div', 'g-timeline');
    for (let di = 0; di < row.layers.length; di++) {
      const lane = el('div', 'sublayer');
      lane.dataset.tasks = JSON.stringify(row.layers[di].map(t => ({
        name: t.name, start: t.start, end: t.end, duration: t.duration,
        parent: t.parent, required: t.required, thread_id: t.thread_id,
        depth: row.depths[t.name],
      })));
      lane.dataset.total = total;
      lane.dataset.c0 = color[0];
      lane.dataset.c1 = color[1];
      lane.dataset.di = di;
      if (di > 0) {
        const ind = el('div', 'sl-indent');
        ind.style.cssText = `background:${color[0]};width:${2 + di * 2}px`;
        lane.appendChild(ind);
      }
      tl.appendChild(lane);
    }

    rowEl.append(lbl, tl);
    wrap.appendChild(rowEl);
  }
  root.appendChild(wrap);

  // Position bars after layout (needs actual pixel widths)
  requestAnimationFrame(() => {
    document.querySelectorAll('.sublayer').forEach(lane => {
      const c0  = lane.dataset.c0, c1 = lane.dataset.c1;
      const di  = +lane.dataset.di, tot = +lane.dataset.total;
      const layerTasks = JSON.parse(lane.dataset.tasks);
      const W   = lane.offsetWidth;
      const bright = BRIGHT[Math.min(di, BRIGHT.length - 1)];

      for (const t of layerTasks) {
        const b = el('div', 'bar');
        b.style.cssText = `background:linear-gradient(90deg,${c0},${c1});filter:brightness(${bright})`;
        const left = (t.start / tot) * W;
        const w    = Math.max((t.duration / tot) * W, 3);
        b.style.left  = left + 'px';
        b.style.width = w + 'px';
        const sp = el('span');
        sp.textContent = w > 24 ? t.name : '';
        b.appendChild(sp);
        b.addEventListener('mousemove', e => showTip(e, t, c0));
        b.addEventListener('mouseleave', hideTip);
        b.addEventListener('touchend', e => {
          e.preventDefault();
          if (isMobile()) showTouchTip(t, c0);
          else { showTip(e.changedTouches[0], t, c0); setTimeout(hideTip, 2500); }
        });
        lane.appendChild(b);
      }

      // Grid lines
      const step = pickStep(tot, 10);
      for (let t = step; t < tot; t += step) {
        const gl = el('div', 'gline');
        gl.style.left = (t / tot * W) + 'px';
        lane.appendChild(gl);
      }
    });

    // Timeline ticks
    const tlhEl = document.getElementById('tlh');
    const W     = tlhEl.offsetWidth;
    const step  = pickStep(total, 10);
    for (let t = 0; t <= total; t += step) {
      const tk = el('div', 'tick');
      tk.style.left  = (t / total * W) + 'px';
      tk.textContent = fmt(t);
      tlhEl.appendChild(tk);
    }

    // Stats
    const all = Object.values(tasks);
    const sb  = document.getElementById('statsBar');
    sb.innerHTML = '';
    sb.style.display = 'flex';
    for (const [label, value] of [
      ['Tasks',     all.length],
      ['Threads',   Object.keys(threadOrder).length],
      ['Rows',      rows.length],
      ['Max Depth', Math.max(...all.map(t => vd[t.name]))],
      ['Duration',  fmt(total)],
    ]) {
      const s = el('div', 'stat');
      s.innerHTML = `<div class="stat-lbl">${label}</div><div class="stat-val">${value}</div>`;
      sb.appendChild(s);
    }
  });
}

// ════════════════════════════════════════════════════════
//  TOOLTIP
// ════════════════════════════════════════════════════════

function showTip(e, t, color) {
  const tip = document.getElementById('tip');
  tip.style.display = 'block';
  tip.innerHTML = `
    <div class="tn" style="color:${color}">${t.name}</div>
    ${t.thread_id ? `<div><span class="tk">Thread </span>${t.thread_id}</div>` : ''}
    ${t.parent    ? `<div><span class="tk">Parent </span>${t.parent}</div>`    : ''}
    <div><span class="tk">Depth    </span>${t.depth}</div>
    <div><span class="tk">Start    </span>${fmt(t.start)}</div>
    <div><span class="tk">End      </span>${fmt(t.end)}</div>
    <div><span class="tk">Duration </span>${fmt(t.duration)}</div>
    ${t.required.length ? `<div><span class="tk">Requires </span>${t.required.join(', ')}</div>` : ''}
  `;
  posTip(e);
}

function posTip(e) {
  const tip = document.getElementById('tip');
  let x = e.clientX + 14, y = e.clientY - 8;
  if (x + 300 > window.innerWidth) x = e.clientX - 300;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

function hideTip() { document.getElementById('tip').style.display = 'none'; }

document.addEventListener('mousemove', e => {
  if (document.getElementById('tip').style.display === 'block') posTip(e);
});

// ════════════════════════════════════════════════════════
//  PANEL SWITCHING
// ════════════════════════════════════════════════════════

let activePanel = 'csv';

function switchPanel(p) {
  activePanel = p;
  document.getElementById('csvPanel').style.display = p === 'csv'   ? 'flex' : 'none';
  document.getElementById('tblPanel').style.display = p === 'table' ? 'flex' : 'none';
  document.getElementById('btnCsv').classList.toggle('on', p === 'csv');
  document.getElementById('btnTbl').classList.toggle('on', p === 'table');
  if (p === 'table') populateTable();
}

// ════════════════════════════════════════════════════════
//  CSV ↔ TABLE SYNC
// ════════════════════════════════════════════════════════

function getCsvText() { return document.getElementById('csvText').value.trim(); }

function populateTable() {
  const text = getCsvText();
  if (!text) return;
  try {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const hdr = splitCSVLine(lines[0]);
    const cm  = {};
    hdr.forEach((h, i) => { const k = h.trim().toLowerCase(); if (COL[k]) cm[COL[k]] = i; });
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = '';
    for (let i = 1; i < lines.length; i++) {
      const row = splitCSVLine(lines[i]);
      if (!row.length || row.every(c => !c.trim())) continue;
      const g = f => (cm[f] !== undefined && cm[f] < row.length) ? row[cm[f]].trim() : '';
      addRow(g('name'), g('duration'), g('parent'), g('required'), g('thread_id'));
    }
  } catch (_) {}
}

function tableToCSV() {
  const rows = document.querySelectorAll('#tbody tr');
  if (!rows.length) return '';
  let out = 'Task Name,Task Duration,Parent Task,Required Tasks,Thread Id\n';
  for (const row of rows) {
    const vals = [...row.querySelectorAll('input')].map(i => i.value.trim());
    if (!vals[0]) continue;
    out += vals.map(v => v.includes(',') ? `"${v}"` : v).join(',') + '\n';
  }
  return out;
}

function flushTable() {
  const csv = tableToCSV();
  if (csv) {
    document.getElementById('csvText').value = csv;
    try { localStorage.setItem('gantt-csv', csv); } catch(_) {}
    scheduleContentRender();
  }
}

let syncTimer;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (activePanel === 'table') populateTable();
    // Persist CSV to localStorage
    try { localStorage.setItem('gantt-csv', document.getElementById('csvText').value); } catch(_) {}
    // Auto-update chart if one is already rendered
    scheduleContentRender();
  }, 400);
}

function addRow(name = '', dur = '', parent = '', req = '', thread = '') {
  const tbody = document.getElementById('tbody');
  const tr    = document.createElement('tr');
  const cols  = [
    { v: name,   cls: '',     ph: 'Task name' },
    { v: dur,    cls: 'cdur', ph: 'auto'      },
    { v: parent, cls: '',     ph: ''          },
    { v: req,    cls: '',     ph: 'A;B'       },
    { v: thread, cls: 'cthr', ph: ''          },
  ];
  for (const c of cols) {
    const td  = document.createElement('td');
    const inp = document.createElement('input');
    inp.className   = 'cin ' + c.cls;
    inp.value       = c.v;
    inp.placeholder = c.ph;
    inp.addEventListener('change', flushTable);
    td.appendChild(inp);
    tr.appendChild(td);
  }
  const dtd = document.createElement('td');
  const db  = document.createElement('button');
  db.className  = 'del-btn';
  db.textContent = '×';
  db.onclick = () => { tr.remove(); flushTable(); };
  dtd.appendChild(db);
  tr.appendChild(dtd);
  tbody.appendChild(tr);
}

function clearRows() {
  document.getElementById('tbody').innerHTML = '';
  flushTable();
}

// ════════════════════════════════════════════════════════
//  FILE HANDLING
// ════════════════════════════════════════════════════════

function loadText(text) {
  document.getElementById('csvText').value = text;
  try { localStorage.setItem('gantt-csv', text); } catch(_) {}
  if (activePanel === 'table') populateTable();
  // Always render on file load — immediately if no chart yet, debounced otherwise
  const chartScroll = document.getElementById('chartScroll');
  if (chartScroll.style.display === 'none') render();
  else scheduleContentRender();
}

function onFileChange(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => loadText(ev.target.result);
  r.readAsText(f);
}

function onDragOver(e) {
  e.preventDefault();
  document.getElementById('csvDropZone').classList.add('over');
}

function onDragLeave() {
  document.getElementById('csvDropZone').classList.remove('over');
}

function onDrop(e) {
  e.preventDefault();
  document.getElementById('csvDropZone').classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => loadText(ev.target.result);
  r.readAsText(f);
}

// ════════════════════════════════════════════════════════
//  MAIN RENDER
// ════════════════════════════════════════════════════════

function render(switchTab = true) {
  try {
    if (activePanel === 'table') flushTable();
    const text = getCsvText();
    if (!text) { toast('No CSV data to render.'); return; }
    const { tasks, threadOrder } = parseCSV(text);
    if (!Object.keys(tasks).length) { toast('No tasks found in CSV.'); return; }
    resolveNulls(tasks);
    document.getElementById('chartEmpty').style.display  = 'none';
    document.getElementById('chartScroll').style.display = 'block';
    buildGantt(tasks, threadOrder);
    // Only auto-switch to chart on explicit user-triggered render, not auto-rerender
    if (switchTab && isMobile()) mobileTab('chart');
  } catch (e) {
    toast(e.message);
  }
}

// ════════════════════════════════════════════════════════
//  EXPORT
// ════════════════════════════════════════════════════════

function exportCSV() {
  if (activePanel === 'table') flushTable();
  const csv = getCsvText();
  if (!csv) { toast('No CSV to export.'); return; }
  dl('gantt.csv', csv, 'text/csv');
}

function dl(name, content, mime) {
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
}

// ════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}

// ════════════════════════════════════════════════════════
//  SIDEBAR RESIZE
// ════════════════════════════════════════════════════════

// Desktop sidebar resize
document.getElementById('resizer').addEventListener('mousedown', e => {
  if (isMobile()) return;
  e.preventDefault();
  const move = ev => {
    const w = Math.max(240, Math.min(600, ev.clientX));
    document.getElementById('sidebar').style.width = w + 'px';
  };
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
});

// ════════════════════════════════════════════════════════
//  MOBILE HELPERS
// ════════════════════════════════════════════════════════

function isMobile() {
  return window.innerWidth <= 700 ||
    (window.innerHeight <= 500 && window.innerWidth > window.innerHeight);
}

// Mobile bottom-nav view switching
function mobileTab(tab) {
  if (!isMobile()) return;

  const sidebar   = document.getElementById('sidebar');
  const chartArea = document.getElementById('chartArea');

  // Update nav button states
  ['input','editor','chart'].forEach(t => {
    const btn = document.getElementById('bnav' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('on', t === tab);
  });

  if (tab === 'chart') {
    sidebar.style.display   = 'none';
    chartArea.style.display = 'flex';
    chartArea.classList.add('visible');
  } else {
    sidebar.style.display   = 'flex';
    chartArea.style.display = 'none';
    chartArea.classList.remove('visible');
    // Show the right panel inside the sidebar
    switchPanel(tab === 'editor' ? 'table' : 'csv');
  }
}



// Touch tooltip — tap bar to show, tap sheet or outside to dismiss
function showTouchTip(t, color) {
  const tip = document.getElementById('tip');
  tip.innerHTML = `
    <span class="tip-drag-handle"></span>
    <div class="tn" style="color:${color}">${t.name}</div>
    ${t.thread_id ? `<div><span class="tk">Thread  </span>${t.thread_id}</div>` : ''}
    ${t.parent    ? `<div><span class="tk">Parent  </span>${t.parent}</div>`    : ''}
    <div><span class="tk">Depth   </span>${t.depth}</div>
    <div><span class="tk">Start   </span>${fmt(t.start)}</div>
    <div><span class="tk">End     </span>${fmt(t.end)}</div>
    <div><span class="tk">Duration </span>${fmt(t.duration)}</div>
    ${t.required.length ? `<div><span class="tk">Requires </span>${t.required.join(', ')}</div>` : ''}
  `;
  // rAF ensures the new content is painted before the transition fires
  requestAnimationFrame(() => tip.classList.add('visible'));
}

function hideTouchTip() {
  document.getElementById('tip').classList.remove('visible');
}

// Dismiss touch tip by tapping outside a bar
document.addEventListener('click', e => {
  const tip = document.getElementById('tip');
  if (tip.classList.contains('visible') && !e.target.closest('.bar')) {
    hideTouchTip();
  }
});

// ════════════════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════════════════

const MOON_ICON = `<svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
</svg>`;

const SUN_ICON = `<svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="5"/>
  <line x1="12" y1="1"  x2="12" y2="3"/>
  <line x1="12" y1="21" x2="12" y2="23"/>
  <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
  <line x1="1"  y1="12" x2="3"  y2="12"/>
  <line x1="21" y1="12" x2="23" y2="12"/>
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
</svg>`;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.innerHTML = theme === 'light' ? MOON_ICON : SUN_ICON;
  try { localStorage.setItem('gantt-theme', theme); } catch(_) {}
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'light' ? 'dark' : 'light');
}

// ════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════

const SAMPLE = `Task Name,Task Duration,Parent Task,Required Tasks,Thread Id
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
Post-deploy Monitor,2,Release & Deploy,Production Deploy,Ops`;

// Restore saved CSV or fall back to sample
(function() {
  let saved = null;
  try { saved = localStorage.getItem('gantt-csv'); } catch(_) {}
  document.getElementById('csvText').value = saved || SAMPLE;
})();

// Apply persisted or system theme before first render
(function() {
  let theme = 'dark';
  try { theme = localStorage.getItem('gantt-theme') || theme; } catch(_) {}
  if (theme === 'dark' && window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
  applyTheme(theme);
})();

render();

// ════════════════════════════════════════════════════════
//  AUTO RE-RENDER ON RESIZE / ROTATION / CONTENT CHANGE
//  scheduleReRender  — fires only when container width changes
//                      (ignores tab-switch reflows)
//  scheduleContentRender — fires when CSV content changes,
//                          skips the width check
// ════════════════════════════════════════════════════════
let reRenderTimer = null;
let lastChartWidth = 0;

function _doReRender() {
  lastChartWidth = document.getElementById('chartArea').offsetWidth;
  render(false);
}

function scheduleReRender() {
  const chartScroll = document.getElementById('chartScroll');
  if (chartScroll.style.display === 'none') return; // no chart yet
  const w = document.getElementById('chartArea').offsetWidth;
  if (w === lastChartWidth) return; // same width — ignore (tab switch, etc.)
  clearTimeout(reRenderTimer);
  reRenderTimer = setTimeout(_doReRender, 250);
}

function scheduleContentRender() {
  const chartScroll = document.getElementById('chartScroll');
  if (chartScroll.style.display === 'none') return; // no chart rendered yet
  clearTimeout(reRenderTimer);
  reRenderTimer = setTimeout(_doReRender, 600); // slightly longer for typing comfort
}

if (window.ResizeObserver) {
  new ResizeObserver(scheduleReRender).observe(document.getElementById('chartArea'));
} else {
  window.addEventListener('resize', scheduleReRender);
}
window.addEventListener('orientationchange', () => {
  lastChartWidth = 0; // force re-render on orientation change
  scheduleReRender();
});
