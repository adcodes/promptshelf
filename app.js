(function () {
'use strict';

/*
  Promptshelf. Prompts are plain markdown files in a GitHub repo you own:

    prompts/<name>.md
      ---
      title: Explain it to a beginner
      tags: [learning, explain]
      ---
      Explain {{topic}} to someone with no background in {{field}}...

  Every save is a git commit. The commit message is your "why I changed it" note,
  and git history is the version history. Nothing is stored on any server but GitHub.
*/

const LS_CFG = 'promptshelf:gh';
const LS_CACHE = 'promptshelf:cache';
const LS_VALUES = 'promptshelf:values';
const LS_DRAFT = 'promptshelf:draft';
const DIR = 'prompts';
const HIST_LIMIT = 30;
const VAR_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const PREVIEW = !!window.PROMPTSHELF_PREVIEW;

// Bump APP_VERSION (the publish date) and add a line to CHANGES every time the app is published.
const APP_VERSION = '2026.09.24';
const CHANGES = [
  ['2026.09.24', 'New About page. Settings moved to the gear icon at the top of the list.'],
  ['2026.09.23', 'Newest prompts first. "Update available" bar. Unsaved edits are kept if the app closes. Editing on two devices now lets you choose which version to keep. "Clear answers" button.'],
  ['2026.09.22', 'First version.']
];

const ICON_COPY = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
const ICON_FILL = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="8.5" cy="17" r="2.2"/></svg>';
const ICON_GEAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

/* ---------- small helpers ---------- */
function lsGet(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function el(id) { return document.getElementById(id); }
function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
function ago(t) {
  const ts = typeof t === 'number' ? t : Date.parse(t);
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: s > 31536000 ? 'numeric' : undefined });
}
let toastTimer = null;
function toast(msg) {
  const t = el('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}
function copyText(text) {
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.className = 'offscreen';
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => fallback());
  }
  return Promise.resolve(fallback());
}
function autosize(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
function typing() {
  const a = document.activeElement;
  return !!(a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT'));
}
function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function encPath(p) { return p.split('/').map(encodeURIComponent).join('/'); }

/* ---------- variables ---------- */
function vars(body) {
  const out = [];
  body.replace(VAR_RE, (m, n) => { if (out.indexOf(n) < 0) out.push(n); return m; });
  return out;
}
function renderBody(body, vals, bare) {
  return esc(body).replace(VAR_RE, (m, n) => {
    const v = vals && vals[n];
    if (v) return '<span class="filled">' + esc(v) + '</span>';
    return '<mark class="var">' + (bare ? n : '{{' + n + '}}') + '</mark>';
  });
}
function fillText(body, vals) { return body.replace(VAR_RE, (m, n) => (vals && vals[n] ? vals[n] : m)); }

/* ---------- diff (word level) ---------- */
function diffHTML(a, b) {
  const A = a.split(/(\s+)/).filter(Boolean), B = b.split(/(\s+)/).filter(Boolean);
  const n = A.length, m = B.length;
  let i, j;
  if (n * m > 1500000) return '<del>' + esc(a) + '</del> <ins>' + esc(b) + '</ins>';
  const dp = [];
  for (i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  i = 0; j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ t: '=', s: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: '-', s: A[i] }); i++; }
    else { ops.push({ t: '+', s: B[j] }); j++; }
  }
  while (i < n) ops.push({ t: '-', s: A[i++] });
  while (j < m) ops.push({ t: '+', s: B[j++] });
  for (let k = 1; k < ops.length - 1; k++) {
    if (ops[k].t === '=' && /^\s+$/.test(ops[k].s) && ops[k - 1].t !== '=' && ops[k - 1].t === ops[k + 1].t) ops[k].t = ops[k - 1].t;
  }
  let html = '', cur = null, buf = '';
  const flush = () => {
    if (!buf) return;
    html += cur === '=' ? esc(buf) : cur === '-' ? '<del>' + esc(buf) + '</del>' : '<ins>' + esc(buf) + '</ins>';
    buf = '';
  };
  ops.forEach((o) => { if (o.t !== cur) { flush(); cur = o.t; } buf += o.s; });
  flush();
  return html;
}

