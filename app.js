'use strict';

/* =========================================================
   1. CONSTANTS
   ========================================================= */
const CONFIG = {
  STORAGE_KEY: 'baat.v1',
  MASTERY_MIN: 0,
  MASTERY_MAX: 100,
  MASTERY_START: 0,
  DELTA_CORRECT: 1,
  DELTA_WRONG: -1,
  DELTA_BROWSE: 1,
  GAME_MIN_PHRASES: 4,
  MC_OPTIONS: 4,
  MATCH_PAIRS: 5,
  DEFAULT_LANG: 'th-TH',
  ADVANCE_MS: 750,
};

/* =========================================================
   2. DOM SHORTCUTS
   ========================================================= */
const $ = s => document.querySelector(s);

/* =========================================================
   3. STORE
   ========================================================= */
let state = { version: 1, phrases: [], sentences: [], wishlist: [], sentWishlist: [], settings: { lang: CONFIG.DEFAULT_LANG } };

function genId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : (Date.now() + '-' + Math.random().toString(16).slice(2));
}

function load() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.phrases)) {
        state = { version: 1, phrases: p.phrases, sentences: Array.isArray(p.sentences) ? p.sentences : [], wishlist: Array.isArray(p.wishlist) ? p.wishlist : [], sentWishlist: Array.isArray(p.sentWishlist) ? p.sentWishlist : [], settings: { lang: p.settings?.lang || CONFIG.DEFAULT_LANG } };
      }
    }
  } catch (e) {
    toast("Couldn't read saved data.");
    state.phrases = [];
  }
}

function save() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Storage full — could not save.');
  }
}

function newPhrase(input, translation, phonetics, note) {
  return {
    id: genId(),
    input: input.trim(),
    translation: translation.trim(),
    phonetics: (phonetics || '').trim(),
    note: (note || '').trim(),
    mastery: CONFIG.MASTERY_START,
    viewCount: 0,
    gamesSeen: 0,
    gamesCorrect: 0,
    createdAt: Date.now(),
  };
}

function addPhrase(i, t, p, n) { state.phrases.push(newPhrase(i, t, p, n)); save(); }
function bulkAdd(arr) {
  arr.forEach(o => {
    const p = newPhrase(o.input, o.translation, o.phonetics, o.note);
    if (o.mastery !== undefined && o.mastery !== '') p.mastery = clampM(Number(o.mastery) || 0);
    state.phrases.push(p);
  });
  save();
}

function parseBlocks(text) {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
  const valid = [], skipped = [];
  for (const blk of blocks) {
    const lines = blk.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (!lines.length) continue;
    const fields = {};
    for (const line of lines) {
      const m = line.match(/^([^:]+):\s*(.*)/);
      if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
    }
    const translation = fields.translation || fields.thai;
    if (fields.english && translation && fields.phonetics) {
      valid.push({ input: fields.english, translation, phonetics: fields.phonetics, note: fields.note || '', mastery: fields.mastery });
    } else {
      skipped.push(blk);
    }
  }
  return { valid, skipped };
}
function updatePhrase(id, patch) { const e = state.phrases.find(x => x.id === id); if (e) { Object.assign(e, patch); save(); } }
function removePhrase(id) { state.phrases = state.phrases.filter(x => x.id !== id); save(); }

function newSentence(input, translation, phonetics, note) {
  return { id: genId(), input, translation, phonetics: phonetics||'', note: note||'', mastery: 0, pinned: false };
}
function addSentence(input, translation, phonetics, note) { state.sentences.push(newSentence(input, translation, phonetics, note)); save(); }
function updateSentence(id, patch) { const e = state.sentences.find(x => x.id === id); if (e) { Object.assign(e, patch); save(); } }
function removeSentence(id) { state.sentences = state.sentences.filter(x => x.id !== id); save(); }
function bulkAddSentences(arr) {
  arr.forEach(o => {
    const s = newSentence(o.input, o.translation, o.phonetics, o.note);
    if (o.mastery !== undefined && o.mastery !== '') s.mastery = clampM(Number(o.mastery) || 0);
    state.sentences.push(s);
  });
  save();
}
function applySentenceMastery(id, delta) {
  const e = state.sentences.find(x => x.id === id);
  if (!e) return;
  e.mastery = clampM(e.mastery + delta);
  save();
}

/* =========================================================
   4. MASTERY
   ========================================================= */
function clampM(v) { return Math.max(CONFIG.MASTERY_MIN, Math.min(CONFIG.MASTERY_MAX, v)); }

function applyMastery(id, delta) {
  const e = state.phrases.find(x => x.id === id);
  if (!e) return;
  e.mastery = clampM(e.mastery + delta);
  save();
}

function getBandThresholds() {
  const n = state.phrases.length;
  if (!n) return { warmThresh: 5, hotThresh: 16 };
  const sorted = state.phrases.map(p => p.mastery).sort((a, b) => a - b);
  const p20 = sorted[Math.min(Math.floor(0.20 * n), n - 1)];
  const p85 = sorted[Math.min(Math.floor(0.85 * n), n - 1)];
  const warmThresh = Math.min(20, Math.max(5, p20));
  const hotThresh  = Math.min(50, Math.max(15, p85));
  return { warmThresh, hotThresh };
}

function band(m) {
  const { warmThresh, hotThresh } = getBandThresholds();
  if (m < warmThresh) return 'cold';
  if (m < hotThresh)  return 'warm';
  return 'hot';
}

function bandColor(b) {
  return b === 'cold' ? 'var(--cold)' : b === 'warm' ? 'var(--warm)' : 'var(--hot)';
}

/* =========================================================
   5. WEIGHTED SAMPLING
   ========================================================= */
function weightedPick(pool, excludeId) {
  const cands = (excludeId && pool.length > 1) ? pool.filter(p => p.id !== excludeId) : pool;
  const weights = cands.map(p => 1 / (1 + p.mastery));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i];
    if (r <= 0) return cands[i];
  }
  return cands[cands.length - 1];
}

function weightedSample(pool, n) {
  const copy = [...pool], out = [];
  while (out.length < n && copy.length) {
    const pick = weightedPick(copy, null);
    out.push(pick);
    copy.splice(copy.indexOf(pick), 1);
  }
  return out;
}

/* =========================================================
   6. SPEECH
   ========================================================= */
let voices = [];

function loadVoices() { voices = speechSynthesis.getVoices() || []; }
loadVoices();
if ('speechSynthesis' in window) { speechSynthesis.onvoiceschanged = loadVoices; }

function pickVoice(lang) {
  return voices.find(v => v.lang === lang) ||
         voices.find(v => v.lang && v.lang.startsWith(lang.split('-')[0])) ||
         null;
}

function speak(text, btn) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(state.settings.lang);
  if (v) {
    u.voice = v;
  } else {
    u.lang = state.settings.lang;
  }
  u.rate = 0.9;
  if (btn) {
    u.onstart = () => btn.classList.add('is-speaking');
    u.onend = u.onerror = () => btn.classList.remove('is-speaking');
  }
  speechSynthesis.speak(u);
}

/* =========================================================
   7. HTML ESCAPE
   ========================================================= */
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* =========================================================
   8. TOAST
   ========================================================= */
let toastT = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.remove('out');
  clearTimeout(toastT);
  toastT = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 300);
  }, 2200);
}

/* =========================================================
   9. CONFIRM DIALOG
   ========================================================= */
let confirmCb = null;
function confirmDialog(title, msg, onYes) {
  $('#confirm-title').textContent = title;
  $('#confirm-msg').textContent = msg;
  confirmCb = onYes;
  $('#confirm').hidden = false;
}

$('#confirm-no').onclick = () => { $('#confirm').hidden = true; confirmCb = null; };
$('#confirm .confirm__backdrop').onclick = () => { $('#confirm').hidden = true; confirmCb = null; };
$('#confirm-yes').onclick = () => { $('#confirm').hidden = true; if (confirmCb) confirmCb(); confirmCb = null; };

/* =========================================================
   10. NAVIGATION
   ========================================================= */
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('is-active', v.dataset.view === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.target === name));
  if (name === 'browse' && !currentBrowseId) doShuffle();
  if (name === 'library') renderLibrary();
  if (name === 'progress') renderProgress();
}

$('#tabbar').addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (t) switchView(t.dataset.target);
});

/* =========================================================
   11. BROWSE VIEW
   ========================================================= */
let currentBrowseId = null;

function renderBrowseCard(p) {
  const stage = $('#browse-stage');
  if (!p) {
    stage.innerHTML = `<div class="card card--empty"><p class="card__input">No phrases yet</p><p>Add phrases in Library to begin.</p></div>`;
    $('#btn-shuffle').disabled = true;
    $('#browse-count').textContent = '0';
    return;
  }
  $('#btn-shuffle').disabled = false;
  const b = band(p.mastery), col = bandColor(b);
  stage.innerHTML = `
    <div class="card swap-in" style="--glow:${col}">
      <span class="card__tier">${b} · ${Math.round(p.mastery)}%</span>
      <div class="card__input">${esc(p.input)}</div>
      <div class="card__divider"></div>
      <div class="card__translation">${esc(p.translation)}</div>
      <div class="card__phon-row">
        <button class="btn-play" id="play-btn" aria-label="Play pronunciation">▶</button>
        <div class="card__phon">${esc(p.phonetics) || '—'}</div>
      </div>
      ${p.note ? `<div class="card__note">${esc(p.note)}</div>` : ''}
    </div>`;
  $('#play-btn').onclick = () => speak(p.translation, $('#play-btn'));
  $('#browse-count').textContent = String(state.phrases.length);
}

function doShuffle() {
  if (!state.phrases.length) { renderBrowseCard(null); return; }
  const old = $('#browse-stage .card');
  const pick = weightedPick(state.phrases, currentBrowseId);
  currentBrowseId = pick.id;
  applyMastery(pick.id, CONFIG.DELTA_BROWSE);
  pick.viewCount++;
  save();
  if (old) {
    old.classList.add('swap-out');
    setTimeout(() => renderBrowseCard(pick), 160);
  } else {
    renderBrowseCard(pick);
  }
}

$('#btn-shuffle').onclick = doShuffle;

/* =========================================================
   12. LIBRARY VIEW
   ========================================================= */
