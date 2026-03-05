
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
//  scheduleReRender
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
  lastChartWidth = 0;
  scheduleReRender();
});