/* ---------- markdown files: parse and serialise ---------- */
function unq(s) {
  s = s.trim();
  if (s[0] === '"') { try { return JSON.parse(s); } catch (e) { /* fall through */ } }
  if (s[0] === "'" && s.length > 1 && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
  return s;
}
function yq(s) {
  const plain = /^[A-Za-z0-9][^:#"'\[\]{},&*!|>%@`]*$/.test(s) && !/\s$/.test(s) && !/^(true|false|null|yes|no|on|off|~)$/i.test(s) && !/^[\d.]+$/.test(s);
  return plain ? s : JSON.stringify(s);
}
function parseTags(g) {
  let out = [];
  if (g.val) {
    const v = g.val;
    if (/^\[/.test(v)) out = v.replace(/^\[|\]\s*$/g, '').split(',').map((x) => unq(x));
    else if (/,/.test(v)) out = v.split(',').map((x) => unq(x));
    else if (!/^["']/.test(v) && /\s/.test(v)) out = v.split(/\s+/);
    else out = [unq(v)];
  } else {
    g.lines.slice(1).forEach((l) => { const mm = /^\s*-\s*(.+)$/.exec(l); if (mm) out.push(unq(mm[1])); });
  }
  return out.map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
}
function parseFile(path, text) {
  const name = path.split('/').pop().replace(/\.md$/i, '');
  let title = name, tags = [], extras = [], body = text;
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (m) {
    body = text.slice(m[0].length);
    const groups = [];
    m[1].split(/\r?\n/).forEach((line) => {
      const km = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
      if (km) groups.push({ key: km[1], val: km[2].trim(), lines: [line] });
      else if (groups.length) groups[groups.length - 1].lines.push(line);
    });
    groups.forEach((g) => {
      if (g.key === 'title') title = unq(g.val) || name;
      else if (g.key === 'tags') tags = parseTags(g);
      else extras.push(g.lines.join('\n'));
    });
  }
  return { path, title, tags, extras, body: body.replace(/^\s+|\s+$/g, '') };
}
function serialize(p) {
  const fm = ['title: ' + yq(p.title), 'tags: [' + p.tags.map(yq).join(', ') + ']'];
  p.extras.forEach((x) => fm.push(x));
  return '---\n' + fm.join('\n') + '\n---\n' + p.body.replace(/^\s+|\s+$/g, '') + '\n';
}
function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'prompt';
}

/* ---------- backends ---------- */
function httpError(status) { const e = new Error('http ' + status); e.kind = 'http'; e.status = status; return e; }
function networkError() { const e = new Error('network'); e.kind = 'network'; return e; }

function githubBackend(cfg) {
  const base = 'https://api.github.com';
  const repoPath = '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
  async function call(url, opts, raw) {
    opts = opts || {};
    let res;
    try {
      res = await fetch(base + url, {
        method: opts.method || 'GET',
        cache: 'no-store',
        // Only headers GitHub's CORS preflight allows for browsers (Authorization, Accept, Content-Type).
        headers: Object.assign({
          Authorization: 'Bearer ' + cfg.token,
          Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json'
        }, opts.body ? { 'Content-Type': 'application/json' } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) { throw networkError(); }
    if (!res.ok) throw httpError(res.status);
    if (res.status === 204) return null;
    return raw ? res.text() : res.json();
  }
  return {
    // One GraphQL request returns every file's text, so opening the app is a single call.
    async list() {
      const query = 'query($o:String!,$n:String!,$e:String!){repository(owner:$o,name:$n){object(expression:$e){... on Tree{entries{name type object{... on Blob{oid text isTruncated}}}}}}}';
      let res;
      try {
        res = await fetch(base + '/graphql', {
          method: 'POST',
          cache: 'no-store',
          headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { o: cfg.owner, n: cfg.repo, e: 'HEAD:' + DIR } })
        });
      } catch (e) { throw networkError(); }
      if (!res.ok) throw httpError(res.status);
      const data = await res.json();
      const repo = data && data.data && data.data.repository;
      if (!repo) throw httpError(404);
      const tree = repo.object;
      if (!tree || !tree.entries) return [];
      const files = tree.entries
        .filter((e) => e.type === 'blob' && /\.md$/i.test(e.name) && e.object && !e.object.isTruncated && typeof e.object.text === 'string')
        .map((e) => ({ path: DIR + '/' + e.name, sha: e.object.oid, text: e.object.text }));
      try { await this.dates(files); } catch (e) { /* dates only affect the order; the list still works without them */ }
      return files;
    },
    // When each file last changed, from git history, so the list can show newest first on every device.
    async dates(files) {
      for (let i = 0; i < files.length; i += 100) {
        const chunk = files.slice(i, i + 100);
        const fields = chunk.map((f, k) => 'f' + k + ':history(first:1,path:' + JSON.stringify(f.path) + '){nodes{committedDate}}').join(' ');
        const res = await fetch(base + '/graphql', {
          method: 'POST',
          cache: 'no-store',
          headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'query($o:String!,$n:String!){repository(owner:$o,name:$n){object(expression:"HEAD"){... on Commit{' + fields + '}}}}',
            variables: { o: cfg.owner, n: cfg.repo }
          })
        });
        if (!res.ok) throw httpError(res.status);
        const data = await res.json();
        const c = data && data.data && data.data.repository && data.data.repository.object;
        if (!c) return;
        chunk.forEach((f, k) => {
          const h = c['f' + k], n = h && h.nodes && h.nodes[0];
          if (n) f.date = Date.parse(n.committedDate) || 0;
        });
      }
    },
    async write(path, text, message, sha) {
      const body = { message, content: b64(text) };
      if (sha) body.sha = sha;
      const r = await call(repoPath + '/contents/' + encPath(path), { method: 'PUT', body });
      return { sha: r.content.sha };
    },
    async remove(path, sha, message) {
      await call(repoPath + '/contents/' + encPath(path), { method: 'DELETE', body: { message, sha } });
    },
    async history(path, limit) {
      const commits = await call(repoPath + '/commits?path=' + encodeURIComponent(path) + '&per_page=' + limit);
      const out = [];
      for (let i = 0; i < commits.length; i += 5) {
        const batch = commits.slice(i, i + 5);
        const got = await Promise.all(batch.map(async (c) => {
          try {
            const text = await call(repoPath + '/contents/' + encPath(path) + '?ref=' + c.sha, {}, true);
            return { id: c.sha, message: c.commit.message, date: c.commit.author.date, text };
          } catch (e) {
            if (e.kind === 'http' && e.status === 404) return null; // commit that removed the file
            throw e;
          }
        }));
        got.forEach((g) => { if (g) out.push(g); });
      }
      return out; // newest first
    }
  };
}

function demoBackend() {
  const d = 864e5, now = Date.now();
  let n = 0;
  const files = {};
  const sha = () => 'demo' + (++n);
  function add(title, tags, versions) {
    const path = DIR + '/' + slug(title) + '.md';
    const vs = versions.map((v, i) => ({
      id: sha(), message: v.message, date: now - v.days * d,
      text: serialize({ title, tags, extras: [], body: v.body })
    }));
    files[path] = { sha: sha(), versions: vs }; // newest first
  }
  add('Explain it to a beginner', ['learning', 'explain'], [
    { days: 2, message: 'Length kept drifting. Added a word cap and a check question', body: 'Explain {{topic}} to someone with no background in {{field}}. Use one concrete analogy, keep it under {{length}} words, and finish with one question that checks I understood.' },
    { days: 12, message: 'Answers were too abstract, so I asked for an analogy', body: 'Explain {{topic}} to a complete beginner. Use one concrete analogy and keep it short.' },
    { days: 30, message: 'Add Explain it to a beginner', body: 'Explain {{topic}} simply.' }
  ]);
  add('Tighten my draft', ['writing', 'editing'], [
    { days: 5, message: 'Add Tighten my draft', body: 'Edit the text below for clarity and concision. Keep my voice. Cut filler, do not add new ideas, and show what you changed as a short list.\n\n{{draft}}' }
  ]);
  add('Blunt code review', ['code', 'review'], [
    { days: 9, message: 'Add Blunt code review', body: 'Review this {{language}} code like a senior engineer. List bugs first, then risks, then style nits. Be blunt and skip the praise.\n\n{{code}}' }
  ]);
  add('Meeting notes to actions', ['work', 'summary'], [
    { days: 14, message: 'Add Meeting notes to actions', body: 'Turn these notes into three sections: decisions, action items (owner and date), and open questions. If an owner is missing, flag it.\n\n{{notes}}' }
  ]);
  return {
    async list() { return Object.keys(files).map((p) => ({ path: p, sha: files[p].sha, text: files[p].versions[0].text, date: files[p].versions[0].date })); },
    async write(path, text, message, oldSha) {
      const f = files[path];
      if (f && oldSha !== f.sha) throw httpError(409);
      if (!f && oldSha) throw httpError(404);
      if (f) f.versions.unshift({ id: sha(), message, date: Date.now(), text });
      else files[path] = { versions: [{ id: sha(), message, date: Date.now(), text }] };
      files[path].sha = sha();
      return { sha: files[path].sha };
    },
    async remove(path) { delete files[path]; },
    async history(path, limit) { return files[path] ? files[path].versions.slice(0, limit) : []; }
  };
}

/* ---------- state ---------- */
const state = {
  cfg: PREVIEW ? { demo: true } : lsGet(LS_CFG),
  prompts: [],
  values: lsGet(LS_VALUES) || {},
  view: 'list', path: null, query: '', tags: [],
  draft: null, armed: null, busy: false, hist: null,
  conflict: null, restored: 0, updateReady: false,
  status: 'loading', setupError: '', lastRefresh: 0
};
let demo = null;
function backend() {
  if (state.cfg && state.cfg.demo) { if (!demo) demo = demoBackend(); return demo; }
  return githubBackend(state.cfg);
}
function byPath(p) { for (let i = 0; i < state.prompts.length; i++) if (state.prompts[i].path === p) return state.prompts[i]; return null; }
function fromFiles(files) {
  // If the dates couldn't be fetched this time, keep the ones we already knew.
  const known = {};
  state.prompts.forEach((p) => { if (p.date) known[p.path] = p.date; });
  return files.map((f) => { const p = parseFile(f.path, f.text); p.sha = f.sha; p.date = f.date || known[f.path] || 0; return p; });
}
function saveCache() {
  if (state.cfg && !state.cfg.demo) lsSet(LS_CACHE, { repo: state.cfg.owner + '/' + state.cfg.repo, prompts: state.prompts });
}
function saveValues() { lsSet(LS_VALUES, state.values); }
// The draft being edited is kept on the device as you type, so it survives the app being closed.
function repoKey() { return state.cfg ? (state.cfg.demo ? 'demo' : state.cfg.owner + '/' + state.cfg.repo) : ''; }
function keepDraft() { if (!PREVIEW && state.draft) lsSet(LS_DRAFT, { repo: repoKey(), at: Date.now(), draft: state.draft }); }
function dropDraft() { lsDel(LS_DRAFT); state.restored = 0; state.conflict = null; }
function errMsg(e, what) {
  if (e.kind === 'network') return "Can't reach GitHub. Check your connection.";
  if (e.status === 401) return 'GitHub rejected the token. Check Settings.';
  if (e.status === 403) return 'The token needs Contents: read and write on this repo.';
  if (e.status === 404) return 'Repository or file not found. Check Settings.';
  if (e.status === 409 || e.status === 422) return 'This changed elsewhere or already exists. Refresh and try again.';
  return "Couldn't " + what + '. Try again.';
}

/* ---------- status line ---------- */
function statusText() {
  const s = state.status;
  if (state.cfg && state.cfg.demo) return PREVIEW ? 'Preview with sample data. Nothing is saved.' : 'Demo mode. Nothing leaves this page.';
  if (s === 'loading') return 'Updating…';
  if (s === 'ok') return 'Synced with GitHub · ' + state.cfg.repo;
  if (s === 'offline') return "Can't reach GitHub. Showing your last saved copy.";
  if (s === 'auth') return 'GitHub rejected the token. Open Settings to fix it.';
  return "Couldn't load your prompts. Check Settings, or refresh.";
}
function setStatus(s) {
  state.status = s;
  const n = el('syncline');
  if (n) { n.setAttribute('data-s', s); el('synctext').textContent = statusText(); }
}

/* ---------- app updates ---------- */
// A home-screen app on iPhone resumes with the code it loaded earlier, so it can miss updates for days.
// Each time the app comes back into view, ask the site whether the app files changed since this copy loaded.
let appStamp = null, checkingUpdate = false;
async function fileStamp() {
  const parts = await Promise.all(['app.js', 'style.css', 'index.html'].map(async (f) => {
    const r = await fetch(f, { method: 'HEAD', cache: 'no-store' });
    if (!r.ok) throw new Error('stamp');
    return r.headers.get('etag') || r.headers.get('last-modified') || '';
  }));
  return parts.every(Boolean) ? parts.join('|') : null;
}
async function checkForUpdate() {
  if (PREVIEW || checkingUpdate || state.updateReady || !/^https?:$/.test(location.protocol)) return;
  checkingUpdate = true;
  try {
    const s = await fileStamp();
    if (s && !appStamp) appStamp = s;
    else if (s && s !== appStamp) {
      state.updateReady = true;
      const b = el('updatebar'); if (b) b.innerHTML = updateBarHTML();
    }
  } catch (e) { /* offline or blocked: try again next time */ }
  checkingUpdate = false;
}
function updateBarHTML() {
  return state.updateReady ? '<button class="update" data-act="reload">A new version of the app is available. <strong>Tap to reload</strong></button>' : '';
}

/* ---------- search ---------- */
function score(p) {
  if (state.tags.length && !state.tags.every((t) => p.tags.indexOf(t) > -1)) return 0;
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const title = p.title.toLowerCase(), body = p.body.toLowerCase(), tags = p.tags.join(' ').toLowerCase();
  let total = 0;
  for (const t of terms) {
    let s = 0;
    if (title.indexOf(t) > -1) s += 5;
    if (tags.indexOf(t) > -1) s += 3;
    if (body.indexOf(t) > -1) s += 1;
    if (!s) return 0;
    total += s;
  }
  return total;
}
function allTags() {
  const c = {};
  state.prompts.forEach((p) => p.tags.forEach((t) => { c[t] = (c[t] || 0) + 1; }));
  return Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b));
}

/* ---------- views ---------- */
function bar(left, right) { return '<div class="bar"><div>' + left + '</div><div>' + right + '</div></div>'; }

function tagbarHTML() {
  return allTags().map((t) => '<button class="chip" data-act="tag" data-tag="' + esc(t) + '" aria-pressed="' + (state.tags.indexOf(t) > -1) + '">' + esc(t) + '</button>').join('');
}
function resultsHTML() {
  const hasQuery = state.query.trim() || state.tags.length;
  const rows = state.prompts.map((p) => ({ p, s: score(p) })).filter((r) => r.s > 0);
  // Search results by best match; otherwise newest first (last added or edited).
  if (state.query.trim()) rows.sort((a, b) => b.s - a.s);
  else rows.sort((a, b) => (b.p.date || 0) - (a.p.date || 0) || a.p.title.localeCompare(b.p.title, undefined, { sensitivity: 'base' }));
  if (!rows.length) {
    if (hasQuery) return '<li class="empty">Nothing matches that.<br><button class="txt" data-act="clear">Clear search</button></li>';
    if (state.status === 'loading' && !state.prompts.length) return '<li class="empty">Loading your prompts…</li>';
    return '<li class="empty">No prompts yet.<br><button class="txt" data-act="new">Add your first prompt</button></li>';
  }
  return rows.map((r) => {
    const p = r.p, hasVars = vars(p.body).length > 0;
    return '<li class="row">' +
      '<button class="open" data-act="open" data-path="' + esc(p.path) + '">' +
        '<span class="rtitle">' + esc(p.title) + '</span>' +
        '<span class="snip">' + renderBody(p.body, null, true) + '</span>' +
        (p.tags.length || p.date ? '<span class="rmeta">' + p.tags.map((t) => '<span>#' + esc(t) + '</span>').join('') + (p.date ? '<span class="when">' + esc(ago(p.date)) + '</span>' : '') + '</span>' : '') +
      '</button>' +
      '<button class="cp" data-act="quick" data-path="' + esc(p.path) + '" aria-label="' + (hasVars ? 'Fill in and copy ' : 'Copy ') + esc(p.title) + '">' + (hasVars ? ICON_FILL : ICON_COPY) + '</button>' +
    '</li>';
  }).join('');
}
function listView() {
  return '<div id="updatebar">' + updateBarHTML() + '</div>' +
    '<header class="head"><div class="titlerow"><h1>Prompts</h1>' +
      (PREVIEW ? '' : '<button class="gear" data-act="settings" aria-label="Settings and About">' + ICON_GEAR + '</button>') + '</div>' +
      '<p class="count" id="count">' + plural(state.prompts.length, 'prompt') + '</p></header>' +
    '<div class="sync" id="syncline" data-s="' + state.status + '"><span id="synctext">' + esc(statusText()) + '</span>' +
      (PREVIEW ? '' : '<button class="txt" data-act="refresh">Refresh</button>') + '</div>' +
    '<div class="search"><input id="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search titles, prompts and tags" aria-label="Search prompts" value="' + esc(state.query) + '"></div>' +
    '<div class="tagbar" id="tagbar">' + tagbarHTML() + '</div>' +
    '<ul class="list" id="results">' + resultsHTML() + '</ul>' +
    '<button class="fab" data-act="new">' + ICON_PLUS + 'New prompt</button>';
}
function refreshList() {
  const tb = el('tagbar'), rs = el('results'), c = el('count');
  if (tb) tb.innerHTML = tagbarHTML();
  if (rs) rs.innerHTML = resultsHTML();
  if (c) c.textContent = plural(state.prompts.length, 'prompt');
}

function iosNeedsHomeScreen() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return ios && !standalone;
}
const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
function setupView() {
  const connected = !!(state.cfg && !state.cfg.demo);
  const c = connected ? state.cfg : { owner: '', repo: '' };
  const back = state.cfg ? bar('<button class="txt" data-act="cancelsetup">‹ Prompts</button>', '') : '<div class="spacer"></div>';
  const steps = '<ol class="steps">' +
      '<li>On GitHub, create a <strong>private</strong> repository for your prompts (for example <code>my-prompts</code>) and tick "Add a README".</li>' +
      '<li>Create a <a href="' + TOKEN_URL + '" target="_blank" rel="noopener noreferrer">fine-grained token</a>. Under "Repository access" choose "Only select repositories" and pick that repo. Under "Permissions", set <strong>Contents</strong> to "Read and write".</li>' +
      '<li>Paste the details below. The token stays on this device only.</li>' +
    '</ol>';
  return back +
    '<h2 class="pt">' + (state.cfg ? 'Settings' : 'Connect GitHub') + '</h2><div class="spacer"></div>' +
    (state.cfg ? '<button class="linkrow" data-act="about"><span>About Promptshelf</span><span>How it works ›</span></button><h3 class="sec">GitHub connection</h3>' : '') +
    (iosNeedsHomeScreen() ? '<p class="notice"><strong>On iPhone, install first.</strong> Tap Share, then "Add to Home Screen", and open the app from its icon before connecting. Safari and the home-screen app keep separate storage, and Safari can clear it after a week of not being used.</p>' : '') +
    (connected
      ? '<p class="hint flat">Connected to <strong>' + esc(c.owner + '/' + c.repo) + '</strong>. If your key has expired, <a href="' + TOKEN_URL + '" target="_blank" rel="noopener noreferrer">create a new one</a> with the same settings and paste it below.</p>'
      : steps) +
    '<label class="field"><span>GitHub username</span><input id="s-owner" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(c.owner) + '"></label>' +
    '<label class="field"><span>Repository name</span><input id="s-repo" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="my-prompts" value="' + esc(c.repo) + '"></label>' +
    '<label class="field"><span>Token</span><input id="s-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + (c.token ? 'Leave blank to keep the current token' : 'github_pat_…') + '"></label>' +
    '<p class="err" id="s-err">' + esc(state.setupError) + '</p>' +
    '<button class="primary" data-act="connect" id="s-btn">Connect</button>' +
    (connected ? '<div class="foot"><button class="danger" data-act="signout">Sign out and clear this device</button></div>' : '') +
    (state.cfg ? '' : '<p class="or">or</p><button class="secondary" data-act="demo">Try it with sample prompts</button>' +
      '<div class="foot"><button class="txt plain" data-act="about">About Promptshelf</button></div>') +
    '<p class="ver">Version ' + APP_VERSION + '</p>';
}