let libFilter = '', libSort = 'az', sentSort = 'az';

function applySort(list, sortKey) {
  switch (sortKey) {
    case 'za':       list.sort((a, b) => b.input.localeCompare(a.input)); break;
    case 'coldwarm': list.sort((a, b) => a.mastery - b.mastery); break;
    case 'warmcold': list.sort((a, b) => b.mastery - a.mastery); break;
    case 'pinned':   list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.input.localeCompare(b.input)); break;
    default:         list.sort((a, b) => a.input.localeCompare(b.input));
  }
  return list;
}

function filteredSorted() {
  let list = state.phrases.slice();
  if (libFilter) {
    const q = libFilter;
    list = list.filter(p =>
      p.input.toLowerCase().includes(q) ||
      p.translation.toLowerCase().includes(q) ||
      (p.phonetics && p.phonetics.toLowerCase().includes(q))
    );
  }
  return applySort(list, libSort);
}

let libListMode = 'words';

function renderLibrary() {
  const ul = $('#list');
  const wl = $('#wish-list');
  const sl = $('#sentence-list');
  const swl = $('#sent-wish-list');
  const empty = $('#library-empty');
  const wishEmpty = $('#wish-empty');
  const sentEmpty = $('#sentence-empty');
  const swEmpty = $('#sent-wish-empty');
  const tools = $('.library__tools');
  const libBar = $('.lib-bar');
  const syncBar = $('#wish-sync-bar');
  const sentLearnBar = $('#sent-learn-prompt-bar');
  const sentSortBar = $('#sentence-sort-bar');
  // hide everything first
  [ul, wl, sl, swl, empty, wishEmpty, sentEmpty, swEmpty, syncBar, sentLearnBar, sentSortBar].forEach(el => { el.hidden = true; });
  tools.hidden = false;
  libBar.hidden = false;

  if (libListMode === 'wish') {
    tools.hidden = true;
    libBar.hidden = true;
    wl.hidden = false;
    syncBar.hidden = false;
    const items = state.wishlist;
    wishEmpty.hidden = items.length > 0;
    wl.innerHTML = items.map((w, i) => `
      <li class="list__item wish-item" data-idx="${i}">
        <span class="list__text">
          <span class="list__phrase">${esc(w)}</span>
        </span>
        <button class="wish-del" data-idx="${i}" aria-label="Remove">✕</button>
      </li>`).join('');
    return;
  }

  if (libListMode === 'sentlearn') {
    tools.hidden = true;
    libBar.hidden = true;
    swl.hidden = false;
    $('#sent-learn-prompt-bar').hidden = false;
    const items = state.sentWishlist;
    swEmpty.hidden = items.length > 0;
    swl.innerHTML = items.map((w, i) => `
      <li class="list__item wish-item" data-idx="${i}">
        <span class="list__text">
          <span class="list__phrase">${esc(w)}</span>
        </span>
        <button class="wish-del sent-wish-del" data-idx="${i}" aria-label="Remove">✕</button>
      </li>`).join('');
    return;
  }

  if (libListMode === 'sentences') {
    tools.hidden = true;
    libBar.hidden = true;
    sentSortBar.hidden = false;
    sl.hidden = false;
    const items = applySort(state.sentences.slice(), sentSort);
    sentEmpty.hidden = state.sentences.length > 0;
    sl.innerHTML = items.map(s => {
      const b = band(s.mastery);
      return `<li class="list__item${s.flagged ? ' is-flagged' : ''}" data-id="${s.id}" data-type="sentence">
        <span class="list__bar" style="--tier-color:${s.flagged ? 'var(--hot)' : bandColor(b)}"></span>
        <button class="list__play opt-play" data-phrase="${esc(s.translation)}" aria-label="Play">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        </button>
        <span class="list__text">
          <span class="list__phrase">${esc(s.input)}</span>
          <span class="list__sub">${s.flagged ? '🚩 flagged · ' : ''}${b} · ${Math.round(s.mastery)}%</span>
        </span>
        <button class="list__pin${s.pinned ? ' is-pinned' : ''}" data-id="${s.id}" data-type="sentence" aria-label="${s.pinned ? 'Unpin' : 'Pin'}">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="${s.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </button>
        <span class="list__chev">›</span>
      </li>`;
    }).join('');
    return;
  }

  // words mode
  ul.hidden = false;
  if (!state.phrases.length) {
    empty.hidden = false;
    return;
  }
  const list = filteredSorted();
  empty.hidden = list.length > 0;
  ul.innerHTML = list.map(p => {
    const b = band(p.mastery);
    return `<li class="list__item" data-id="${p.id}">
      <span class="list__bar" style="--tier-color:${bandColor(b)}"></span>
      <button class="list__play opt-play" data-phrase="${esc(p.translation)}" aria-label="Play">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
      </button>
      <span class="list__text">
        <span class="list__phrase">${esc(p.input)}</span>
        <span class="list__sub">${b} · ${Math.round(p.mastery)}%</span>
      </span>
      <button class="list__pin${p.pinned ? ' is-pinned' : ''}" data-id="${p.id}" aria-label="${p.pinned ? 'Unpin' : 'Pin'}">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="${p.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      </button>
      <span class="list__chev">›</span>
    </li>`;
  }).join('');
}

$('#wish-list').addEventListener('click', e => {
  const del = e.target.closest('.wish-del');
  if (del) {
    const idx = +del.dataset.idx;
    state.wishlist.splice(idx, 1);
    save();
    renderLibrary();
  }
});

$('#sent-wish-list').addEventListener('click', e => {
  const del = e.target.closest('.sent-wish-del');
  if (del) {
    const idx = +del.dataset.idx;
    state.sentWishlist.splice(idx, 1);
    save();
    renderLibrary();
  }
});

$('#btn-sent-learn-prompt').onclick = () => {
  const items = state.sentWishlist || [];
  if (!items.length) { toast('No sentences in your Sentence Learn List.'); return; }
  const PROMPT = `You are a Thai language teacher helping a beginner. Translate the following English sentences into Thai. For each sentence provide exactly:

English: [original sentence]
Translation: [Thai script]
Phonetics: [romanized phonetics]
Note: [brief usage note]

Separate entries with a blank line. Do not include any extra text outside the entries.

Sentences to translate:
${items.join('\n')}`;
  openCopyPrompt('Sentence Learn List Prompt', PROMPT);
};

$('#btn-wish-sync').onclick = () => {
  const phraseSet = new Set(state.phrases.map(p => p.input.toLowerCase()));
  const before = state.wishlist.length;
  state.wishlist = state.wishlist.filter(w => !phraseSet.has(w.toLowerCase()));
  const cleared = before - state.wishlist.length;
  save();
  renderLibrary();
  toast(cleared > 0 ? `Cleared ${cleared} word${cleared > 1 ? 's' : ''} already in Word List` : 'Nothing to clear');
};

$('#lib-search').addEventListener('input', e => {
  libFilter = e.target.value.trim().toLowerCase();
  renderLibrary();
});

$('#lib-sort').addEventListener('change', e => {
  libSort = e.target.value;
  renderLibrary();
});

$('#sent-sort').addEventListener('change', e => {
  sentSort = e.target.value;
  renderLibrary();
});

$('#list').addEventListener('click', e => {
  const playBtn = e.target.closest('.list__play');
  if (playBtn) { speak(playBtn.dataset.phrase, playBtn); return; }
  const pinBtn = e.target.closest('.list__pin');
  if (pinBtn) {
    const p = state.phrases.find(x => x.id === pinBtn.dataset.id);
    if (p) { p.pinned = !p.pinned; save(); renderLibrary(); }
    return;
  }
  const li = e.target.closest('.list__item');
  if (li) openEditor(li.dataset.id);
});

$('#sentence-list').addEventListener('click', e => {
  const playBtn = e.target.closest('.list__play');
  if (playBtn) { speak(playBtn.dataset.phrase, playBtn); return; }
  const pinBtn = e.target.closest('.list__pin');
  if (pinBtn) {
    const s = state.sentences.find(x => x.id === pinBtn.dataset.id);
    if (s) { s.pinned = !s.pinned; save(); renderLibrary(); }
    return;
  }
  const li = e.target.closest('.list__item');
  if (li) openEditor(li.dataset.id, 'sentence');
});

/* =========================================================
   13. EDITOR SHEET
   ========================================================= */
let editingId = null;
let editingType = 'phrase';
let editorPasteMode = false;

function openEditor(id, type) {
  editingId = id || null;
  editingType = type || (libListMode === 'sentences' ? 'sentence' : 'phrase');
  editorPasteMode = false;
  const collection = editingType === 'sentence' ? state.sentences : state.phrases;
  const e = id ? collection.find(x => x.id === id) : null;
  $('#editor-title').textContent = id ? `Edit ${editingType}` : `Add ${editingType}`;
  $('#f-input').value = e ? e.input : '';
  $('#f-translation').value = e ? e.translation : '';
  $('#f-phonetics').value = e ? e.phonetics : '';
  $('#f-note').value = e ? (e.note || '') : '';
  $('#btn-delete').hidden = !id;
  // Tabs only visible when adding (not editing)
  $('#editor-tabs').hidden = !!id;
  $('#editor-manual').hidden = false;
  $('#editor-paste').hidden = true;
  $('#tab-manual').classList.add('is-active');
  $('#tab-paste').classList.remove('is-active');
  $('#btn-save').textContent = 'Save';
  $('#editor').hidden = false;
}

function closeEditor() { $('#editor').hidden = true; editingId = null; editingType = 'phrase'; editorPasteMode = false; }

$('#tab-manual').onclick = () => {
  editorPasteMode = false;
  $('#editor-manual').hidden = false;
  $('#editor-paste').hidden = true;
  $('#tab-manual').classList.add('is-active');
  $('#tab-paste').classList.remove('is-active');
  $('#btn-save').textContent = 'Save';
};

$('#tab-paste').onclick = () => {
  editorPasteMode = true;
  $('#editor-manual').hidden = true;
  $('#editor-paste').hidden = false;
  $('#tab-paste').classList.add('is-active');
  $('#tab-manual').classList.remove('is-active');
  $('#f-paste').value = '';
  $('#btn-save').textContent = 'Import';
};

