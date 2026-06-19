# Baat — Spoon-Fed Build Guide for an Implementation Agent

> You are building a personal-use PWA called **Baat**, a Thai phrase trainer.
> Build it EXACTLY as written. Do not improvise structure, names, or copy.
> Every ID, class, constant, string, and algorithm below is normative.
> When a step says "ACCEPTANCE", verify it before moving on.
> Stack: static GitHub Pages. Single-page HTML + vanilla JS + CSS. NO frameworks, NO CDN libs. Everything offline.

---

## 0. DELIVERABLES (exact file tree)

```
/ (repo root)
├── index.html
├── style.css
├── app.js
├── manifest.json
├── sw.js
├── sample.txt
├── README.md
└── icons/
    ├── icon-180.png   (Apple touch)
    ├── icon-192.png
    ├── icon-512.png
    └── icon-512-maskable.png
```

Build order (do not reorder): manifest+icons → index.html → style.css → app.js modules in section order → sw.js → sample.txt → README. Test after each major section.

---

## 1. GLOBAL CONSTANTS (paste verbatim at top of app.js)

```js
'use strict';
const CONFIG = {
  STORAGE_KEY: 'baat.v1',
  MASTERY_MIN: 0,
  MASTERY_MAX: 100,
  MASTERY_START: 0,
  DELTA_CORRECT: 1,      // game correct OR flashcard "Knew it"
  DELTA_WRONG: -1,       // game wrong OR flashcard "Didn't"
  DELTA_BROWSE: 1,       // shuffle lands on an entry
  BAND_COLD_MAX: 33,     // 0..33 cold
  BAND_WARM_MAX: 66,     // 34..66 warm, 67..100 hot
  GAME_MIN_PHRASES: 4,   // need >=4 to play any game
  MC_OPTIONS: 4,         // options in multiple-choice / listen
  MATCH_PAIRS: 5,        // pairs per match-up round (capped by batch)
  DEFAULT_LANG: 'th-TH',
  ADVANCE_MS: 750,       // delay before auto-advancing after an answer
};
```

NOTE on tuning: ±1 on a 0–100 scale means Hot (≥67) needs ~67 net-correct events. This is intentional per spec owner. Do not change.

---

## 2. DATA MODEL (normative shape)

Each phrase object — create with EXACTLY these keys:
```js
{
  id: string,            // crypto.randomUUID() (fallback Date.now()+'-'+Math.random())
  input: string,         // source phrase (e.g. English)
  translation: string,   // Thai script
  phonetics: string,     // romanized pronunciation
  mastery: number,       // 0..100, starts 0
  viewCount: number,     // cosmetic stat, starts 0
  gamesSeen: number,     // starts 0
  gamesCorrect: number,  // starts 0
  createdAt: number      // Date.now()
}
```

Persisted blob under localStorage[CONFIG.STORAGE_KEY]:
```js
{ version: 1, phrases: [ ...phrase objects ], settings: { lang: 'th-TH' } }
```

---

## 3. index.html (full file — produce exactly this structure)

Required `<head>`:
- charset utf-8
- viewport: `width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no`
- `<title>Baat</title>`
- `<link rel="manifest" href="manifest.json">`
- two theme-color metas (light `#4f46e5`, dark `#0b0b12`) via media attr
- `apple-mobile-web-app-capable=yes`, `mobile-web-app-capable=yes`
- `apple-mobile-web-app-status-bar-style=black-translucent`
- `apple-mobile-web-app-title=Baat`
- `<link rel="apple-touch-icon" href="icons/icon-180.png">`
- `<link rel="stylesheet" href="style.css">`

Required `<body>` DOM — these IDs/classes are referenced by app.js and CSS; reproduce names EXACTLY:

```
#app
  section.view#view-browse[data-view=browse].is-active
    header.topbar
      h1.topbar__title  "Baat"
      span.topbar__sub#browse-count
    div.browse__stage#browse-stage      <!-- card injected -->
    div.browse__actions
      button.btn-shuffle#btn-shuffle      ("Shuffle" + shuffle svg)
  section.view#view-library[data-view=library]
    header.topbar
      h1.topbar__title "Library"
      div.topbar__actions
        button.topbar__btn#btn-settings (gear svg, aria-label "Settings")
        button.topbar__btn#btn-add (plus svg, aria-label "Add phrase")
    div.library__tools
      label.upload  > input[type=file]#file-upload[accept=".txt,text/plain" hidden] + span.upload__label ("Import .txt" + svg)
      div.legend > 3x span.legend__item (i.dot.dot--cold "Cold", .dot--warm "Warm", .dot--hot "Hot")
    ul.list#list
    div.empty#library-empty[hidden]  (p.empty__title "No phrases yet" + p.empty__hint "Tap + to add one, or import a .txt file.")
  section.view#view-practice[data-view=practice]
    header.topbar > h1.topbar__title "Practice"
    div.practice__hub#practice-hub
      4x button.tile[data-game=match|choice|listen|flip]
        span.tile__icon (🔗 / 🎯 / 👂 / 🃏)
        span.tile__name (Match-up / Multiple choice / Listen & choose / Flashcards)
        span.tile__desc (Pair phrase to sound / Pick the right sound / Hear it, find it / Flip and self-rate)
  nav.tabbar#tabbar
    3x button.tab[data-target=browse|library|practice] (svg + span label) ; browse has .is-active
#editor.sheet[hidden]                <!-- add/edit bottom sheet -->
  div.sheet__backdrop[data-close]
  div.sheet__panel[role=dialog aria-modal=true aria-labelledby=editor-title]
    div.sheet__grip
    h2.sheet__title#editor-title
    label.field > span.field__label "Phrase"      + textarea#f-input[rows=2]
    label.field > span.field__label "Translation"  + textarea#f-translation[rows=2]
    label.field > span.field__label "Phonetics"    + textarea#f-phonetics[rows=2]
    div.sheet__row > button.btn.btn--ghost#btn-cancel "Cancel" + button.btn.btn--primary#btn-save "Save"
    button.btn.btn--danger#btn-delete[hidden] "Delete phrase"
#settings.sheet[hidden]              <!-- settings bottom sheet -->
  div.sheet__backdrop[data-close]
  div.sheet__panel[role=dialog aria-modal=true aria-labelledby=settings-title]
    div.sheet__grip
    h2.sheet__title#settings-title "Settings"
    label.field > span.field__label "Speech language" + select#set-lang
    p.set-note#lang-note[hidden]      <!-- "No Thai voice on this device." -->
    div.sheet__row > button.btn.btn--ghost#btn-export "Export backup" + button.btn.btn--ghost#btn-import-trigger "Import backup"
    input[type=file]#import-file[accept="application/json,.json" hidden]
    p.set-stat#set-stat               <!-- "N phrases stored" -->
    div.sheet__row > button.btn.btn--ghost#btn-close-settings "Done"
#confirm.confirm[hidden]
  div.confirm__backdrop[data-close]
  div.confirm__panel[role=alertdialog aria-modal=true aria-labelledby=confirm-title]
    h2.confirm__title#confirm-title
    p.confirm__msg#confirm-msg
    div.confirm__row > button.btn.btn--ghost#confirm-no + button.btn.btn--danger#confirm-yes
#toast.toast[hidden]
#game.game[hidden]                   <!-- full-screen game overlay, contents injected -->
<script src="app.js"></script>
```

Inline SVGs: use simple single-path icons (shuffle, plus, gear, upload arrow, list, bookmark, lightbulb, chevron). Any clean 24×24 currentColor path is acceptable; aria-hidden on decorative svgs.

ACCEPTANCE: page loads, three sections exist, tab bar visible, no JS yet needed to render skeleton.

---

## 4. style.css (normative tokens + rules)

Define `:root` tokens EXACTLY (light), then override in `@media (prefers-color-scheme: dark)`:

LIGHT:
```
--accent:#4f46e5; --accent-soft:#6366f1;
--cold:#64748b; --warm:#f59e0b; --hot:#f43f5e;
--bg:#f5f5f7; --bg-elev:#ffffff; --bg-sunken:#ececef;
--text:#1c1c1e; --text-2:#6b6b70; --text-3:#a1a1a6;
--hair:rgba(0,0,0,.08); --hair-strong:rgba(0,0,0,.14);
--shadow:0 10px 40px -12px rgba(0,0,0,.18);
--shadow-card:0 20px 60px -20px rgba(0,0,0,.22);
--r-lg:26px; --r-md:18px; --r-sm:12px; --tap:44px;
--safe-top:env(safe-area-inset-top,0px); --safe-bottom:env(safe-area-inset-bottom,0px);
--tabbar-h:calc(58px + var(--safe-bottom));
--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;
--ease:cubic-bezier(.22,.61,.36,1);
```
DARK overrides:
```
--accent:#818cf8; --accent-soft:#a5b4fc;
--cold:#7c8aa0; --warm:#fbbf24; --hot:#fb7185;
--bg:#0b0b12; --bg-elev:#18181f; --bg-sunken:#111119;
--text:#f5f5f7; --text-2:#9b9ba3; --text-3:#66666e;
--hair:rgba(255,255,255,.08); --hair-strong:rgba(255,255,255,.16);
--shadow:0 10px 40px -12px rgba(0,0,0,.6);
--shadow-card:0 24px 70px -24px rgba(0,0,0,.8);
```