function aboutView() {
  const connected = state.cfg && !state.cfg.demo;
  const repoLink = connected
    ? '<a href="https://github.com/' + encodeURIComponent(state.cfg.owner) + '/' + encodeURIComponent(state.cfg.repo) + '" target="_blank" rel="noopener noreferrer">' + esc(state.cfg.owner + '/' + state.cfg.repo) + '</a>'
    : 'your private repository';
  const icon = (svg) => '<span class="ico">' + svg + '</span>';
  return bar('<button class="txt" data-act="settings">‹ Settings</button>', '') +
    '<h2 class="pt">About Promptshelf</h2>' +
    '<div class="about">' +
      '<p>Your personal prompt library. Every prompt is a plain text file in ' + repoLink + ' on GitHub, which only you can see. This app is a friendly way to find, fill in and improve them on your phone or computer. There is no Promptshelf account and no Promptshelf server.</p>' +

      '<h3 class="sec">Using a prompt</h3>' +
      '<ul>' +
        '<li>' + icon(ICON_COPY) + '<span><strong>Copy.</strong> The prompt has no blanks, so one tap copies it.</span></li>' +
        '<li>' + icon(ICON_FILL) + '<span><strong>Fill in.</strong> The prompt has blanks. Tap to fill them in, then Copy.</span></li>' +
      '</ul>' +
      '<p>To make a blank, wrap a word in double braces, like <code>{{topic}}</code>. Use letters, numbers or _ only. What you type into blanks is remembered on this device until you tap <strong>Clear answers</strong>.</p>' +

      '<h3 class="sec">Saving and history</h3>' +
      '<p>Every save is kept as a new version. The "What changed, and why?" note is shown in <strong>History</strong>, where you can see what changed and restore an older version.</p>' +
      '<p>Unsaved edits are kept on the device, so they come back if the app closes. If you edit a prompt that was changed on another device in the meantime, you can choose which version to keep, and the other one stays in History.</p>' +
      '<p>The list shows the prompts you added or edited most recently first. Search shows the best match first.</p>' +

      '<h3 class="sec">Your devices</h3>' +
      '<p>Each device connects with its own GitHub key (token). Keys expire. When one does, the app stops syncing on that device: <a href="' + TOKEN_URL + '" target="_blank" rel="noopener noreferrer">create a new key</a> and paste it in Settings. <strong>Sign out</strong> removes the key, your saved answers and any unsaved edit from this device. Your prompts on GitHub are not affected.</p>' +

      '<h3 class="sec">Updates</h3>' +
      '<p>When a new version of the app is published, a blue bar appears at the top of the list. Tap it to reload.</p>' +

      '<h3 class="sec">Version ' + APP_VERSION + '</h3>' +
      '<ul class="changes">' + CHANGES.map((c) => '<li><strong>' + esc(c[0]) + '</strong><span>' + esc(c[1]) + '</span></li>').join('') + '</ul>' +
    '</div>';
}