$('#btn-add').onclick = () => openEditor(null, libListMode === 'sentences' ? 'sentence' : 'phrase');
$('#btn-cancel').onclick = closeEditor;
$('#editor .sheet__backdrop').onclick = closeEditor;

$('#btn-save').onclick = () => {
  if (editorPasteMode) {
    const text = $('#f-paste').value.trim();
    if (!text) { toast('Nothing to import.'); return; }
    const { valid, skipped } = parseBlocks(text);
    if (!valid.length) { toast('No valid entries found. Check format.'); return; }
    if (editingType === 'sentence') { bulkAddSentences(valid); } else { bulkAdd(valid); }
    closeEditor();
    renderLibrary();
    toast(`Added ${valid.length}` + (skipped.length ? ` · skipped ${skipped.length}` : ''));
    return;
  }
  const i = $('#f-input').value.trim();
  const t = $('#f-translation').value.trim();
  const p = $('#f-phonetics').value.trim();
  const n = $('#f-note').value.trim();
  if (!i || !t) { toast('Phrase and translation are required.'); return; }
  if (editingType === 'sentence') {
    if (editingId) { updateSentence(editingId, { input: i, translation: t, phonetics: p, note: n }); }
    else { addSentence(i, t, p, n); }
  } else {
    if (editingId) { updatePhrase(editingId, { input: i, translation: t, phonetics: p, note: n }); }
    else { addPhrase(i, t, p, n); }
  }
  const savedId = editingId;
  closeEditor();
  renderLibrary();
  if (editingType !== 'sentence' && currentBrowseId === savedId) {
    renderBrowseCard(state.phrases.find(x => x.id === savedId));
  }
};

$('#btn-delete').onclick = () => {
  const id = editingId;
  const type = editingType;
  confirmDialog(`Delete this ${type}?`, "This can't be undone.", () => {
    if (type === 'sentence') { removeSentence(id); }
    else { removePhrase(id); if (currentBrowseId === id) { currentBrowseId = null; } }
    closeEditor();
    renderLibrary();
    if ($('#view-browse').classList.contains('is-active')) doShuffle();
  });
};

/* =========================================================
   14. TXT IMPORT
   ========================================================= */
$('#file-upload').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const { valid, skipped } = parseBlocks(await file.text());
  if (valid.length) bulkAdd(valid);
  renderLibrary();
  toast(`Added ${valid.length}` + (skipped.length ? ` · skipped ${skipped.length} (bad format)` : ''));
  e.target.value = '';
});

$('#sentence-file-upload').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const { valid, skipped } = parseBlocks(await file.text());
  if (valid.length) bulkAddSentences(valid);
  renderLibrary();
  toast(`Added ${valid.length} sentence${valid.length !== 1 ? 's' : ''}` + (skipped.length ? ` · skipped ${skipped.length}` : ''));
  e.target.value = '';
});


/* =========================================================
   15. SETTINGS SHEET
   ========================================================= */
function openSettings() {
  const sel = $('#set-lang');
  const langs = [...new Set(voices.map(v => v.lang).filter(Boolean))].sort();
  if (!langs.includes(CONFIG.DEFAULT_LANG)) langs.unshift(CONFIG.DEFAULT_LANG);
  sel.innerHTML = langs.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
  sel.value = state.settings.lang;
  $('#lang-note').hidden = !!pickVoice(state.settings.lang);
  $('#set-stat').textContent = `${state.phrases.length} phrases · ${state.sentences.length} sentences`;
  $('#settings').hidden = false;
}

$('#btn-settings').onclick = openSettings;
$('#btn-close-settings').onclick = () => { $('#settings').hidden = true; };
$('#settings .sheet__backdrop').onclick = () => { $('#settings').hidden = true; };

$('#set-lang').onchange = e => {
  state.settings.lang = e.target.value;
  save();
  $('#lang-note').hidden = !!pickVoice(state.settings.lang);
};

/* =========================================================
   16. BACKUP EXPORT / IMPORT
   ========================================================= */
$('#btn-export').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.href = url;
  a.download = `baat-backup-${d}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup downloaded.');
};

$('#btn-export-txt').onclick = () => {
  const txt = state.phrases.map(p =>
    `English: ${p.input}\nTranslation: ${p.translation}\nPhonetics: ${p.phonetics || ''}\nNote: ${p.note || ''}\nMastery: ${Math.round(p.mastery)}`
  ).join('\n\n');
  const blob = new Blob([txt], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.href = url;
  a.download = `baat-phrases-${d}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exported .txt');
};

function openCopyPrompt(title, text) {
  $('#copy-prompt-title').textContent = title;
  $('#copy-prompt-text').value = text;
  $('#copy-prompt').hidden = false;
  setTimeout(() => $('#copy-prompt-text').select(), 50);
}

$('#btn-export-wishlist').onclick = () => {
  const items = (state.wishlist || []);
  const PROMPT = `You are a Thai translation assistant. When given a list of English words or phrases, translate each into Thai and return the results in a single Markdown code block. Format every entry exactly as:
English:
Translation:
Phonetics:
Note:
Use natural, common Thai translations and concise notes. Do not include any extra text outside the code block. Words to translate:

${items.join('\n')}`;
  openCopyPrompt('Wishlist Prompt', PROMPT);
};

$('#copy-prompt-copy').onclick = () => {
  const ta = $('#copy-prompt-text');
  ta.select();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(ta.value).then(() => toast('Copied!'));
  } else {
    document.execCommand('copy');
    toast('Copied!');
  }
};

$('#copy-prompt-close').onclick = () => { $('#copy-prompt').hidden = true; };
$('#copy-prompt-backdrop').onclick = () => { $('#copy-prompt').hidden = true; };

$('#btn-import-trigger').onclick = () => $('#import-file').click();

$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || typeof data !== 'object') throw 0;
    const hasAny = data.phrases || data.sentences || data.wishlist || data.sentWishlist;
    if (!hasAny) throw 0;
    confirmDialog('Import backup?', 'All lists (phrases, sentences, wishlists) will be merged.', () => {
      if (Array.isArray(data.phrases)) {
        const existing = new Set(state.phrases.map(p => p.id));
        data.phrases.forEach(p => { if (!existing.has(p.id)) state.phrases.push(p); });
      }
      if (Array.isArray(data.sentences)) {
        const existingSent = new Set(state.sentences.map(s => s.id));
        data.sentences.forEach(s => { if (!existingSent.has(s.id)) state.sentences.push(s); });
      }
      if (Array.isArray(data.wishlist)) {
        const existingWish = new Set(state.wishlist.map(w => w.toLowerCase()));
        data.wishlist.forEach(w => { if (!existingWish.has(w.toLowerCase())) state.wishlist.push(w); });
      }
      if (Array.isArray(data.sentWishlist)) {
        const existingSW = new Set(state.sentWishlist.map(w => w.toLowerCase()));
        data.sentWishlist.forEach(w => { if (!existingSW.has(w.toLowerCase())) state.sentWishlist.push(w); });
      }
      if (data.settings?.lang) state.settings.lang = data.settings.lang;
      save();
      renderLibrary();
      toast('Backup imported.');
    });
  } catch (err) {
    toast("That file isn't a valid Baat backup.");
  }
  e.target.value = '';
});

/* =========================================================
   17. PRACTICE HUB
   ========================================================= */
$('#practice-hub').addEventListener('click', e => {
  const t = e.target.closest('.tile');
  if (!t) return;
  const game = t.dataset.game;
  if (game === 'sentpractice') { startGame(game); return; }
  if (state.phrases.length < CONFIG.GAME_MIN_PHRASES) {
    toast(`Add at least ${CONFIG.GAME_MIN_PHRASES} phrases to play.`);
    return;
  }
  startGame(game);
});

/* =========================================================
   18. GAMES
   ========================================================= */
let gameSession = null;

function closeGame() {
  speechSynthesis.cancel();
  $('#game').hidden = true;
  $('#game').innerHTML = '';
  gameSession = null;
}

function renderMaster10Preview() {
  const gs = gameSession;
  const gameEl = $('#game');

  if (gs.index >= gs.entries.length) {
    gs.phase = 'games';
    gs.index = 0;
    const firstType = gs.gameTypes[0];
    gameEl.innerHTML = `
      <div class="game__bar">
        <button class="game__close" id="game-close-mid" aria-label="Close">✕</button>
        <span class="game__score"></span>
      </div>
      <div class="game__body">
        <div class="game-transition">
          <div class="game-transition__badge">Game 1 of ${gs.gameTypes.length}</div>
          <h2>Ready to play!</h2>
          <p class="game-transition__name">${gameTitle(firstType)}</p>
          <p>${gameDesc(firstType)}</p>
          <button class="btn btn--primary" id="transition-go" style="width:100%;max-width:280px">Let's go →</button>
        </div>
      </div>`;
    $('#game-close-mid').onclick = () => confirmDialog('End session?', 'Your progress so far is saved.', closeGame);
    $('#transition-go').onclick = () => renderGame();
    return;
  }

  const entry = gs.entries[gs.index];
  const total = gs.entries.length;
  const current = gs.index + 1;

  gameEl.innerHTML = `
    <div class="game__bar">
      <button class="game__close" id="game-close-preview" aria-label="Close">✕</button>
      <span class="game__score">${current} / ${total}</span>
    </div>
    <div class="game__body m10-preview-body">
      <div class="m10-preview-card">
        <div class="m10-preview__label">Review</div>
        <div class="m10-preview__phrase">${esc(entry.input)}</div>
        <div class="m10-preview__translation">${esc(entry.translation)}</div>
        <div class="m10-preview__phon">${esc(entry.phonetics)}</div>
        ${entry.note ? `<div class="m10-preview__note">${esc(entry.note)}</div>` : ''}
        <button class="btn-play m10-preview__play" id="preview-play" aria-label="Play">▶</button>
      </div>
      <button class="btn btn--primary m10-preview__next" id="preview-next">
        ${current < total ? 'Next →' : 'Start Games →'}
      </button>
    </div>`;

  $('#game-close-preview').onclick = () => confirmDialog('Exit Master 10?', '', closeGame);
  const playBtn = $('#preview-play');
  playBtn.onclick = () => speak(entry.translation, playBtn);
  speak(entry.translation, playBtn);
  $('#preview-next').onclick = () => { gs.index++; renderGame(); };
}