Mandatory rules (behavioral, not exhaustive styling):
- `*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}`
- `html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font);-webkit-font-smoothing:antialiased}`
- `.view{position:absolute;inset:0;display:none;flex-direction:column;padding-top:var(--safe-top);padding-bottom:var(--tabbar-h)}`
- `.view.is-active{display:flex;animation:viewIn .34s var(--ease)}` ; keyframe viewIn fades+translateY(6px→0).
- `.tabbar`: position absolute bottom; height var(--tabbar-h); padding-bottom safe; `backdrop-filter:saturate(180%) blur(20px)` + `-webkit-` prefix; border-top hair; flex of 3 `.tab`. `.tab{color:var(--text-3)}` `.tab.is-active{color:var(--accent)}`. svg 26×26.
- Tap targets: every interactive control min 44×44 (buttons, tabs, rows).
- `.card`: bg-elev, radius r-lg, padding 38px 30px 34px, shadow-card, border hair, overflow hidden, position relative. `.card::before` = radial glow using `var(--glow,transparent)` top-center, opacity .5. `.card__tier` top-right, uppercase 11px, color var(--glow).
- `.card__input` 30px/700; `.card__divider` 1px hair; `.card__translation` 26px/600; `.card__phon` 17px italic text-2; `.btn-play` 46px circle accent bg white icon, `:active scale(.88)`, `.is-speaking` pulse.
- `.btn-shuffle` full-width 54px accent, white, radius r-md, `:active scale(.97)`, `:disabled opacity .4`.
- Card swap animations: `.swap-out`(→opacity0 translateY(-10px) scale .98, .18s) `.swap-in`(.34s reverse).
- Library: `.list{overflow-y:auto;flex:1;padding:0 14px;-webkit-overflow-scrolling:touch}`. `.list__item{display:flex;gap:14px;min-height:var(--tap);padding:13px 14px;margin:6px 0;background:bg-elev;border:1px hair;border-radius:r-md} :active scale(.985)`. `.list__bar{flex:0 0 4px;align-self:stretch;border-radius:3px;background:var(--tier-color,var(--cold))}`. `.list__phrase` ellipsis 16/600. `.list__sub` 13 text-3.
- Practice hub: `.practice__hub{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:10px 18px 20px;overflow-y:auto;align-content:start}`. `.tile{aspect-ratio:1/1;background:bg-elev;border:1px hair;border-radius:r-lg;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;padding:18px;box-shadow:shadow} :active scale(.95)`. `.tile__icon{font-size:30px;margin-bottom:auto}`.
- Sheets: `.sheet{position:absolute;inset:0;z-index:50}`. backdrop rgba(0,0,0,.4) fadeIn. `.sheet__panel{position:absolute;left/right/bottom:0;background:bg-elev;border-radius:28px 28px 0 0;padding:12px 22px calc(22px + safe-bottom);animation:sheetUp .38s}` (sheetUp from translateY(100%)). `.sheet__grip` 38×5 hair-strong centered. `.field textarea{width:100%;background:bg-sunken;border:1px hair;border-radius:r-sm;padding:13px 14px;font-size:16px;resize:none} :focus border-color accent`. (font-size ≥16px prevents iOS zoom — REQUIRED.)
- Buttons: `.btn{height:50px;border-radius:r-md;font-weight:700} :active scale(.97)`. `.btn--primary{background:accent;color:#fff;flex:1}` `.btn--ghost{background:bg-sunken;color:text;flex:1}` `.btn--danger{background:transparent;color:hot;width:100%;margin-top:12px}`.
- Confirm: centered panel `top:50% translateY(-50%)`, left/right 24px, radius 22, popIn animation.
- Toast: `position:absolute;left:50%;bottom:calc(tabbar-h + 16px);transform:translateX(-50%);background:var(--text);color:var(--bg);padding:12px 18px;border-radius:14px;z-index:80`. `.out` fades+down.
- Games (in #game): `.game{background:var(--bg);display:flex;flex-direction:column;padding-top:safe-top}`. `.game__bar`(close ✕ left, score right). `.game__body{flex:1;overflow-y:auto;padding:8px 22px calc(30px+safe-bottom);display:flex;flex-direction:column}`. `.option{min-height:56px;border:1.5px hair;border-radius:r-md;background:bg-elev;font-size:17px;text-align:left;padding:16px 18px}`. `.option.correct{border-color:#16a34a;background:color-mix(in srgb,#16a34a 14%,var(--bg-elev))}` `.option.wrong{border-color:var(--hot);background:color-mix(in srgb,var(--hot) 14%,var(--bg-elev))}`. Match: `.match{display:grid;grid-template-columns:1fr 1fr;gap:12px}`; `.chip{min-height:52px;border:1.5px hair;border-radius:r-sm;display:flex;align-items:center;justify-content:center;text-align:center;font-size:15px}` states `.sel`(accent border+tint) `.done{opacity:.25;pointer-events:none;border-style:dashed}` `.flash-wrong{animation:shake .4s;border-color:var(--hot)}` (shake translateX ±6px). Flashcard: `.flash{perspective:1200px;flex:1;display:flex;align-items:center}` `.flash__card{width:100%;min-height:280px;position:relative;transform-style:preserve-3d;transition:transform .5s var(--ease)} .flipped{transform:rotateY(180deg)}` `.flash__face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;...}` `.flash__face--back{transform:rotateY(180deg)}`. `.rate-btn--no{color:var(--hot);background:color-mix(in srgb,var(--hot) 16%,var(--bg-elev))}` `.rate-btn--yes{color:#16a34a;background:color-mix(in srgb,#16a34a 16%,var(--bg-elev))}`.
- `@media (prefers-reduced-motion: reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}`

ACCEPTANCE: at 390px width, both color schemes look clean; tab bar blurs; no element <44px tappable; textareas don't trigger zoom on focus.

---

## 5. app.js — MODULE-BY-MODULE (implement in this order)

Use a single file. Sections below. Cache DOM refs once via `const $ = s => document.querySelector(s)`.

### 5.1 Store
```
let state = { version:1, phrases:[], settings:{ lang: CONFIG.DEFAULT_LANG } };

function genId(){ return (crypto.randomUUID?.() ) || (Date.now()+'-'+Math.random().toString(16).slice(2)); }

function load(){
  try { const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        if(raw){ const p = JSON.parse(raw);
                 if(p && Array.isArray(p.phrases)){ state = { version:1, phrases:p.phrases, settings:{lang:p.settings?.lang||CONFIG.DEFAULT_LANG} }; } } }
  catch(e){ toast("Couldn't read saved data."); state.phrases=[]; }
}
function save(){ try{ localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state)); }catch(e){ toast('Storage full — could not save.'); } }

function newPhrase(input,translation,phonetics){
  return { id:genId(), input:input.trim(), translation:translation.trim(),
           phonetics:(phonetics||'').trim(), mastery:CONFIG.MASTERY_START,
           viewCount:0, gamesSeen:0, gamesCorrect:0, createdAt:Date.now() };
}
function addPhrase(i,t,p){ state.phrases.push(newPhrase(i,t,p)); save(); }
function bulkAdd(arr){ arr.forEach(o=>state.phrases.push(newPhrase(o.input,o.translation,o.phonetics))); save(); }
function updatePhrase(id,patch){ const e=state.phrases.find(x=>x.id===id); if(e){ Object.assign(e,patch); save(); } }
function removePhrase(id){ state.phrases = state.phrases.filter(x=>x.id!==id); save(); }
```

### 5.2 Mastery
```
function clampM(v){ return Math.max(CONFIG.MASTERY_MIN, Math.min(CONFIG.MASTERY_MAX, v)); }
function applyMastery(id, delta){ const e=state.phrases.find(x=>x.id===id); if(!e) return;
  e.mastery = clampM(e.mastery + delta); save(); }
function band(m){ if(m<=CONFIG.BAND_COLD_MAX) return 'cold'; if(m<=CONFIG.BAND_WARM_MAX) return 'warm'; return 'hot'; }
function bandColor(b){ return b==='cold'?'var(--cold)':b==='warm'?'var(--warm)':'var(--hot)'; }
```

### 5.3 Weighted sampling (shuffle + game batches)
```
// weight = 1/(1+mastery); lower mastery => higher chance. Never zero.
function weightedPick(pool, excludeId){
  const cands = (excludeId && pool.length>1) ? pool.filter(p=>p.id!==excludeId) : pool;
  const weights = cands.map(p=>1/(1+p.mastery));
  const total = weights.reduce((a,b)=>a+b,0);
  let r = Math.random()*total;
  for(let i=0;i<cands.length;i++){ r-=weights[i]; if(r<=0) return cands[i]; }
  return cands[cands.length-1];
}
// sample N distinct, weighted, no repeats
function weightedSample(pool, n){
  const copy=[...pool], out=[];
  while(out.length<n && copy.length){ const pick=weightedPick(copy,null);
    out.push(pick); copy.splice(copy.indexOf(pick),1); }
  return out;
}
```

### 5.4 Speech
```
let voices=[], noThai=false;
function loadVoices(){ voices = speechSynthesis.getVoices()||[]; }
loadVoices(); if('speechSynthesis' in window){ speechSynthesis.onvoiceschanged=loadVoices; }
function pickVoice(lang){ return voices.find(v=>v.lang===lang) || voices.find(v=>v.lang?.startsWith(lang.split('-')[0])) || null; }
function speak(text, btn){
  if(!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  const v=pickVoice(state.settings.lang); if(v) u.voice=v; else { u.lang=state.settings.lang; noThai = state.settings.lang.startsWith('th'); }
  u.rate=0.9;
  if(btn){ u.onstart=()=>btn.classList.add('is-speaking'); u.onend=u.onerror=()=>btn.classList.remove('is-speaking'); }
  speechSynthesis.speak(u);
}
```
NOTE: speak() is always called from a tap handler (gesture) — required by iOS.

### 5.5 Navigation (tab bar)
```
function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('is-active', v.dataset.view===name));
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('is-active', t.dataset.target===name));
  if(name==='browse' && !currentBrowseId) doShuffle();
  if(name==='library') renderLibrary();
}
tabbar.addEventListener('click', e=>{ const t=e.target.closest('.tab'); if(t) switchView(t.dataset.target); });
```

### 5.6 Browse view
```
let currentBrowseId=null;
function renderBrowseCard(p){
  const stage=$('#browse-stage');
  if(!p){ stage.innerHTML = `<div class="card card--empty"><p class="card__input">No phrases yet</p><p>Add phrases in Library to begin.</p></div>`;
          $('#btn-shuffle').disabled=true; $('#browse-count').textContent='0'; return; }
  $('#btn-shuffle').disabled=false;
  const b=band(p.mastery), col=bandColor(b);
  stage.innerHTML = `
    <div class="card swap-in" style="--glow:${col}">
      <span class="card__tier">${b}</span>
      <div class="card__input">${esc(p.input)}</div>
      <div class="card__divider"></div>
      <div class="card__translation">${esc(p.translation)}</div>
      <div class="card__phon-row">
        <button class="btn-play" id="play-btn" aria-label="Play pronunciation">▶</button>
        <div class="card__phon">${esc(p.phonetics)||'—'}</div>
      </div>
    </div>`;
  $('#play-btn').onclick=()=>speak(p.translation, $('#play-btn'));
  $('#browse-count').textContent = String(state.phrases.length);
}
function doShuffle(){
  if(!state.phrases.length){ renderBrowseCard(null); return; }
  const old=$('#browse-stage .card');
  const pick=weightedPick(state.phrases, currentBrowseId);
  currentBrowseId=pick.id;
  applyMastery(pick.id, CONFIG.DELTA_BROWSE);   // browse nudge
  pick.viewCount++; save();
  if(old){ old.classList.add('swap-out'); setTimeout(()=>renderBrowseCard(pick), 160); }
  else renderBrowseCard(pick);
}
$('#btn-shuffle').onclick=doShuffle;
```
`esc()` = HTML-escape helper (replace & < > " '). USE IT on every user string inserted via innerHTML.

ACCEPTANCE: Shuffle shows weighted-random card; Play speaks Thai; mastery rises on each landing; glow + tier label match band; immediate-repeat avoided when >1 phrase.

### 5.7 Library view
```
function renderLibrary(){
  const ul=$('#list'); const empty=$('#library-empty');
  if(!state.phrases.length){ ul.innerHTML=''; empty.hidden=false; return; }
  empty.hidden=true;
  ul.innerHTML = state.phrases.map(p=>{
    const b=band(p.mastery);
    return `<li class="list__item" data-id="${p.id}">
      <span class="list__bar" style="--tier-color:${bandColor(b)}"></span>
      <span class="list__text"><span class="list__phrase">${esc(p.input)}</span>
        <span class="list__sub">${b} · ${p.mastery}%</span></span>
      <span class="list__chev">›</span></li>`; }).join('');
}
$('#list').addEventListener('click', e=>{ const li=e.target.closest('.list__item'); if(li) openEditor(li.dataset.id); });
```

### 5.8 Editor sheet (add + edit + delete)
```
let editingId=null;
function openEditor(id){
  editingId=id||null;
  const e = id ? state.phrases.find(x=>x.id===id) : null;
  $('#editor-title').textContent = id ? 'Edit phrase' : 'Add phrase';
  $('#f-input').value       = e?e.input:'';
  $('#f-translation').value = e?e.translation:'';
  $('#f-phonetics').value   = e?e.phonetics:'';
  $('#btn-delete').hidden = !id;
  $('#editor').hidden=false;
}
function closeEditor(){ $('#editor').hidden=true; editingId=null; }
$('#btn-add').onclick=()=>openEditor(null);
$('#btn-cancel').onclick=closeEditor;
$('#editor .sheet__backdrop').onclick=closeEditor;
$('#btn-save').onclick=()=>{
  const i=$('#f-input').value.trim(), t=$('#f-translation').value.trim(), p=$('#f-phonetics').value.trim();
  if(!i||!t){ toast('Phrase and translation are required.'); return; }   // phonetics optional on manual add
  if(editingId){ updatePhrase(editingId,{input:i,translation:t,phonetics:p}); }  // mastery preserved
  else { addPhrase(i,t,p); }
  closeEditor(); renderLibrary();
  if(currentBrowseId===editingId) renderBrowseCard(state.phrases.find(x=>x.id===editingId));
};
$('#btn-delete').onclick=()=>{
  const id=editingId;
  confirmDialog('Delete this phrase?', 'This can’t be undone.', ()=>{
     removePhrase(id); if(currentBrowseId===id){ currentBrowseId=null; }
     closeEditor(); renderLibrary();
     if($('#view-browse').classList.contains('is-active')) doShuffle();
  });
};
```

### 5.9 .txt import (parser — EXACT rules)
```
$('#file-upload').addEventListener('change', async e=>{
  const file=e.target.files[0]; if(!file) return;
  const text=await file.text();
  // Normalize line endings, split into blocks on one-or-more blank lines.
  const blocks = text.replace(/\r\n?/g,'\n').split(/\n[ \t]*\n+/);
  let added=0, skipped=0; const valid=[];
  for(const blk of blocks){
    const lines = blk.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
    if(lines.length===3){ valid.push({input:lines[0], translation:lines[1], phonetics:lines[2]}); added++; }
    else if(lines.length===0){ /* ignore stray blank block */ }
    else { skipped++; }   // missing phonetics OR malformed => reject (per spec)
  }
  if(valid.length) bulkAdd(valid);
  renderLibrary();
  toast(`Added ${added}` + (skipped?` · skipped ${skipped} (bad format)`:''));
  e.target.value='';  // allow re-import of same file
});
```
RULE RESTATEMENT: each entry = exactly 3 non-empty lines (Input / Translation / Phonetics). Entries separated by a blank line. Any block that isn't exactly 3 lines is REJECTED and counted in "skipped". Append to existing list.

### 5.10 Confirm dialog (generic)
```
let confirmCb=null;
function confirmDialog(title,msg,onYes){
  $('#confirm-title').textContent=title; $('#confirm-msg').textContent=msg;
  confirmCb=onYes; $('#confirm').hidden=false;
}
$('#confirm-no').onclick=()=>{ $('#confirm').hidden=true; confirmCb=null; };
$('#confirm .confirm__backdrop').onclick=$('#confirm-no').onclick;
$('#confirm-yes').onclick=()=>{ $('#confirm').hidden=true; if(confirmCb)confirmCb(); confirmCb=null; };
```

### 5.11 Toast
```
let toastT=null;
function toast(msg){ const el=$('#toast'); el.textContent=msg; el.hidden=false; el.classList.remove('out');
  clearTimeout(toastT); toastT=setTimeout(()=>{ el.classList.add('out');
    setTimeout(()=>{ el.hidden=true; el.classList.remove('out'); },300); }, 2200); }
```

### 5.12 Practice hub + game launcher
```
$('#practice-hub').addEventListener('click', e=>{ const t=e.target.closest('.tile'); if(!t) return;
  if(state.phrases.length < CONFIG.GAME_MIN_PHRASES){ toast(`Add at least ${CONFIG.GAME_MIN_PHRASES} phrases to play.`); return; }
  startGame(t.dataset.game);
});
```

### 5.13 GAMES — shared scaffold
- Open `#game` (hidden=false), render setup screen with a stepper (min CONFIG.GAME_MIN_PHRASES … max state.phrases.length, default Math.min(10, length)).
- "Start" → build `session = weightedSample(state.phrases, batchSize)`; score=0; index=0; render first question.
- Each game updates mastery LIVE per answer via applyMastery + increments gamesSeen/gamesCorrect.
- Top bar: ✕ close → confirmDialog('End session?','Your progress so far is saved.', closeGame) IF mid-session, else close directly. Score display "✓ {score}/{answered}".
- After last item → result screen: emoji (≥80% '🎉', ≥50% '👍', else '💪'), "score/total", "Done" → closeGame()+switchView('practice').
- closeGame(): `speechSynthesis.cancel(); $('#game').hidden=true; $('#game').innerHTML='';`

GAME A — Multiple choice:
- prompt = entry.input (label "Translate"). options = entry.phonetics + 3 distractor phonetics from OTHER phrases (random, distinct; if <3 others, pad by relaxing distinctness across whole pool). Shuffle options. On tap: compare; mark .correct/.wrong; also reveal correct; disable all; applyMastery(entry.id, correct?+1:-1); gamesSeen++ (+gamesCorrect if right); score+=correct; setTimeout(next, ADVANCE_MS).

GAME B — Listen & choose:
- prompt = ▶ button auto-plays speak(entry.translation) on render (NOTE: not in a gesture — call once; if iOS blocks, user taps replay). options = entry.input + 3 distractor inputs. Same scoring.

GAME C — Match-up:
- Take next chunk of min(CONFIG.MATCH_PAIRS, remaining) entries. Left col = inputs (data-id), right col = phonetics (data-id), right shuffled. Tap left then right (or vice-versa): if ids match → both `.done`, applyMastery(+1), gamesCorrect++; else flash both `.flash-wrong` (remove after 400ms), applyMastery(-1) on the LEFT (prompt) id. gamesSeen++ per attempt. Round ends when all left `.done`; then either next chunk or result.
- Selection state: first tap adds `.sel`; second tap of same column replaces selection; cross-column triggers compare.

GAME D — Flashcards:
- For each entry: front = input + ▶ Play (gesture → speak translation). Tap card → flip → back = translation + phonetics. Buttons "Didn't" (rate-btn--no) / "Knew it" (rate-btn--yes). Knew→+1 & gamesCorrect++ & score++; Didn't→ -1. gamesSeen++. Advance to next.

ACCEPTANCE per game: cannot start with <4 phrases; mastery changes persist (check Library colors after); ✕ exits cleanly; result screen tallies correctly; speech cancels on exit.

### 5.14 Settings sheet
```
function openSettings(){
  // populate language select from voices (unique langs) + ensure default present
  const sel=$('#set-lang'); const langs=[...new Set(voices.map(v=>v.lang).filter(Boolean))].sort();
  if(!langs.includes(CONFIG.DEFAULT_LANG)) langs.unshift(CONFIG.DEFAULT_LANG);
  sel.innerHTML = langs.map(l=>`<option value="${l}">${l}</option>`).join('');
  sel.value = state.settings.lang;
  $('#lang-note').hidden = !!pickVoice(state.settings.lang);   // show note if no matching voice
  $('#set-stat').textContent = `${state.phrases.length} phrases stored`;
  $('#settings').hidden=false;
}
$('#btn-settings').onclick=openSettings;
$('#btn-close-settings').onclick=()=>{ $('#settings').hidden=true; };
$('#settings .sheet__backdrop').onclick=$('#btn-close-settings').onclick;
$('#set-lang').onchange=e=>{ state.settings.lang=e.target.value; save();
  $('#lang-note').hidden = !!pickVoice(state.settings.lang); };
```
`#lang-note` text: "No voice for this language on this device — playback may sound off."

### 5.15 Backup export/import (JSON, keeps mastery)
```
$('#btn-export').onclick=()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  const d=new Date().toISOString().slice(0,10).replace(/-/g,'');
  a.href=url; a.download=`baat-backup-${d}.json`; a.click(); URL.revokeObjectURL(url);
  toast('Backup downloaded.');
};
$('#btn-import-trigger').onclick=()=>$('#import-file').click();
$('#import-file').addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{ const data=JSON.parse(await f.text());
    if(!data||!Array.isArray(data.phrases)) throw 0;
    confirmDialog('Import backup?', 'New phrases will be merged into your library.', ()=>{
      const existing=new Set(state.phrases.map(p=>p.id));
      data.phrases.forEach(p=>{ if(!existing.has(p.id)) state.phrases.push(p); });
      if(data.settings?.lang) state.settings.lang=data.settings.lang;
      save(); renderLibrary(); toast('Backup imported.');
    });
  }catch(err){ toast('That file isn’t a valid Baat backup.'); }
  e.target.value='';
});
```
MERGE rule: add phrases whose id is not already present (preserves mastery from file). Do not delete existing.

### 5.16 init
```
function init(){
  load();
  registerSW();
  renderLibrary();
  switchView('browse');   // will auto-shuffle if phrases exist
}
document.addEventListener('DOMContentLoaded', init);
```

---

## 6. manifest.json (exact)
```json
{
  "name": "Baat",
  "short_name": "Baat",
  "description": "A personal Thai phrase trainer.",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b0b12",
  "theme_color": "#4f46e5",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## 7. sw.js (minimal cache-first)
```js
const CACHE='baat-v1';
const ASSETS=['./','./index.html','./style.css','./app.js','./manifest.json',
  './icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-512-maskable.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET') return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
    const cp=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return res;
  }).catch(()=>caches.match('./index.html')))); });