function detailView() {
  const p = byPath(state.path);
  if (!p) { state.view = 'list'; return listView(); }
  const names = vars(p.body), vals = state.values[p.path] || {};
  const fields = names.map((n) => '<label class="field"><span>' + esc(n) + '</span><textarea rows="1" data-var="' + esc(n) + '" autocomplete="off" aria-label="' + esc(n) + '">' + esc(vals[n] || '') + '</textarea></label>').join('');
  return bar('<button class="txt" data-act="back">‹ Prompts</button>', '<button class="txt" data-act="edit">Edit</button>') +
    '<h2 class="pt">' + esc(p.title) + '</h2>' +
    '<div class="meta">' + (p.tags.length ? p.tags.map((t) => '<span>#' + esc(t) + '</span>').join('') : '<span>No tags</span>') + '</div>' +
    fields +
    (names.length ? '<div class="tools"><button class="ghost" data-act="clearvals">Clear answers</button></div>' : '') +
    '<div class="preview" id="preview">' + renderBody(p.body, vals) + '</div>' +
    '<button class="linkrow" data-act="history"><span>History</span><span>Versions and changes ›</span></button>' +
    '<div class="dock"><button data-act="copy">Copy prompt</button></div>';
}

function varChips(body) {
  const n = vars(body);
  if (!n.length) return '<span>Wrap a word in double braces to make it fill-in.</span>';
  return n.map((v) => '<mark class="var">' + esc(v) + '</mark>').join(' ');
}
function tagEditHTML() {
  const d = state.draft;
  const chips = d.tags.map((t) => '<button class="chip" data-act="rmtag" data-tag="' + esc(t) + '" aria-label="Remove tag ' + esc(t) + '">' + esc(t) + ' ×</button>').join('');
  const sug = allTags().filter((t) => d.tags.indexOf(t) < 0).slice(0, 8).map((t) => '<button class="chip sug" data-act="addsug" data-tag="' + esc(t) + '">+ ' + esc(t) + '</button>').join('');
  return '<div class="tagedit">' + chips + '<input id="tagin" class="tagin" enterkeyhint="done" autocomplete="off" autocapitalize="off" placeholder="Add a tag" aria-label="Add a tag"></div>' +
    (sug ? '<div class="tagedit gap">' + sug + '</div>' : '');
}
function editorNotice() {
  const c = state.conflict;
  if (c) {
    return '<div class="notice conflict"><strong>' + (c.theirs ? 'This prompt was changed on another device' : 'This prompt was deleted on another device') + '</strong> since you started editing.' +
      (c.theirs ? '<span class="clabel">Their version</span><div class="diff">' + renderBody(c.theirs.body, null) + '</div>' : '') +
      '<div class="cact"><button class="ghost" data-act="keepmine">Save mine anyway</button>' +
      '<button class="ghost" data-act="keeptheirs">' + (c.theirs ? 'Use theirs' : 'Discard mine') + '</button></div>' +
      (c.theirs ? '<p class="hint">Either way, nothing is lost: the other version stays in History.</p>' : '') +
    '</div>';
  }
  if (state.restored) return '<p class="notice">Restored your unsaved changes from ' + esc(ago(state.restored)) + '. Save them, or tap Cancel to throw them away.</p>';
  return '';
}
function editorView() {
  const d = state.draft, isNew = !d.path;
  return bar('<button class="txt" data-act="cancel">Cancel</button>', '<button class="txt strong" data-act="save" id="savebtn">Save</button>') +
    '<h2 class="pt">' + (isNew ? 'New prompt' : 'Edit prompt') + '</h2><div class="spacer"></div>' +
    editorNotice() +
    '<label class="field"><span>Title</span><input id="f-title" autocomplete="off" placeholder="What is this prompt for?" value="' + esc(d.title) + '"></label>' +
    '<label class="field"><span>Prompt</span><textarea id="f-body" spellcheck="false" placeholder="Write the prompt. Use {{name}} for anything that changes each time.">' + esc(d.body) + '</textarea></label>' +
    '<div class="tools"><button class="ghost" data-act="insvar">Add variable</button><div id="varchips">' + varChips(d.body) + '</div></div>' +
    '<div class="field"><span>Tags</span><div id="tagedit">' + tagEditHTML() + '</div></div>' +
    '<label class="field"><span>What changed, and why? (optional)</span><input id="f-note" autocomplete="off" placeholder="' + (isNew ? 'e.g. First draft' : 'e.g. Answers ran long, so I added a word cap') + '" value="' + esc(d.note) + '"></label>' +
    '<p class="hint">This becomes the commit message, so it shows up in History.</p>' +
    (isNew ? '' : '<button class="danger" data-act="delete">Delete prompt</button>');
}