function startMaster10() {
  const gameEl = $('#game');
  gameEl.hidden = false;
  const selected = new Set();
  const allPhrases = state.phrases.slice();
  let m10Sort = 'pinned';

  function sortedPhrases() {
    return applySort(allPhrases.slice(), m10Sort);
  }

  gameEl.innerHTML = `
    <div class="game__bar">
      <button class="game__close" id="game-close-setup" aria-label="Close">✕</button>
      <span class="game__score" id="m10-count">0 selected</span>
    </div>
    <div class="game__body m10-body">
      <h2 class="m10-heading">Master 10</h2>
      <p class="m10-sub-heading">Pick phrases to master, or go random.</p>
      <div class="m10-sort-bar">
        <select id="m10-sort">
          <option value="pinned">Saved First</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="coldwarm">Cold → Hot</option>
          <option value="warmcold">Hot → Cold</option>
        </select>
      </div>
      <button class="btn btn--ghost m10-random-btn" id="m10-random">🎲 Pick ${Math.min(10, allPhrases.length)} randomly</button>
      <div class="m10-list" id="m10-list"></div>
      <button class="btn btn--primary" id="m10-start" disabled>Start</button>
    </div>`;

  function renderList() {
    const phrases = sortedPhrases();
    $('#m10-list').innerHTML = phrases.map(p => {
      const b = band(p.mastery);
      const on = selected.has(p.id);
      return `<div class="m10-item${on ? ' is-selected' : ''}" data-id="${p.id}">
        <span class="m10-check">${on ? '✓' : ''}</span>
        <span class="m10-text">
          <span class="m10-phrase">${esc(p.input)}${p.pinned ? ' <span class="m10-pin-dot">📍</span>' : ''}</span>
          <span class="m10-tier">${b} · ${Math.round(p.mastery)}%</span>
        </span>
      </div>`;
    }).join('');
  }
  renderList();

  function updateUI() {
    $('#m10-count').textContent = `${selected.size} selected`;
    const btn = $('#m10-start');
    btn.textContent = selected.size >= CONFIG.GAME_MIN_PHRASES ? `Start with ${selected.size}` : `Select at least ${CONFIG.GAME_MIN_PHRASES}`;
    btn.disabled = selected.size < CONFIG.GAME_MIN_PHRASES;
  }

  $('#game-close-setup').onclick = closeGame;

  $('#m10-sort').addEventListener('change', e => {
    m10Sort = e.target.value;
    renderList();
  });

  $('#m10-random').onclick = () => {
    selected.clear();
    const cold = allPhrases.filter(p => band(p.mastery) === 'cold').sort((a, b) => a.mastery - b.mastery);
    const warm = shuffle(allPhrases.filter(p => band(p.mastery) === 'warm'));
    const hot  = shuffle(allPhrases.filter(p => band(p.mastery) === 'hot'));
    const pick = (pool, n) => pool.slice(0, n);
    const picks = [];
    const hotPicks  = pick(hot,  1);
    const warmPicks = pick(warm, 4);
    const coldPicks = pick(cold, 5 + (1 - hotPicks.length) + (4 - warmPicks.length));
    picks.push(...hotPicks, ...warmPicks, ...coldPicks);
    if (picks.length < Math.min(10, allPhrases.length)) {
      const used = new Set(picks.map(p => p.id));
      allPhrases.filter(p => !used.has(p.id)).slice(0, Math.min(10, allPhrases.length) - picks.length).forEach(p => picks.push(p));
    }
    picks.forEach(p => selected.add(p.id));
    renderList();
    updateUI();
  };

  $('#m10-list').addEventListener('click', e => {
    const item = e.target.closest('.m10-item');
    if (!item) return;
    const id = item.dataset.id;
    if (selected.has(id)) { selected.delete(id); item.classList.remove('is-selected'); item.querySelector('.m10-check').textContent = ''; }
    else { selected.add(id); item.classList.add('is-selected'); item.querySelector('.m10-check').textContent = '✓'; }
    updateUI();
  });

  $('#m10-start').onclick = () => {
    const entries = allPhrases.filter(p => selected.has(p.id));
    gameSession = { type: 'master10', entries, index: 0, score: 0, answered: 0, gameTypes: ['match', 'choice', 'listen', 'listenfill', 'flip'], gameTypeIndex: 0, phase: 'preview' };
    renderGame();
  };
}

function startGame(type) {
  if (type === 'master10') { startMaster10(); return; }
  if (type === 'sentbuild') { startSentenceBuilder(); return; }
  if (type === 'sentpractice') { startSentencePractice(); return; }
  const maxBatch = state.phrases.length;
  const defaultBatch = Math.min(10, maxBatch);

  let batchSize = defaultBatch;

  const gameEl = $('#game');
  gameEl.hidden = false;

  // Setup screen
  gameEl.innerHTML = `
    <div class="game__bar">
      <button class="game__close" id="game-close-setup" aria-label="Close">✕</button>
      <span class="game__score"></span>
    </div>
    <div class="game__body">
      <div class="game-setup">
        <h2>${gameTitle(type)}</h2>
        <p>${gameDesc(type)}</p>
        <div class="batch-picker">
          <button id="batch-dec" aria-label="Decrease">−</button>
          <span class="batch-num" id="batch-num">${batchSize}</span>
          <button id="batch-inc" aria-label="Increase">+</button>
        </div>
        <button class="btn btn--primary" id="game-start" style="width:100%;max-width:280px">Start</button>
      </div>
    </div>`;

  $('#game-close-setup').onclick = closeGame;

  const batchNumEl = $('#batch-num');
  $('#batch-dec').onclick = () => {
    if (batchSize > CONFIG.GAME_MIN_PHRASES) { batchSize--; batchNumEl.textContent = batchSize; }
  };
  $('#batch-inc').onclick = () => {
    if (batchSize < maxBatch) { batchSize++; batchNumEl.textContent = batchSize; }
  };

  $('#game-start').onclick = () => {
    const entries = weightedSample(state.phrases, batchSize);
    gameSession = { type, entries, index: 0, score: 0, answered: 0 };
    renderGame();
  };
}

function gameTitle(type) {
  return { match: 'Match-up', choice: 'Multiple Choice', listen: 'Listen & Choose', flip: 'Flashcards', listenfill: 'Listen & Fill', master10: 'Master 10', sentbuild: 'Sentence Builder', sentpractice: 'Sentence Practice' }[type] || type;
}

function gameDesc(type) {
  return {
    match: 'Pair each phrase to its pronunciation.',
    choice: 'Pick the correct phonetic spelling.',
    listen: 'Hear the phrase and identify it.',
    flip: 'Flip the card and rate yourself.',
    listenfill: 'Hear the phrase and type it out.',
    master10: 'Choose your phrases, then play all 5 games.',
    sentbuild: 'Scroll the phonetics wheel, pick one, then reveal its meaning.',
    sentpractice: 'See an English sentence, build it in phonetics using the wheel, then reveal.',
  }[type] || '';
}

function renderGame() {
  const gs = gameSession;
  const gameEl = $('#game');

  // Master Mode: route to sub-games and handle transitions
  if (gs.type === 'master10') {
    if (gs.phase === 'preview') { renderMaster10Preview(); return; }
    if (gs.index >= gs.entries.length) {
      if (gs.gameTypeIndex >= gs.gameTypes.length - 1) { showResult(); return; }
      gs.gameTypeIndex++;
      gs.index = 0;
      const nextType = gs.gameTypes[gs.gameTypeIndex];
      gameEl.innerHTML = `
        <div class="game__bar">
          <button class="game__close" id="game-close-mid" aria-label="Close">✕</button>
          <span class="game__score" id="game-score">✓ ${gs.score}/${gs.answered}</span>
        </div>
        <div class="game__body">
          <div class="game-transition">
            <div class="game-transition__badge">Game ${gs.gameTypeIndex + 1} of ${gs.gameTypes.length}</div>
            <h2>Up next</h2>
            <p class="game-transition__name">${gameTitle(nextType)}</p>
            <p>${gameDesc(nextType)}</p>
            <button class="btn btn--primary" id="transition-go" style="width:100%;max-width:280px">Let's go →</button>
          </div>
        </div>`;
      $('#game-close-mid').onclick = () => confirmDialog('End session?', 'Your progress so far is saved.', closeGame);
      $('#transition-go').onclick = () => renderGame();
      return;
    }
    const subType = gs.gameTypes[gs.gameTypeIndex];
    const entry = gs.entries[gs.index];
    gameEl.innerHTML = `
      <div class="game__bar">
        <button class="game__close" id="game-close-mid" aria-label="Close">✕</button>
        <span class="game__score" id="game-score">✓ ${gs.score}/${gs.answered} · ${gameTitle(subType)}</span>
      </div>
      <div class="game__body" id="game-body"></div>`;
    $('#game-close-mid').onclick = () => confirmDialog('End session?', 'Your progress so far is saved.', closeGame);
    const body = $('#game-body');
    if (subType === 'choice') renderChoice(body, entry);
    else if (subType === 'listen') renderListen(body, entry);
    else if (subType === 'match') renderMatch(body);
    else if (subType === 'flip') renderFlip(body, entry);
    else if (subType === 'listenfill') renderListenFill(body, entry);
    return;
  }

  if (gs.index >= gs.entries.length) { showResult(); return; }

  const entry = gs.entries[gs.index];

  gameEl.innerHTML = `
    <div class="game__bar">
      <button class="game__close" id="game-close-mid" aria-label="Close">✕</button>
      <span class="game__score" id="game-score">✓ ${gs.score}/${gs.answered}</span>
    </div>
    <div class="game__body" id="game-body"></div>`;

  $('#game-close-mid').onclick = () => {
    if (gs.answered > 0) {
      confirmDialog('End session?', 'Your progress so far is saved.', closeGame);
    } else {
      closeGame();
    }
  };

  const body = $('#game-body');
  if (gs.type === 'choice') renderChoice(body, entry);
  else if (gs.type === 'listen') renderListen(body, entry);
  else if (gs.type === 'match') renderMatch(body);
  else if (gs.type === 'flip') renderFlip(body, entry);
  else if (gs.type === 'listenfill') renderListenFill(body, entry);
}