```
Register in app.js:
```js
function registerSW(){ if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); } }
```
NOTE: bump CACHE name (baat-v2…) whenever assets change.

## 8. icons/ — generate with Python Pillow (build step)
Indigo gradient rounded square + white Thai "บ" centered. Script (run once, commit PNGs):
```python
from PIL import Image, ImageDraw, ImageFont
def make(sz, maskable=False):
    img=Image.new('RGB',(sz,sz),'#4f46e5'); d=ImageDraw.Draw(img)
    for y in range(sz):  # vertical gradient #4f46e5 -> #6d28d9
        t=y/sz; r=int(0x4f+(0x6d-0x4f)*t); g=int(0x46+(0x28-0x46)*t); b=int(0xe5+(0xd9-0xe5)*t)
        d.line([(0,y),(sz,y)],fill=(r,g,b))
    try: f=ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf', int(sz*0.6))
    except: f=ImageFont.load_default()
    d.text((sz/2,sz/2),'บ',font=f,fill='white',anchor='mm')
    return img
for s in (180,192,512): make(s).save(f'icons/icon-{s}.png')
make(512,True).save('icons/icon-512-maskable.png')
```
If Noto Thai font absent, install `fonts-noto` or fall back to any Thai-capable TTF; the glyph U+0E1A must render.

## 9. sample.txt (ship this example)
```
Hello
สวัสดี
sa-wat-dee

