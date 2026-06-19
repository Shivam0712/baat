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
  BAND_COLD_MAX: 4,
  BAND_WARM_MAX: 15,
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
let state = { version: 1, phrases: [], settings: { lang: CONFIG.DEFAULT_LANG } };

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
        state = { version: 1, phrases: p.phrases, settings: { lang: p.settings?.lang || CONFIG.DEFAULT_LANG } };
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
function bulkAdd(arr) { arr.forEach(o => state.phrases.push(newPhrase(o.input, o.translation, o.phonetics, o.note))); save(); }
function updatePhrase(id, patch) { const e = state.phrases.find(x => x.id === id); if (e) { Object.assign(e, patch); save(); } }
function removePhrase(id) { state.phrases = state.phrases.filter(x => x.id !== id); save(); }

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

function band(m) {
  if (m <= CONFIG.BAND_COLD_MAX) return 'cold';
  if (m <= CONFIG.BAND_WARM_MAX) return 'warm';
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
function renderLibrary() {
  const ul = $('#list');
  const empty = $('#library-empty');
  if (!state.phrases.length) {
    ul.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  ul.innerHTML = state.phrases.map(p => {
    const b = band(p.mastery);
    return `<li class="list__item" data-id="${p.id}">
      <span class="list__bar" style="--tier-color:${bandColor(b)}"></span>
      <span class="list__text">
        <span class="list__phrase">${esc(p.input)}</span>
        <span class="list__sub">${b} · ${Math.round(p.mastery)}%</span>
      </span>
      <span class="list__chev">›</span>
    </li>`;
  }).join('');
}

$('#list').addEventListener('click', e => {
  const li = e.target.closest('.list__item');
  if (li) openEditor(li.dataset.id);
});

/* =========================================================
   13. EDITOR SHEET
   ========================================================= */
let editingId = null;

function openEditor(id) {
  editingId = id || null;
  const e = id ? state.phrases.find(x => x.id === id) : null;
  $('#editor-title').textContent = id ? 'Edit phrase' : 'Add phrase';
  $('#f-input').value = e ? e.input : '';
  $('#f-translation').value = e ? e.translation : '';
  $('#f-phonetics').value = e ? e.phonetics : '';
  $('#f-note').value = e ? (e.note || '') : '';
  $('#btn-delete').hidden = !id;
  $('#editor').hidden = false;
}

function closeEditor() { $('#editor').hidden = true; editingId = null; }

$('#btn-add').onclick = () => openEditor(null);
$('#btn-cancel').onclick = closeEditor;
$('#editor .sheet__backdrop').onclick = closeEditor;

$('#btn-save').onclick = () => {
  const i = $('#f-input').value.trim();
  const t = $('#f-translation').value.trim();
  const p = $('#f-phonetics').value.trim();
  const n = $('#f-note').value.trim();
  if (!i || !t) { toast('Phrase and translation are required.'); return; }
  if (editingId) {
    updatePhrase(editingId, { input: i, translation: t, phonetics: p, note: n });
  } else {
    addPhrase(i, t, p, n);
  }
  closeEditor();
  renderLibrary();
  if (currentBrowseId === editingId) {
    renderBrowseCard(state.phrases.find(x => x.id === editingId));
  }
};

$('#btn-delete').onclick = () => {
  const id = editingId;
  confirmDialog('Delete this phrase?', "This can't be undone.", () => {
    removePhrase(id);
    if (currentBrowseId === id) { currentBrowseId = null; }
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
  const text = await file.text();
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
  let added = 0, skipped = 0;
  const valid = [];
  for (const blk of blocks) {
    const lines = blk.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) continue;
    const fields = {};
    for (const line of lines) {
      const m = line.match(/^([^:]+):\s*(.*)/);
      if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
    }
    const translation = fields.translation || fields.thai;
    if (fields.english && translation && fields.phonetics) {
      valid.push({ input: fields.english, translation, phonetics: fields.phonetics, note: fields.note || '' });
      added++;
    } else {
      skipped++;
    }
  }
  if (valid.length) bulkAdd(valid);
  renderLibrary();
  toast(`Added ${added}` + (skipped ? ` · skipped ${skipped} (bad format)` : ''));
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
  $('#set-stat').textContent = `${state.phrases.length} phrases stored`;
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

$('#btn-import-trigger').onclick = () => $('#import-file').click();

$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || !Array.isArray(data.phrases)) throw 0;
    confirmDialog('Import backup?', 'New phrases will be merged into your library.', () => {
      const existing = new Set(state.phrases.map(p => p.id));
      data.phrases.forEach(p => { if (!existing.has(p.id)) state.phrases.push(p); });
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
  if (state.phrases.length < CONFIG.GAME_MIN_PHRASES) {
    toast(`Add at least ${CONFIG.GAME_MIN_PHRASES} phrases to play.`);
    return;
  }
  startGame(t.dataset.game);
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

function startGame(type) {
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
    gameSession = {
      type,
      entries: weightedSample(state.phrases, batchSize),
      index: 0,
      score: 0,
      answered: 0,
    };
    renderGame();
  };
}

function gameTitle(type) {
  return { match: 'Match-up', choice: 'Multiple Choice', listen: 'Listen & Choose', flip: 'Flashcards' }[type] || type;
}

function gameDesc(type) {
  return {
    match: 'Pair each phrase to its pronunciation.',
    choice: 'Pick the correct phonetic spelling.',
    listen: 'Hear the phrase and identify it.',
    flip: 'Flip the card and rate yourself.',
  }[type] || '';
}

function renderGame() {
  const gs = gameSession;
  const gameEl = $('#game');

  if (gs.index >= gs.entries.length) {
    showResult();
    return;
  }

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
    { input: entry.input, phonetics: entry.phonetics, translation: entry.translation },
    ...distractors.map(p => ({ input: p.input, phonetics: p.phonetics, translation: p.translation })),
  ]);

  body.innerHTML = `
    <div class="game__prompt-label">Which phrase did you hear?</div>
    <div class="listen-replay">
      <button class="btn-play" id="listen-play" aria-label="Play">▶</button>
    </div>
    <div class="options" id="options"></div>`;

  const playBtn = $('#listen-play');
  playBtn.onclick = () => speak(entry.translation, playBtn);
  speak(entry.translation, playBtn);

  const optEl = $('#options');
  allOpts.forEach(opt => {
    const row = document.createElement('div');
    row.className = 'option-row';

    const optPlayBtn = document.createElement('button');
    optPlayBtn.className = 'opt-play';
    optPlayBtn.setAttribute('aria-label', 'Play pronunciation');
    optPlayBtn.textContent = '▶';
    optPlayBtn.onclick = e => { e.stopPropagation(); speak(opt.translation, optPlayBtn); };

    const optBtn = document.createElement('button');
    optBtn.className = 'option listen-option';
    optBtn.innerHTML = `<span class="opt-input">${esc(opt.input)}</span><span class="opt-phon">${esc(opt.phonetics)}</span>`;
    optBtn.dataset.input = opt.input;
    optBtn.onclick = () => handleListen(optBtn, opt.input, entry, optEl);

    row.appendChild(optPlayBtn);
    row.appendChild(optBtn);
    optEl.appendChild(row);
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
          <div class="chip-row">
            <button class="opt-play" data-id="${e.id}" aria-label="Play">▶</button>
            <button class="chip" data-id="${e.id}" data-col="left">${esc(e.input)}</button>
          </div>`).join('')}
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
    if (flipped) return;
    flipped = true;
    card.classList.add('flipped');
    rateRow.style.display = 'flex';
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
   19. HELPERS
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
}

document.addEventListener('DOMContentLoaded', init);