function updateScore() {
  const el = $('#game-score');
  if (el) el.textContent = `✓ ${gameSession.score}/${gameSession.answered}`;
}

function advanceGame() {
  gameSession.index++;
  setTimeout(() => renderGame(), CONFIG.ADVANCE_MS);
}

/* --- GAME A: Multiple Choice --- */
function renderChoice(body, entry) {
  const distractors = getDistractorPhrases(entry, CONFIG.MC_OPTIONS - 1);
  const allOpts = shuffle([
    { phonetics: entry.phonetics, translation: entry.translation },
    ...distractors.map(p => ({ phonetics: p.phonetics, translation: p.translation })),
  ]);

  body.innerHTML = `
    <div class="game__prompt-label">Translate</div>
    <div class="game__prompt">${esc(entry.input)}</div>
    <div class="options" id="options"></div>`;

  const optEl = $('#options');
  allOpts.forEach(opt => {
    const row = document.createElement('div');
    row.className = 'option-row';

    const playBtn = document.createElement('button');
    playBtn.className = 'opt-play';
    playBtn.setAttribute('aria-label', 'Play pronunciation');
    playBtn.textContent = '▶';
    playBtn.onclick = e => { e.stopPropagation(); speak(opt.translation, playBtn); };

    const optBtn = document.createElement('button');
    optBtn.className = 'option';
    optBtn.textContent = opt.phonetics;
    optBtn.onclick = () => handleChoice(optBtn, opt.phonetics, entry, optEl);

    row.appendChild(playBtn);
    row.appendChild(optBtn);
    optEl.appendChild(row);
  });
}

function handleChoice(btn, chosen, entry, container) {
  const correct = chosen === entry.phonetics;
  container.querySelectorAll('.option').forEach(b => {
    b.disabled = true;
    if (b.textContent === entry.phonetics) b.classList.add('correct');
    else if (b === btn && !correct) b.classList.add('wrong');
  });
  applyMastery(entry.id, correct ? CONFIG.DELTA_CORRECT : CONFIG.DELTA_WRONG);
  entry.gamesSeen++;
  if (correct) { entry.gamesCorrect++; gameSession.score++; }
  gameSession.answered++;
  save();
  updateScore();
  advanceGame();
}

/* --- GAME B: Listen & Choose --- */
function renderListen(body, entry) {
  const distractors = getDistractorPhrases(entry, CONFIG.MC_OPTIONS - 1);
  const allOpts = shuffle([
    { input: entry.input, translation: entry.translation },
    ...distractors.map(p => ({ input: p.input, translation: p.translation })),
  ]);

  body.innerHTML = `
    <div class="game__prompt-label">Which phrase did you hear?</div>
    <div class="listen-replay">
      <button class="btn-play" id="listen-play" aria-label="Play">▶</button>
      <span class="listen-phon">${esc(entry.phonetics)}</span>
    </div>
    <div class="options" id="options"></div>`;

  const playBtn = $('#listen-play');
  playBtn.onclick = () => speak(entry.translation, playBtn);
  speak(entry.translation, playBtn);

  const optEl = $('#options');
  allOpts.forEach(opt => {
    const optBtn = document.createElement('button');
    optBtn.className = 'option';
    optBtn.textContent = opt.input;
    optBtn.dataset.input = opt.input;
    optBtn.onclick = () => handleListen(optBtn, opt.input, entry, optEl);
    optEl.appendChild(optBtn);
  });
}

function handleListen(btn, chosen, entry, container) {
  const correct = chosen === entry.input;
  container.querySelectorAll('.option').forEach(b => {
    b.disabled = true;
    if (b.dataset.input === entry.input) b.classList.add('correct');
    else if (b === btn && !correct) b.classList.add('wrong');
  });
  applyMastery(entry.id, correct ? CONFIG.DELTA_CORRECT : CONFIG.DELTA_WRONG);
  entry.gamesSeen++;
  if (correct) { entry.gamesCorrect++; gameSession.score++; }
  gameSession.answered++;
  save();
  updateScore();
  advanceGame();
}

/* --- GAME C: Match-up --- */
function renderMatch(body) {
  const gs = gameSession;
  const remaining = gs.entries.length - gs.index;
  const chunkSize = Math.min(CONFIG.MATCH_PAIRS, remaining);
  const chunk = gs.entries.slice(gs.index, gs.index + chunkSize);

  const rightItems = shuffle(chunk.map(e => ({ id: e.id, text: e.phonetics })));

  body.innerHTML = `
    <div class="match-round-header">Match phrase to pronunciation</div>
    <div class="match">
      <div class="match-col" id="match-left">
        ${chunk.map(e => `
          <button class="chip" data-id="${e.id}" data-col="left">${esc(e.input)}</button>`).join('')}
      </div>
      <div class="match-col" id="match-right">
        ${rightItems.map(r => `
          <div class="chip-row">
            <button class="opt-play" data-id="${r.id}" aria-label="Play">▶</button>
            <button class="chip" data-id="${r.id}" data-col="right">${esc(r.text)}</button>
          </div>`).join('')}
      </div>
    </div>`;

  let selLeft = null, selRight = null;
  const matched = new Set();

  function checkMatch() {
    if (!selLeft || !selRight) return;
    const leftId = selLeft.dataset.id;
    const rightId = selRight.dataset.id;
    const entry = chunk.find(e => e.id === leftId);

    if (leftId === rightId) {
      selLeft.classList.remove('sel');
      selRight.classList.remove('sel');
      selLeft.classList.add('done');
      selRight.classList.add('done');
      // also mark the sibling chip-row as done so play btn fades
      selLeft.closest('.chip-row')?.classList.add('done');
      selRight.closest('.chip-row')?.classList.add('done');
      matched.add(leftId);
      applyMastery(leftId, CONFIG.DELTA_CORRECT);
      entry.gamesCorrect++;
      entry.gamesSeen++;
      gameSession.score++;
      gameSession.answered++;
      save();
      updateScore();
      selLeft = null; selRight = null;

      if (matched.size === chunk.length) {
        gs.index += chunkSize;
        setTimeout(() => renderGame(), 400);
      }
    } else {
      const sl = selLeft, sr = selRight;
      sl.classList.add('flash-wrong');
      sr.classList.add('flash-wrong');
      applyMastery(leftId, CONFIG.DELTA_WRONG);
      entry.gamesSeen++;
      gameSession.answered++;
      save();
      updateScore();
      setTimeout(() => {
        sl.classList.remove('flash-wrong', 'sel');
        sr.classList.remove('flash-wrong', 'sel');
      }, 400);
      selLeft = null; selRight = null;
    }
  }

  body.addEventListener('click', e => {
    // Play button — look up phrase and speak, don't trigger chip selection
    const playBtn = e.target.closest('.opt-play[data-id]');
    if (playBtn) {
      const ph = state.phrases.find(x => x.id === playBtn.dataset.id);
      if (ph) speak(ph.translation, playBtn);
      return;
    }

    const chip = e.target.closest('.chip');
    if (!chip || chip.classList.contains('done')) return;
    const col = chip.dataset.col;

    if (col === 'left') {
      if (selLeft) selLeft.classList.remove('sel');
      selLeft = chip;
      chip.classList.add('sel');
    } else {
      if (selRight) selRight.classList.remove('sel');
      selRight = chip;
      chip.classList.add('sel');
    }
    checkMatch();
  });
}