function historyView() {
  const p = byPath(state.path), h = state.hist;
  if (!p || !h) { state.view = 'list'; return listView(); }
  let content;
  if (h.loading) content = '<p class="meta">Loading history…</p>';
  else if (h.error) content = '<p class="err">' + esc(h.error) + '</p>';
  else if (!h.items.length) content = '<p class="meta">No history yet.</p>';
  else {
    const items = h.items, total = items.length, out = [];
    for (let i = 0; i < total; i++) {
      const v = items[i], older = items[i + 1], isCur = i === 0;
      let body;
      if (older) {
        body = older.body === v.body ? '<div class="diff quiet">Only the title or tags changed.</div>' : '<div class="diff">' + diffHTML(older.body, v.body) + '</div>';
      } else {
        body = '<div class="diff">' + renderBody(v.body, null) + '</div>';
      }
      const msg = (v.message || '').trim();
      out.push('<li class="ver-item' + (isCur ? ' now' : '') + '">' +
        '<div class="vh"><strong>v' + (total - i) + '</strong><span>' + (isCur ? 'Current · ' : '') + ago(v.date) + '</span></div>' +
        '<p class="vnote' + (msg ? '' : ' none') + '">' + (msg ? esc(msg) : 'No note') + '</p>' +
        body +
        (isCur ? '' : '<div class="vact"><button class="ghost" data-act="restore" data-i="' + i + '">Restore v' + (total - i) + '</button></div>') +
      '</li>');
    }
    content = '<ul class="hist">' + out.join('') + '</ul>' +
      (total >= HIST_LIMIT ? '<p class="hint">Showing the latest ' + HIST_LIMIT + ' versions. Older ones are in the repo\'s git history.</p>' : '');
  }
  return bar('<button class="txt" data-act="tolist">‹ ' + esc(p.title) + '</button>', '') +
    '<h2 class="pt">History</h2>' +
    '<div class="meta"><span>Each version is a git commit. Changes from the version before are highlighted.</span></div>' +
    content;
}