Thank you
ขอบคุณ
khop-khun

How much is this?
อันนี้เท่าไหร่
an-nee tao-rai
```

## 10. README.md (sections, in order)
1. **Baat** — one-line description + screenshot placeholder.
2. **What it does** — browse, library, 4 practice games, mastery coloring, offline, Thai speech.
3. **Fork & deploy** — Fork repo → Settings → Pages → Source: deploy from branch `main` / root → wait for URL.
4. **Add to iPhone Home Screen** — open the Pages URL in Safari → Share → Add to Home Screen → launch from icon (runs full-screen, offline).
5. **Add phrases** — Library tab → + to add one, or Import .txt. Explain the **.txt format**: 3 lines per entry (phrase / translation / phonetics), blank line between entries (link sample.txt).
6. **Practice & mastery** — explain cold→warm→hot, that browsing and games both move mastery, ±1 per event.
7. **Backup** — Settings → Export backup (JSON, keeps mastery) / Import backup (merges).
8. **Change speech language** — Settings → Speech language (default Thai; note iOS must have the voice).
9. **Privacy** — all data stays in your browser (localStorage); no servers, no tracking.

---

## 11. FINAL ACCEPTANCE CHECKLIST (agent must verify all)
- [ ] Loads offline after first visit (airplane mode, relaunch from Home Screen).
- [ ] Add to Home Screen launches standalone (no Safari chrome).
- [ ] Add / edit / delete phrase works; delete asks confirmation; edit keeps mastery.
- [ ] Import .txt: valid 3-line entries appended; malformed counted as skipped; toast reports counts.
- [ ] Browse: weighted shuffle, no immediate repeat (>1), Play speaks Thai, glow+tier match band, mastery rises per landing.
- [ ] Library row color bar reflects band; sub shows "band · N%".
- [ ] Each of 4 games: blocked under 4 phrases; batch picker works; live scoring; mastery persists; speech stops on exit; result screen correct.
- [ ] Settings: language list populates; note shows when no matching voice; export downloads JSON; import merges.
- [ ] Dark + light both polished at 375 / 390 / 430px; reduced-motion respected; all targets ≥44px; textareas don't zoom (16px).
- [ ] No console errors. All user strings escaped (no HTML injection from phrases).