/* --- GAME D: Flashcards --- */
function renderFlip(body, entry) {
  body.innerHTML = `
    <div class="flash">
      <div class="flash__card" id="flash-card">
        <div class="flash__face flash__face--front">
          <div class="flash__hint">Tap to flip</div>
          <div class="flash__word">${esc(entry.input)}</div>
          <div class="card__phon-row" style="margin-top:20px">
            <button class="btn-play" id="flash-play" aria-label="Play">▶</button>
            <div class="card__phon" style="font-size:14px;color:var(--text-3)">Play translation</div>
          </div>
        </div>
        <div class="flash__face flash__face--back">
          <div class="flash__hint">How did you do?</div>
          <div class="flash__translation">${esc(entry.translation)}</div>
          <div class="flash__phon">${esc(entry.phonetics)}</div>
          ${entry.note ? `<div class="card__note" style="margin-top:14px">${esc(entry.note)}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="rate-row" id="rate-row" style="display:none">
      <button class="rate-btn rate-btn--no" id="rate-no">✗ Didn't</button>
      <button class="rate-btn rate-btn--yes" id="rate-yes">✓ Knew it</button>
    </div>`;

  const card = $('#flash-card');
  const rateRow = $('#rate-row');
  let flipped = false;

  $('#flash-play').onclick = e => {
    e.stopPropagation();
    speak(entry.translation, $('#flash-play'));
  };

  card.onclick = () => {
    flipped = !flipped;
    card.classList.toggle('flipped', flipped);
    rateRow.style.display = flipped ? 'flex' : 'none';
  };

  $('#rate-no').onclick = () => {
    applyMastery(entry.id, CONFIG.DELTA_WRONG);
    entry.gamesSeen++;
    gameSession.answered++;
    save();
    updateScore();
    gameSession.index++;
    renderGame();
  };

  $('#rate-yes').onclick = () => {
    applyMastery(entry.id, CONFIG.DELTA_CORRECT);
    entry.gamesSeen++;
    entry.gamesCorrect++;
    gameSession.score++;
    gameSession.answered++;
    save();
    updateScore();
    gameSession.index++;
    renderGame();
  };
}

/* --- GAME E: Listen & Fill --- */
function renderListenFill(body, entry) {
  body.innerHTML = `
    <div class="game__prompt-label">Type the phrase you hear</div>
    <div class="listen-replay">
      <button class="btn-play" id="listenfill-play" aria-label="Play">▶</button>
      <span class="listen-phon">${esc(entry.phonetics)}</span>
    </div>
    <div class="listenfill-wrap">
      <textarea id="listenfill-input" class="listenfill-input" placeholder="Type here…" autocomplete="off" autocorrect="off" spellcheck="false" rows="2"></textarea>
      <button class="listenfill-submit" id="listenfill-submit">Check</button>
      <div id="listenfill-feedback" class="listenfill-feedback" hidden></div>
    </div>`;

  const playBtn = $('#listenfill-play');
  playBtn.onclick = () => speak(entry.translation, playBtn);
  speak(entry.translation, playBtn);

  function check() {
    const val = $('#listenfill-input').value.trim().toLowerCase();
    if (!val) return;
    const correct = val === entry.input.trim().toLowerCase();
    const fb = $('#listenfill-feedback');
    fb.hidden = false;
    fb.textContent = correct ? '✓ Correct!' : `✗ Answer: ${entry.input}`;
    fb.className = `listenfill-feedback ${correct ? 'listenfill-feedback--correct' : 'listenfill-feedback--wrong'}`;
    $('#listenfill-input').disabled = true;
    $('#listenfill-submit').disabled = true;
    applyMastery(entry.id, correct ? CONFIG.DELTA_CORRECT : CONFIG.DELTA_WRONG);
    entry.gamesSeen++;
    if (correct) { entry.gamesCorrect++; gameSession.score++; }
    gameSession.answered++;
    save();
    updateScore();
    advanceGame();
  }

  $('#listenfill-submit').onclick = check;
  $('#listenfill-input').addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
  setTimeout(() => $('#listenfill-input').focus(), 100);
}

/* --- RESULT SCREEN --- */
function showResult() {
  const gs = gameSession;
  const pct = gs.answered > 0 ? gs.score / gs.answered : 0;
  const emoji = pct >= 0.8 ? '🎉' : pct >= 0.5 ? '👍' : '💪';

  $('#game').innerHTML = `
    <div class="game__bar">
      <button class="game__close" style="visibility:hidden">✕</button>
    </div>
    <div class="game__body">
      <div class="game-result">
        <div class="game-result__emoji">${emoji}</div>
        <h2>Session complete!</h2>
        <p>${gs.score} / ${gs.answered} correct</p>
        <button class="btn btn--primary" id="result-done" style="width:100%;max-width:280px">Done</button>
      </div>
    </div>`;

  $('#result-done').onclick = () => { closeGame(); switchView('practice'); };
}

/* =========================================================
   19. PROGRESS VIEW
   ========================================================= */
function buildProgressChart(items, label, warmThresh, hotThresh) {
  const total = items.length;
  const nCold = items.filter(p => p.mastery < warmThresh).length;
  const nWarm = items.filter(p => p.mastery >= warmThresh && p.mastery < hotThresh).length;
  const nHot  = items.filter(p => p.mastery >= hotThresh).length;
  const avgMastery = items.reduce((s, p) => s + p.mastery, 0) / total;
  const overallPct = Math.round(avgMastery);

  const R = 80, SW = 26, CX = 100, CY = 100;
  const C = 2 * Math.PI * R;
  const GAP = total > 1 ? 3 : 0;

  function seg(count, color, cumOffset) {
    if (count === 0) return '';
    const arc = Math.max(0, (count / total) * C - GAP);
    return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
      stroke="${color}" stroke-width="${SW}"
      stroke-dasharray="${arc} ${C}"
      stroke-dashoffset="${-cumOffset}"
      transform="rotate(-90 ${CX} ${CY})"/>`;
  }

  const coldArc = (nCold / total) * C;
  const warmArc = (nWarm / total) * C;

  return `
    <div class="prog-section">
      <h3 class="prog-section-title">${label}</h3>
      <div class="prog-chart-wrap">
        <svg class="prog-donut" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--hair)" stroke-width="${SW}"/>
          ${seg(nCold, 'var(--cold)', 0)}
          ${seg(nWarm, 'var(--warm)', coldArc)}
          ${seg(nHot,  'var(--hot)',  coldArc + warmArc)}
          <text x="${CX}" y="${CY - 10}" class="prog-center-pct" text-anchor="middle" dominant-baseline="middle">${overallPct}%</text>
          <text x="${CX}" y="${CY + 16}" class="prog-center-label" text-anchor="middle" dominant-baseline="middle">mastery</text>
        </svg>
      </div>
      <div class="prog-legend">
        <div class="prog-legend-item">
          <span class="prog-legend-dot" style="background:var(--cold)"></span>
          <div class="prog-legend-text">
            <span class="prog-legend-name">Cold</span>
            <span class="prog-legend-count">${nCold} <span class="prog-legend-pct">${Math.round(nCold/total*100)}%</span></span>
          </div>
        </div>
        <div class="prog-legend-item">
          <span class="prog-legend-dot" style="background:var(--warm)"></span>
          <div class="prog-legend-text">
            <span class="prog-legend-name">Warm</span>
            <span class="prog-legend-count">${nWarm} <span class="prog-legend-pct">${Math.round(nWarm/total*100)}%</span></span>
          </div>
        </div>
        <div class="prog-legend-item">
          <span class="prog-legend-dot" style="background:var(--hot)"></span>
          <div class="prog-legend-text">
            <span class="prog-legend-name">Hot</span>
            <span class="prog-legend-count">${nHot} <span class="prog-legend-pct">${Math.round(nHot/total*100)}%</span></span>
          </div>
        </div>
      </div>
      <p class="prog-summary">${total} ${label.toLowerCase()} · ${nHot} mastered · ${nCold} to learn</p>
      <p class="prog-thresholds">Warm ≥ ${warmThresh} · Hot ≥ ${hotThresh}</p>
    </div>`;
}

function renderProgress() {
  const el = $('#progress-view');
  const totalPhrases = state.phrases.length;
  const totalSentences = state.sentences.length;

  if (!totalPhrases && !totalSentences) {
    el.innerHTML = `<div class="prog-empty"><p>No phrases or sentences yet.<br>Add some in the Library.</p></div>`;
    return;
  }

  const { warmThresh, hotThresh } = getBandThresholds();

  let html = '';
  if (totalPhrases) {
    html += buildProgressChart(state.phrases, 'Phrases', warmThresh, hotThresh);
  }
  if (totalSentences) {
    html += buildProgressChart(state.sentences, 'Sentences', 4, 10);
  }
  el.innerHTML = html;
}

/* =========================================================
   20. HELPERS
   ========================================================= */
function getDistractorPhrases(entry, count) {
  let pool = state.phrases.filter(p => p.id !== entry.id && p.phonetics && p.phonetics !== entry.phonetics);
  const picked = [];
  const copy = [...pool];
  while (picked.length < count && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    picked.push(copy[i]);
    copy.splice(i, 1);
  }
  if (picked.length < count) {
    const all = state.phrases.filter(p => p.id !== entry.id);
    while (picked.length < count && all.length) {
      const i = Math.floor(Math.random() * all.length);
      if (!picked.find(x => x.id === all[i].id)) picked.push(all[i]);
      all.splice(i, 1);
    }
  }
  return picked;
}

function getDistractors(entry, field, count) {
  const pool = state.phrases.filter(p => p.id !== entry.id && p[field] && p[field] !== entry[field]);
  const picked = [];
  const copy = [...pool];
  while (picked.length < count && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    picked.push(copy[i][field]);
    copy.splice(i, 1);
  }
  // If still short, relax uniqueness and pull from full pool
  if (picked.length < count) {
    const all = state.phrases.filter(p => p.id !== entry.id);
    while (picked.length < count && all.length) {
      const i = Math.floor(Math.random() * all.length);
      const val = all[i][field];
      if (!picked.includes(val)) picked.push(val);
      all.splice(i, 1);
    }
  }
  return picked;
}

/* =========================================================
   19b. SENTENCE BUILDER
   ========================================================= */