/* ---------- render and navigation ---------- */
function render(scrollTop) {
  const app = el('app'), v = state.view;
  app.innerHTML = v === 'list' ? listView() : v === 'detail' ? detailView() : v === 'edit' ? editorView() : v === 'history' ? historyView() : v === 'about' ? aboutView() : setupView();
  Array.prototype.forEach.call(app.querySelectorAll('textarea[data-var]'), autosize);
  if (scrollTop) window.scrollTo(0, 0);
}
function go(view, extra) {
  state.view = view; state.armed = null;
  if (extra) Object.assign(state, extra);
  render(true);
}

/* ---------- loading ---------- */
async function refresh() {
  if (!state.cfg) return;
  setStatus('loading');
  state.lastRefresh = Date.now();
  try {
    const files = await backend().list();
    state.prompts = fromFiles(files);
    saveCache();
    setStatus('ok');
    if (state.view === 'list') { refreshList(); }
    else if ((state.view === 'detail' || state.view === 'history') && !typing()) render(false);
  } catch (e) {
    setStatus(e.kind === 'network' ? 'offline' : (e.status === 401 ? 'auth' : 'error'));
    if (state.view === 'list') refreshList();
  }
}

/* ---------- actions ---------- */
function openEditor(path) {
  const p = path ? byPath(path) : null;
  // sha is the version this edit started from; saving against it is how a change made on another device is noticed.
  state.draft = p ? { path: p.path, sha: p.sha, title: p.title, body: p.body, tags: p.tags.slice(), note: '' } : { path: null, sha: null, title: '', body: '', tags: [], note: '' };
  state.restored = 0; state.conflict = null;
  go('edit');
  if (!p) { const t = el('f-title'); if (t) t.focus(); }
}
function normTag(raw) { return raw.trim().toLowerCase().replace(/^#/, '').replace(/[\s,]+/g, '-').replace(/^-+|-+$/g, ''); }
function refreshTags() {
  const box = el('tagedit'), old = el('tagin'), pending = old ? old.value : '';
  box.innerHTML = tagEditHTML();
  const inp = el('tagin'); inp.value = pending;
  return inp;
}
function addTag(raw, silent) {
  const t = normTag(raw), d = state.draft;
  if (t && d.tags.indexOf(t) < 0) { d.tags.push(t); keepDraft(); }
  const old = el('tagin'); if (old) old.value = '';
  const inp = refreshTags();
  if (!silent) inp.focus();
}
function newPath(title) {
  const taken = {};
  state.prompts.forEach((p) => { taken[p.path.toLowerCase()] = 1; });
  const base = slug(title);
  let path = DIR + '/' + base + '.md', i = 2;
  while (taken[path.toLowerCase()]) { path = DIR + '/' + base + '-' + i + '.md'; i++; }
  return path;
}
function setBusy(b, label) {
  state.busy = b;
  const s = el('savebtn'); if (s) { s.disabled = b; s.textContent = b ? 'Saving…' : 'Save'; }
  const c = el('copybtn'); if (c) c.disabled = b;
}
async function saveDraft(opts) {
  opts = opts || {};
  if (state.busy) return;
  if (state.conflict) { window.scrollTo(0, 0); toast('Choose which version to keep first'); return; }
  const d = state.draft, pend = el('tagin');
  if (pend && pend.value.trim()) addTag(pend.value, true);
  const body = d.body.replace(/^\s+|\s+$/g, '');
  if (!body) { toast('Add the prompt text first'); return; }
  const title = d.title.trim() || body.replace(/\s+/g, ' ').slice(0, 42);
  const old = d.path ? byPath(d.path) : null;
  if (old && old.sha === d.sha && old.title === title && old.body === body && old.tags.join('\n') === d.tags.join('\n')) {
    dropDraft(); go('detail', { path: old.path }); toast('No changes'); return;
  }
  // Save against the version this edit started from (d.sha), not whatever the list holds now,
  // so GitHub refuses the write if another device saved in between.
  const np = { path: d.path || newPath(title), title, tags: d.tags.slice(), extras: old ? old.extras : [], body };
  const message = (d.note || '').trim() || (d.path ? 'Update ' + title : 'Add ' + title);
  setBusy(true);
  try {
    const r = await backend().write(np.path, serialize(np), message, d.path ? d.sha : null);
    np.sha = r.sha; np.date = Date.now();
    const cur = byPath(np.path);
    if (cur) state.prompts[state.prompts.indexOf(cur)] = np; else state.prompts.push(np);
    saveCache(); dropDraft();
    state.busy = false;
    go('detail', { path: np.path });
    toast(opts.done || 'Saved');
  } catch (e) {
    setBusy(false);
    const clash = e.kind === 'http' && (e.status === 409 || e.status === 422 || e.status === 404);
    if (clash && d.path) await checkConflict(e);
    else if (clash && !opts.retried) {
      // A new prompt whose file name was just taken on another device: reload and pick a free name.
      try { state.prompts = fromFiles(await backend().list()); saveCache(); } catch (e2) { toast(errMsg(e, 'save')); return; }
      saveDraft({ retried: true });
    } else toast(errMsg(e, 'save'));
  }
}
// A save was refused. Reload the prompts to see whether another device changed or deleted this one.
async function checkConflict(e) {
  const d = state.draft;
  setBusy(true);
  try {
    state.prompts = fromFiles(await backend().list());
    saveCache();
  } catch (e2) { setBusy(false); toast(errMsg(e2, 'save')); return; }
  setBusy(false);
  const cur = byPath(d.path);
  if (cur && cur.sha === d.sha) { toast(errMsg(e, 'save')); return; }
  state.conflict = { theirs: cur ? { sha: cur.sha, body: cur.body } : null };
  render(true);
}
function resolveConflict(keepMine) {
  const d = state.draft, c = state.conflict;
  if (!c) return;
  state.conflict = null;
  if (keepMine) {
    // Build on top of their version, so theirs stays in History as the version before mine.
    d.sha = c.theirs ? c.theirs.sha : null;
    keepDraft();
    saveDraft({ done: c.theirs ? 'Saved. Their version is in History.' : 'Saved' });
  } else {
    dropDraft();
    if (c.theirs) go('detail', { path: d.path }); else go('list', { path: null });
    toast(c.theirs ? 'Kept their version' : 'Discarded your changes');
  }
}
async function deletePrompt() {
  const p = byPath(state.draft.path);
  if (!p) return;
  setBusy(true);
  try {
    await backend().remove(p.path, p.sha, 'Delete ' + p.title);
    state.prompts = state.prompts.filter((x) => x !== p);
    delete state.values[p.path]; saveValues(); saveCache(); dropDraft();
    state.busy = false;
    go('list', { path: null });
    toast('Deleted');
  } catch (e) { setBusy(false); toast(errMsg(e, 'delete')); }
}
async function openHistory() {
  const p = byPath(state.path);
  if (!p) return;
  state.hist = { path: p.path, loading: true, error: null, items: [] };
  go('history');
  try {
    const raw = await backend().history(p.path, HIST_LIMIT);
    state.hist.items = raw.map((h) => ({ id: h.id, message: h.message, date: h.date, body: parseFile(p.path, h.text).body }));
  } catch (e) { state.hist.error = errMsg(e, 'load the history'); }
  state.hist.loading = false;
  if (state.view === 'history' && state.hist.path === p.path) render(false);
}
async function restoreVersion(i) {
  const p = byPath(state.path), v = state.hist && state.hist.items[i];
  if (!p || !v || state.busy) return;
  const n = state.hist.items.length - i;
  state.busy = true;
  try {
    const np = { path: p.path, title: p.title, tags: p.tags, extras: p.extras, body: v.body };
    const r = await backend().write(p.path, serialize(np), 'Restore v' + n, p.sha);
    np.sha = r.sha; np.date = Date.now();
    state.prompts[state.prompts.indexOf(p)] = np;
    saveCache();
    state.busy = false;
    go('detail');
    toast('Restored v' + n + ' as a new version');
  } catch (e) { state.busy = false; toast(errMsg(e, 'restore')); }
}
function doCopy(text, unfilled) {
  copyText(text).then((ok) => {
    if (!ok) toast('Copy blocked. Select the text and copy it manually.');
    else toast(unfilled ? 'Copied. ' + plural(unfilled, 'blank') + ' left unfilled' : 'Copied');
  });
}
function readSetup() {
  return { owner: el('s-owner').value.trim(), repo: el('s-repo').value.trim(), token: el('s-token').value.trim() };
}
async function connect() {
  const f = readSetup(), prev = state.cfg && !state.cfg.demo ? state.cfg : null;
  const token = f.token || (prev && prev.token) || '';
  const fail = (m) => { state.setupError = m; const e = el('s-err'); if (e) e.textContent = m; };
  if (!/^[A-Za-z0-9_.-]+$/.test(f.owner)) return fail('Enter your GitHub username.');
  if (!/^[A-Za-z0-9_.-]+$/.test(f.repo)) return fail('Enter the repository name (no slashes).');
  if (!token) return fail('Paste your token.');
  const btn = el('s-btn'); btn.disabled = true; btn.textContent = 'Checking…'; fail('');
  const cfg = { owner: f.owner, repo: f.repo, token };
  try {
    const files = await githubBackend(cfg).list();
    lsSet(LS_CFG, cfg);
    state.cfg = cfg; demo = null;
    state.prompts = fromFiles(files);
    saveCache(); setStatus('ok');
    go('list');
    toast('Connected');
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Connect';
    if (e.kind === 'network') fail("Can't reach GitHub. Check your connection.");
    else if (e.status === 401) fail('GitHub rejected that token. Check it was copied in full and has not expired.');
    else if (e.status === 404 || e.status === 403) fail("Can't see that repository. Check the name, and that the token has access to it with Contents: read and write.");
    else fail("Couldn't connect. Try again.");
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.getAttribute('data-act'), path = b.getAttribute('data-path');
  let p;
  switch (act) {
    case 'new': openEditor(null); break;
    case 'open': go('detail', { path }); break;
    case 'back': go('list'); break;
    case 'tolist': go('detail'); break;
    case 'edit': openEditor(state.path); break;
    case 'cancel': dropDraft(); go(state.draft && state.draft.path && byPath(state.draft.path) ? 'detail' : 'list', { path: state.draft && state.draft.path }); break;
    case 'save': saveDraft(); break;
    case 'keepmine': resolveConflict(true); break;
    case 'keeptheirs': resolveConflict(false); break;
    case 'history': openHistory(); break;
    case 'refresh': refresh(); break;
    case 'reload': location.reload(); break;
    case 'settings': state.setupError = ''; go('setup'); break;
    case 'cancelsetup': go('list'); break;
    case 'about': go('about'); break;
    case 'connect': connect(); break;
    case 'demo': state.cfg = { demo: true }; demo = null; state.prompts = []; state.status = 'ok'; go('list'); refresh(); break;
    case 'signout':
      if (state.armed === 'signout') {
        lsDel(LS_CFG); lsDel(LS_CACHE); lsDel(LS_VALUES); dropDraft();
        state.cfg = null; state.prompts = []; state.values = {}; state.setupError = '';
        go('setup'); toast('Signed out. This device no longer has the token.');
      } else { state.armed = 'signout'; b.textContent = 'Tap again to sign out'; }
      break;
    case 'tag': {
      const t = b.getAttribute('data-tag'), ix = state.tags.indexOf(t);
      if (ix > -1) state.tags.splice(ix, 1); else state.tags.push(t);
      refreshList(); break;
    }
    case 'clear': state.query = ''; state.tags = []; render(false); break;
    case 'clearvals':
      delete state.values[state.path]; saveValues();
      render(false); toast('Cleared');
      break;
    case 'quick':
      p = byPath(path);
      if (!p) break;
      if (vars(p.body).length) {
        go('detail', { path });
        const f = document.querySelector('textarea[data-var]'); if (f) f.focus();
      } else doCopy(p.body, 0);
      break;
    case 'copy': {
      p = byPath(state.path);
      if (!p) break;
      const vals = state.values[p.path] || {};
      const left = vars(p.body).filter((n) => !vals[n]).length;
      doCopy(fillText(p.body, vals), left);
      break;
    }
    case 'insvar': {
      const ta = el('f-body'), s = ta.selectionStart, en = ta.selectionEnd, v = ta.value, sel = v.slice(s, en).trim();
      if (sel) {
        const name = sel.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'value';
        ta.value = v.slice(0, s) + '{{' + name + '}}' + v.slice(en);
        ta.setSelectionRange(s + name.length + 4, s + name.length + 4);
      } else {
        ta.value = v.slice(0, s) + '{{}}' + v.slice(en);
        ta.setSelectionRange(s + 2, s + 2);
      }
      state.draft.body = ta.value;
      el('varchips').innerHTML = varChips(ta.value);
      ta.focus();
      break;
    }
    case 'rmtag': {
      const rm = state.draft.tags.indexOf(b.getAttribute('data-tag'));
      if (rm > -1) { state.draft.tags.splice(rm, 1); keepDraft(); }
      refreshTags(); break;
    }
    case 'addsug': addTag(b.getAttribute('data-tag'), true); break;
    case 'restore': restoreVersion(parseInt(b.getAttribute('data-i'), 10)); break;
    case 'delete':
      if (state.armed === 'delete') deletePrompt();
      else { state.armed = 'delete'; b.textContent = 'Tap again to delete for good'; }
      break;
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') { state.query = t.value; refreshList(); }
  else if (t.getAttribute && t.getAttribute('data-var')) {
    const p = byPath(state.path); if (!p) return;
    if (!state.values[p.path]) state.values[p.path] = {};
    state.values[p.path][t.getAttribute('data-var')] = t.value;
    saveValues(); autosize(t);
    el('preview').innerHTML = renderBody(p.body, state.values[p.path]);
  }
  else if (t.id === 'f-title') { state.draft.title = t.value; keepDraft(); }
  else if (t.id === 'f-body') { state.draft.body = t.value; el('varchips').innerHTML = varChips(t.value); keepDraft(); }
  else if (t.id === 'f-note') { state.draft.note = t.value; keepDraft(); }
  else if (t.id === 'tagin' && /,$/.test(t.value)) addTag(t.value);
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.id === 'tagin' && e.key === 'Enter') { e.preventDefault(); if (t.value.trim()) addTag(t.value); else t.blur(); }
  else if (t.id === 'q' && e.key === 'Enter') t.blur();
  else if (t.id === 's-token' && e.key === 'Enter') connect();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
  if (document.visibilityState === 'visible' && state.view === 'list' && state.cfg && !state.cfg.demo && !typing() && Date.now() - state.lastRefresh > 15000) refresh();
});

/* ---------- start ---------- */
if (!PREVIEW && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
checkForUpdate(); // remembers which version this copy is
if (!state.cfg) {
  state.view = 'setup';
  render(false);
} else {
  if (!state.cfg.demo) {
    const cache = lsGet(LS_CACHE);
    if (cache && cache.repo === state.cfg.owner + '/' + state.cfg.repo && Array.isArray(cache.prompts)) state.prompts = cache.prompts;
  }
  // Reopen an edit that never got saved, e.g. because the phone closed the app in the background.
  const kept = PREVIEW ? null : lsGet(LS_DRAFT);
  if (kept && kept.repo === repoKey() && kept.draft) {
    state.draft = kept.draft; state.restored = kept.at || Date.now(); state.view = 'edit';
  }
  render(false);
  refresh();
}
})();