function startSentenceBuilder() {
  const gameEl = $('#game');
  gameEl.hidden = false;

  const phrases = state.phrases
    .filter(p => p.phonetics)
    .slice()
    .sort((a, b) => a.phonetics.localeCompare(b.phonetics));

  if (!phrases.length) {
    gameEl.hidden = true;
    toast('No phrases with phonetics found.');
    return;
  }

  // Slot machine constants
  const ITEM_H = 52;   // height of each row
  const PAD    = 104;  // = 2 × ITEM_H, so first/last item can center

  let score = { right: 0, wrong: 0 };
  let droppedPhrases = [];  // all phrases tapped from wheel this round
  let judged = false;

  gameEl.innerHTML = `
    <div class="game__bar">
      <button class="game__close" id="sb-close" aria-label="Close">✕</button>
      <span class="game__score" id="sb-score">Right: 0 · Wrong: 0</span>
    </div>
    <div class="sb-body">
      <div class="sb-build" id="sb-build">
        <div class="sb-wheel-wrap">
          <div class="sb-wheel" id="sb-wheel">
            <div style="height:${PAD}px;flex-shrink:0"></div>
            ${phrases.map(p => `<div class="sb-wheel-item" data-id="${p.id}">${esc(p.phonetics)}</div>`).join('')}
            <div style="height:${PAD}px;flex-shrink:0"></div>
          </div>
          <div class="sb-wheel-selector"></div>
        </div>
        <textarea class="sb-textbox" id="sb-textbox" placeholder="Tap a word on the wheel…" rows="2" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"></textarea>
        <button class="btn sb-reveal-btn" id="sb-reveal-btn">Reveal</button>
      </div>

      <div class="sb-result" id="sb-result" hidden>
        <div class="sb-result-field">
          <span class="sb-result-label">Phonetics</span>
          <div class="sb-result-val" id="sb-r-phonetic"></div>
        </div>
        <div class="sb-result-field">
          <span class="sb-result-label">English</span>
          <div class="sb-result-val" id="sb-r-english"></div>
        </div>
        <div class="sb-result-field">
          <span class="sb-result-label">Translation</span>
          <div class="sb-result-val sb-result-val--xl" id="sb-r-translation"></div>
        </div>
        <p class="sb-apple-hint">Select all and translate using Apple to check</p>
        <div class="sb-judge-row">
          <button class="btn sb-right-btn" id="sb-right">I'm Right</button>
          <button class="btn sb-wrong-btn" id="sb-wrong">I'm Wrong</button>
        </div>
        <button class="btn sb-next-btn" id="sb-next" disabled>Next</button>
      </div>
    </div>`;

  const wheel = $('#sb-wheel');

  // Index-based scroll: item[i] centers at scrollTop = i × ITEM_H
  function scrollToIdx(i, smooth) {
    wheel.scrollTo({ top: i * ITEM_H, behavior: smooth ? 'smooth' : 'instant' });
  }

  function centerIdx() {
    return Math.round(wheel.scrollTop / ITEM_H);
  }

  function updateHighlight() {
    const ci = centerIdx();
    wheel.querySelectorAll('.sb-wheel-item').forEach((el, i) => {
      el.classList.toggle('is-center', i === ci);
    });
  }

  wheel.addEventListener('scroll', updateHighlight, { passive: true });
  // Start at first item
  scrollToIdx(0, false);
  requestAnimationFrame(updateHighlight);

  wheel.addEventListener('click', e => {
    const item = e.target.closest('.sb-wheel-item');
    if (!item) return;
    const items = Array.from(wheel.querySelectorAll('.sb-wheel-item'));
    const idx = items.indexOf(item);
    scrollToIdx(idx, true);
    items.forEach((el, i) => el.classList.toggle('is-center', i === idx));
    const tapped = phrases.find(p => p.id === item.dataset.id);
    if (tapped) droppedPhrases.push(tapped);

    // Insert at cursor, or append if cursor isn't in the box
    const tb = $('#sb-textbox');
    const word = item.textContent.trim();
    const start = (document.activeElement === tb) ? tb.selectionStart : tb.value.length;
    const end   = (document.activeElement === tb) ? tb.selectionEnd   : tb.value.length;
    const before = tb.value.slice(0, start);
    const after  = tb.value.slice(end);
    const gap = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
    tb.value = before + gap + word + after;
    const cursor = start + gap.length + word.length;
    tb.focus();
    tb.setSelectionRange(cursor, cursor);
  });

  $('#sb-close').onclick = closeGame;

  $('#sb-reveal-btn').onclick = () => {
    const phonetic = $('#sb-textbox').value.trim();
    if (!phonetic) { toast('Tap a word on the wheel first'); return; }

    judged = false;

    $('#sb-r-phonetic').textContent = phonetic;
    if (droppedPhrases.length) {
      $('#sb-r-english').textContent      = droppedPhrases.map(p => p.input).join('\n');
      $('#sb-r-translation').textContent  = droppedPhrases.map(p => p.translation).join('\n');
    } else {
      // manual text — try single phrase match
      const match = phrases.find(p => p.phonetics.toLowerCase() === phonetic.toLowerCase());
      $('#sb-r-english').textContent      = match ? match.input       : '—';
      $('#sb-r-translation').textContent  = match ? match.translation : '—';
    }
    $('#sb-next').disabled = true;
    $('#sb-right').classList.remove('sb-judged--right');
    $('#sb-wrong').classList.remove('sb-judged--wrong');

    const build = $('#sb-build');
    build.classList.add('sb-build--exit');
    setTimeout(() => {
      build.hidden = true;
      const result = $('#sb-result');
      result.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => result.classList.add('sb-result--enter')));
    }, 260);
  };

  function judge(correct) {
    if (judged) return;
    judged = true;
    droppedPhrases.forEach(p => applyMastery(p.id, correct ? 1 : -1));
    if (correct) score.right++; else score.wrong++;
    $('#sb-score').textContent = `Right: ${score.right} · Wrong: ${score.wrong}`;
    $('#sb-next').disabled = false;
    $('#sb-right').classList.toggle('sb-judged--right', correct);
    $('#sb-wrong').classList.toggle('sb-judged--wrong', !correct);
  }

  $('#sb-right').onclick = () => judge(true);
  $('#sb-wrong').onclick = () => judge(false);

  $('#sb-next').onclick = () => {
    droppedPhrases = [];
    judged = false;
    $('#sb-textbox').value = '';
    const result = $('#sb-result');
    result.hidden = true;
    result.classList.remove('sb-result--enter');
    const build = $('#sb-build');
    build.classList.remove('sb-build--exit');
    build.hidden = false;
    scrollToIdx(0, false);
    requestAnimationFrame(updateHighlight);
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* =========================================================
   20. SERVICE WORKER
   ========================================================= */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

/* =========================================================
   21. INIT
   ========================================================= */
function init() {
  load();
  registerSW();
  renderLibrary();
  switchView('browse');
  initLibListDrop();
  initWishlist();
  initSentWishlist();
  initGenSentencesSheet();
}

function initLibListDrop() {
  const trigger = $('#lib-list-trigger');
  const menu = $('#lib-list-menu');
  const label = $('#lib-list-label');

  trigger.onclick = e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };

  document.querySelectorAll('.lib-list-opt').forEach(btn => {
    btn.onclick = () => {
      libListMode = btn.dataset.list;
      label.textContent = btn.textContent;
      document.querySelectorAll('.lib-list-opt').forEach(b => b.classList.toggle('is-active', b === btn));
      menu.hidden = true;
      renderLibrary();
    };
  });

  document.addEventListener('click', () => { menu.hidden = true; });
}

function initWishlist() {
  const handle = $('#wishlist-handle');
  const drawer = $('#wishlist-drawer');
  const arrow  = $('#wishlist-arrow');
  let open = false;

  function toggleWishlist(forceClose) {
    open = forceClose ? false : !open;
    drawer.classList.toggle('is-open', open);
    arrow.textContent = open ? '›' : '‹';
  }

  handle.onclick = () => toggleWishlist();

  document.addEventListener('click', e => {
    if (open && !drawer.contains(e.target) && !handle.contains(e.target)) toggleWishlist(true);
  });

  function doAdd() {
    const input = $('#wishlist-input');
    const val = input.value.trim();
    if (!val) return;
    const lower = val.toLowerCase();
    if (state.phrases.some(p => p.input.toLowerCase() === lower)) {
      toast('Already in Word List');
      return;
    }
    if (!state.wishlist) state.wishlist = [];
    if (state.wishlist.some(w => w.toLowerCase() === lower)) {
      toast('Already in Wish List');
      return;
    }
    state.wishlist.push(val);
    save();
    input.value = '';
    input.focus();
    toast('Added to Wish List');
    if (libListMode === 'wish') renderLibrary();
  }

  $('#wishlist-add').onclick = doAdd;
  $('#wishlist-input').addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
}

function initSentWishlist() {
  const handle = $('#sent-wish-handle');
  const drawer = $('#sent-wish-drawer');
  const arrow  = $('#sent-wish-arrow');
  let open = false;

  function toggleSentWishlist(forceClose) {
    open = forceClose ? false : !open;
    drawer.classList.toggle('is-open', open);
    arrow.textContent = open ? '‹' : '›';
  }

  handle.onclick = () => toggleSentWishlist();

  document.addEventListener('click', e => {
    if (open && !drawer.contains(e.target) && !handle.contains(e.target)) toggleSentWishlist(true);
  });

  function doAdd() {
    const input = $('#sent-wish-input');
    const val = input.value.trim();
    if (!val) return;
    if (!state.sentWishlist) state.sentWishlist = [];
    if (state.sentWishlist.some(w => w.toLowerCase() === val.toLowerCase())) {
      toast('Already in Sentence Learn List');
      return;
    }
    state.sentWishlist.push(val);
    save();
    input.value = '';
    input.focus();
    toast('Added to Sentence Learn List');
    if (libListMode === 'sentlearn') renderLibrary();
  }

  $('#sent-wish-add').onclick = doAdd;
  $('#sent-wish-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAdd(); }
  });
}

function initGenSentencesSheet() {
  let genMode = 'random';
  let manualSelected = new Set();

  const sheet = $('#gen-sentences-sheet');
  const panels = { random: $('#gen-sent-panel-random'), manual: $('#gen-sent-panel-manual'), all: $('#gen-sent-panel-all') };

  document.querySelectorAll('.gen-sent-mode').forEach(btn => {
    btn.onclick = () => {
      genMode = btn.dataset.mode;
      document.querySelectorAll('.gen-sent-mode').forEach(b => b.classList.toggle('is-active', b === btn));
      Object.keys(panels).forEach(k => { panels[k].hidden = k !== genMode; });
    };
  });

  $('#btn-gen-sentences').onclick = () => {
    const words = state.phrases.map(p => p.input);
    if (!words.length) { toast('Add some words to your Word List first.'); return; }

    manualSelected = new Set();
    genMode = 'random';
    document.querySelectorAll('.gen-sent-mode').forEach(b => b.classList.toggle('is-active', b.dataset.mode === 'random'));
    Object.keys(panels).forEach(k => { panels[k].hidden = k !== 'random'; });

    $('#gen-sent-count').value = Math.min(10, words.length);
    $('#gen-sent-all-count').textContent = words.length;

    const cl = $('#gen-sent-checklist');
    cl.innerHTML = words.map(w => `<li class="gen-sent-check-item" data-word="${esc(w)}">${esc(w)}</li>`).join('');
    cl.querySelectorAll('.gen-sent-check-item').forEach(li => {
      li.onclick = () => {
        const w = li.dataset.word;
        if (manualSelected.has(w)) { manualSelected.delete(w); li.classList.remove('is-selected'); }
        else { manualSelected.add(w); li.classList.add('is-selected'); }
      };
    });

    sheet.hidden = false;
  };

  $('#gen-sent-cancel').onclick = () => { sheet.hidden = true; };
  $('#gen-sentences-backdrop').onclick = () => { sheet.hidden = true; };

  $('#gen-sent-generate').onclick = () => {
    let selected = [];
    if (genMode === 'all') {
      selected = state.phrases.map(p => p.input);
    } else if (genMode === 'manual') {
      selected = [...manualSelected];
      if (!selected.length) { toast('Select at least one word.'); return; }
    } else {
      const n = Math.max(1, Math.min(state.phrases.length, parseInt($('#gen-sent-count').value) || 10));
      selected = shuffle(state.phrases.map(p => p.input)).slice(0, n);
    }

    const PROMPT = `You are a Thai language teacher helping a beginner build everyday conversational skills. Using the following English words and phrases that the learner already knows, create natural everyday sentences that incorporate those words.

For each sentence provide exactly:
English: [English sentence]
Translation: [Thai script]
Phonetics: [romanized phonetics]
Note: [brief usage note]

Separate entries with a blank line. Create at least 20 sentences. Use natural spoken Thai suited for a beginner. Do not include any extra text outside the entries.

Words to incorporate:
${selected.join('\n')}`;

    sheet.hidden = true;
    openCopyPrompt('Sentences Prompt', PROMPT);
  };
}

/* =========================================================
   SENTENCE PRACTICE GAME
   ========================================================= */
function startSentencePractice() {
  // full entries (have phonetics) + raw sentWishlist items wrapped as simple targets
  const fullSentences = state.sentences.filter(s => s.phonetics);
  const rawSentences  = (state.sentWishlist || []).map(t => ({ id: 'raw:' + t, input: t, phonetics: null, translation: null }));
  const sentences = [...fullSentences, ...rawSentences];
  if (!sentences.length) {
    toast('No sentences yet. Add some via the left panel or import via Library → Sentences.');
    return;
  }
  const phrases = state.phrases.filter(p => p.phonetics).sort((a, b) => a.phonetics.localeCompare(b.phonetics));
  if (!phrases.length) {
    toast('Add words with phonetics to use the wheel.');
    return;
  }

  const ITEM_H = 52;
  const PAD    = 104;
  const gameEl = $('#game');
  gameEl.hidden = false;

  let score = { right: 0, wrong: 0 };
  let currentSentence = null;
  let droppedPhrases = [];
  let judged = false;

  // Mastery-weighted pick: cold first, then warm, then hot
  function pickSentence(exclude) {
    const pool = sentences.filter(s => s.id !== exclude);
    if (!pool.length) return sentences[0];
    const cold = pool.filter(s => band(s.mastery) === 'cold');
    const warm = pool.filter(s => band(s.mastery) === 'warm');
    const hot  = pool.filter(s => band(s.mastery) === 'hot');
    const bucket = cold.length ? cold : warm.length ? warm : hot;
    return bucket[Math.floor(Math.random() * bucket.length)];
  }

  function buildHTML(sentence) {
    return `
    <div class="game__bar">
      <button class="btn game__close" id="sp-close" aria-label="Close">✕</button>
      <span class="game__score" id="sp-score">Right: 0 · Wrong: 0</span>
    </div>
    <div class="sb-body">
      <div class="sb-build" id="sp-build">
        <div class="sp-sentence-card">
          <div class="sp-sentence-card-top">
            <span class="sp-sentence-label">Build the phonetics for:</span>
            <button class="sp-flag-btn${sentence.flagged ? ' is-flagged' : ''}" id="sp-flag-btn" aria-label="Flag for deletion" title="Flag for deletion">🚩</button>
          </div>
          <p class="sp-sentence-text" id="sp-sentence-text">${esc(sentence.input)}</p>
        </div>
        <div class="sb-wheel-wrap">
          <div class="sb-wheel" id="sp-wheel">
            <div style="height:${PAD}px;flex-shrink:0"></div>
            ${phrases.map(p => `<div class="sb-wheel-item" data-id="${p.id}">${esc(p.phonetics)}</div>`).join('')}
            <div style="height:${PAD}px;flex-shrink:0"></div>
          </div>
          <div class="sb-wheel-selector"></div>
        </div>
        <textarea class="sb-textbox" id="sp-textbox" placeholder="Tap words from the wheel…" rows="2" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"></textarea>
        <div class="sp-build-btns">
          <button class="btn sb-reveal-btn" id="sp-reveal-btn">Reveal</button>
          <button class="btn sp-skip-btn" id="sp-skip-btn">Skip →</button>
        </div>
      </div>

      <div class="sb-result" id="sp-result" hidden>
        <div class="sb-result-field">
          <span class="sb-result-label">Input sentence</span>
          <div class="sb-result-val" id="sp-r-input"></div>
        </div>
        <div class="sb-result-field">
          <span class="sb-result-label">My attempt</span>
          <div class="sb-result-val" id="sp-r-attempt"></div>
        </div>
        <div class="sb-result-field" id="sp-r-eng-map-wrap">
          <span class="sb-result-label">English mapping</span>
          <div class="sb-result-val" id="sp-r-eng-map"></div>
        </div>
        <div class="sb-result-field" id="sp-r-thai-map-wrap">
          <span class="sb-result-label">Thai mapping</span>
          <div class="sb-result-val sb-result-val--xl" id="sp-r-thai-map"></div>
        </div>
        <div class="sb-result-field" id="sp-r-phonetic-wrap">
          <span class="sb-result-label">Correct phonetics</span>
          <div class="sb-result-val" id="sp-r-phonetic"></div>
        </div>
        <div class="sb-result-field" id="sp-r-translation-wrap">
          <span class="sb-result-label">Correct translation</span>
          <div class="sp-translation-row">
            <div class="sb-result-val sb-result-val--xl" id="sp-r-translation"></div>
            <button class="sp-play-btn" id="sp-play-btn" aria-label="Play">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            </button>
          </div>
        </div>
        <div class="sb-judge-row">
          <button class="btn sb-right-btn" id="sp-right">I'm Right</button>
          <button class="btn sb-wrong-btn" id="sp-wrong">I'm Wrong</button>
        </div>
        <button class="btn sb-next-btn" id="sp-next" disabled>Next →</button>
      </div>
    </div>`;
  }

  function loadSentence(sentence) {
    currentSentence = sentence;
    droppedPhrases = [];
    judged = false;
    gameEl.innerHTML = buildHTML(sentence);
    bindHandlers();
  }

  function bindHandlers() {
    const wheel = $('#sp-wheel');

    function scrollToIdx(i, smooth) { wheel.scrollTo({ top: i * ITEM_H, behavior: smooth ? 'smooth' : 'instant' }); }
    function centerIdx() { return Math.round(wheel.scrollTop / ITEM_H); }
    function updateHighlight() {
      const ci = centerIdx();
      wheel.querySelectorAll('.sb-wheel-item').forEach((el, i) => el.classList.toggle('is-center', i === ci));
    }

    wheel.addEventListener('scroll', updateHighlight, { passive: true });
    scrollToIdx(0, false);
    requestAnimationFrame(updateHighlight);

    wheel.addEventListener('click', e => {
      const item = e.target.closest('.sb-wheel-item');
      if (!item) return;
      const items = Array.from(wheel.querySelectorAll('.sb-wheel-item'));
      const idx = items.indexOf(item);
      scrollToIdx(idx, true);
      items.forEach((el, i) => el.classList.toggle('is-center', i === idx));
      const tapped = phrases.find(p => p.id === item.dataset.id);
      if (tapped) droppedPhrases.push(tapped);

      const tb = $('#sp-textbox');
      const word = item.textContent.trim();
      const start = (document.activeElement === tb) ? tb.selectionStart : tb.value.length;
      const end   = (document.activeElement === tb) ? tb.selectionEnd   : tb.value.length;
      const before = tb.value.slice(0, start);
      const after  = tb.value.slice(end);
      const gap = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
      tb.value = before + gap + word + after;
      const cursor = start + gap.length + word.length;
      tb.focus();
      tb.setSelectionRange(cursor, cursor);
    });

    $('#sp-close').onclick = closeGame;

    $('#sp-skip-btn').onclick = () => {
      const next = pickSentence(currentSentence.id);
      loadSentence(next);
    };

    $('#sp-flag-btn').onclick = () => {
      if (currentSentence.id.startsWith('raw:')) { toast('Raw sentences can be removed from the Sentence Learn List.'); return; }
      const s = state.sentences.find(x => x.id === currentSentence.id);
      if (!s) return;
      s.flagged = !s.flagged;
      currentSentence = s;
      save();
      const btn = $('#sp-flag-btn');
      btn.classList.toggle('is-flagged', s.flagged);
      toast(s.flagged ? 'Flagged — find it in Library → Sentences' : 'Unflagged');
    };

    $('#sp-reveal-btn').onclick = () => {
      const attempt = $('#sp-textbox').value.trim();
      if (!attempt) { toast('Build some phonetics first.'); return; }
      judged = false;
      const isRaw = !currentSentence.phonetics;
      const hasDropped = droppedPhrases.length > 0;

      $('#sp-r-input').textContent = currentSentence.input;
      $('#sp-r-attempt').textContent = attempt;

      // English / Thai mapping from dropped wheel words
      $('#sp-r-eng-map-wrap').hidden = !hasDropped;
      $('#sp-r-thai-map-wrap').hidden = !hasDropped;
      if (hasDropped) {
        $('#sp-r-eng-map').textContent  = droppedPhrases.map(p => p.input).join('  ·  ');
        $('#sp-r-thai-map').textContent = droppedPhrases.map(p => p.translation).join('  ·  ');
      }

      // Correct phonetics + translation (only for full entries)
      $('#sp-r-phonetic-wrap').hidden = isRaw;
      $('#sp-r-translation-wrap').hidden = isRaw;
      if (!isRaw) {
        $('#sp-r-phonetic').textContent     = currentSentence.phonetics;
        $('#sp-r-translation').textContent  = currentSentence.translation;
        $('#sp-play-btn').onclick = () => speak(currentSentence.translation, $('#sp-play-btn'));
      }

      $('#sp-right').classList.remove('sb-judged--right');
      $('#sp-wrong').classList.remove('sb-judged--wrong');
      $('#sp-next').disabled = true;

      const build = $('#sp-build');
      build.classList.add('sb-build--exit');
      setTimeout(() => {
        build.hidden = true;
        const result = $('#sp-result');
        result.hidden = false;
        requestAnimationFrame(() => requestAnimationFrame(() => result.classList.add('sb-result--enter')));
      }, 260);
    };

    function judge(correct) {
      if (judged) return;
      judged = true;
      if (!currentSentence.id.startsWith('raw:')) applySentenceMastery(currentSentence.id, correct ? 1 : -1);
      if (correct) score.right++; else score.wrong++;
      $('#sp-score').textContent = `Right: ${score.right} · Wrong: ${score.wrong}`;
      $('#sp-next').disabled = false;
      $('#sp-right').classList.toggle('sb-judged--right', correct);
      $('#sp-wrong').classList.toggle('sb-judged--wrong', !correct);
    }

    $('#sp-right').onclick = () => judge(true);
    $('#sp-wrong').onclick = () => judge(false);

    $('#sp-next').onclick = () => {
      const next = pickSentence(currentSentence.id);
      loadSentence(next);
    };
  }

  loadSentence(pickSentence(null));
}

document.addEventListener('DOMContentLoaded', init);
