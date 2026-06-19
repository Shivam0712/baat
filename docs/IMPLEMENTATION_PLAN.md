# Baat — Implementation Plan (last-mile)

> Companion to SPEC.md. This is the build blueprint: architecture, files, data, every behavior, and the build order. Flagged assumptions marked 🟡 — veto any line.

---

## 0. Tuning constants (single source of truth — top of app.js)

```js
const CONFIG = {
  MASTERY_MIN: 0,
  MASTERY_MAX: 100,
  MASTERY_START: 0,
  DELTA_CORRECT: +1,        // game correct  (locked)
  DELTA_WRONG:   -1,        // game wrong    (locked)
  DELTA_BROWSE:  +1,        // shuffle lands on entry 🟡 assumption
  BANDS: { coldMax: 33, warmMax: 66 },   // 0–33 cold, 34–66 warm, 67–100 hot
  SAMPLE_WEIGHT: m => 1 / (1 + m),        // shuffle weighting
  GAME_MIN_PHRASES: 4,      // min collection size to play (3 distractors + 1) 🟡
  DEFAULT_LANG: 'th-TH',    // Thai
  STORAGE_KEY: 'baat.v1',
};
```
🟡 **Tuning note:** with ±1 on a 0–100 scale, Hot takes ~67 net-correct events. Kept exactly as specified; retune by editing constants above if it feels slow.

---

## 1. Architecture

- **Single page**, three views toggled by a bottom tab bar; no router/framework.
- **Vanilla JS**, one `app.js`, organized in clear modules (IIFE or plain namespaced sections):
  `Store` · `Mastery` · `Speech` · `Browse` · `Library` · `Practice/Games` · `Editor` · `Backup` · `UI/toast` · `init`.
- **No CDN libs needed** (speech, storage, file APIs are native). Keeps it lean + offline.
- **State** = one in-memory array `phrases[]`, mirrored to localStorage on every mutation (debounced where noisy).

### Files
```
index.html        app shell, 3 views, tab bar, modals (editor/confirm), game overlay, toast
style.css         iOS-premium styling, auto dark mode, temperature palette
app.js            all logic
manifest.json     PWA manifest
icons/            icon-180.png (apple touch), icon-192.png, icon-512.png, maskable
README.md         fork → Pages → Home Screen
sample.txt        example import file (3-line entries, blank-line separated)
```
🟡 No service worker strictly required (Safari caches static + add-to-home works), but I'll add a **minimal SW** to make offline rock-solid and silence the "not installable" edge. Cache-first on the shell.

---

## 2. Data layer (`Store`)

- `phrases` = array of:
  ```js
  { id, input, translation, phonetics, mastery, viewCount, gamesSeen, gamesCorrect, createdAt }
  ```
- `id`: `crypto.randomUUID()` (fallback to timestamp+rand).
- Persisted under `CONFIG.STORAGE_KEY` as `{ version:1, phrases, settings }`.
- `settings = { lang: 'th-TH' }`.
- API: `load()`, `save()`, `add(entry)`, `update(id, patch)`, `remove(id)`, `all()`, `bulkAdd(entries)`.
- All writes → `save()` immediately (data must survive restart).
- Corruption guard: wrap JSON.parse in try/catch; on failure keep empty + toast "Couldn't read saved data."

---

## 3. Mastery engine (`Mastery`)

- `apply(id, delta)` → clamp to [0,100], persist.
- `band(m)` → 'cold' | 'warm' | 'hot' via CONFIG.BANDS.
- `tierColor(band)` → CSS var (--cold/--warm/--hot).
- Hooks: Browse shuffle → `apply(id, DELTA_BROWSE)`; game answer → `apply(id, correct?DELTA_CORRECT:DELTA_WRONG)`.
- `gamesSeen/gamesCorrect` incremented alongside for stats display.

---

## 4. Speech (`Speech`)

- `speak(text, lang=settings.lang)`:
  - `speechSynthesis.cancel()` then speak new utterance (prevents overlap).
  - Pick a voice matching `lang` from `getVoices()`; iOS populates async → cache on `voiceschanged`.
  - **No matching voice** → speak with default voice + set a one-time flag so Settings shows "No Thai voice on this device."
  - Button gets `.is-speaking` during playback (onstart/onend).
- 🟡 iOS quirk: first `speak()` must be inside a user gesture — it always is (Play button), so fine.

---

## 5. VIEW ONE — Browse

- Layout: top bar (Baat + count), centered **card**, **Shuffle** button above tab bar.
- Card shows: Input (large), divider, Translation (target script), Phonetics row with **▶ Play** in front + tier label/glow tinted by mastery band.
- **Shuffle:** weighted pick using `SAMPLE_WEIGHT(mastery)`; avoid immediate repeat of current id when collection > 1; animate swap-out/swap-in; on land → `Mastery.apply(id, +1)` + viewCount++ + re-render Library tints lazily.
- **Empty state:** card invites "Add phrases in Library to start."
- First load with data → auto-show one weighted pick (so it's never blank).

---

## 6. VIEW TWO — Library

- Top bar: "Library" + **＋** (add).
- Tools row: **Import .txt** (file input) + Cold/Warm/Hot legend.
- **List:** each row = left mastery **color bar** (tier), Input (truncated), small sub (mastery % or band), chevron. ≥44px tall.
- Tap row → opens **Editor sheet** prefilled (edit mode).
- **＋** → Editor sheet blank (add mode).
- **Editor sheet** (bottom sheet): 3 textareas (Input / Translation / Phonetics) + Save + Cancel; in edit mode also **Delete** → **confirm dialog** → remove. Mastery preserved on edit (per spec).
- Validation: Input + Translation required; Phonetics optional in manual add 🟡 (txt import still rejects missing-phonetics per spec — manual entry is more forgiving since user is present).
- **Import .txt parser:**
  - Split file on blank line(s) into blocks; each block = exactly 3 non-empty lines (Input/Translation/Phonetics), trimmed.
  - Block with <3 lines (missing phonetics or more) → **rejected**, counted.
  - On finish → `bulkAdd(valid)` (append), toast: "Added N · skipped M (bad format)."
  - Tolerant of trailing whitespace, CRLF, multiple blank lines, trailing newline.
- **Empty state** when no phrases.

---

## 7. VIEW THREE — Practice (hub + 4 games)

- **Hub:** 2×2 grid of tiles (Match-up, Multiple choice, Listen & choose, Flashcards).
- Tap tile → if `phrases.length < GAME_MIN_PHRASES` → toast "Add at least 4 phrases to play" and stay. Else open **game overlay**.
- **Game overlay** (full-screen): close (✕), live score, body, result screen.
- **Session setup:** stepper to choose batch size (min 4 / max = collection size, default min(10, size)); "Start".
- **Session entries:** sample `batchSize` phrases weighted toward low mastery (same SAMPLE_WEIGHT), no dupes within session.

### 7a. Multiple choice
- Prompt = Input. 4 options = phonetics (1 correct + 3 distractors from other phrases). Tap → mark correct/wrong, lock, `Mastery.apply`, auto-advance ~700ms. Score++.

### 7b. Listen & choose
- Prompt = ▶ auto-plays target speech (replayable). 4 options = Inputs. Same scoring as 7b.

### 7c. Match-up
- 5 pairs/round (or fewer if batch small): left col = Inputs, right col = phonetics (shuffled). Tap one then the other → match: both fade/disable + `apply(+1)`; mismatch: shake + `apply(-1)`. Round done when all paired.

### 7d. Flashcards
- Card front = Input + ▶ Play. Tap → flip → Translation + Phonetics + "Knew it / Didn't." 🟡 self-rate counts as normal answer (+1/−1). Next card.

### Result screen
- Emoji + score (correct/total) + "Done" (back to hub). Per-answer mastery already applied live.

---

## 8. Backup (`Backup`)

- **Export:** serialize `{version, phrases, settings}` → download `baat-backup-YYYYMMDD.json` (Blob + anchor). 🟡 JSON not txt (preserves mastery); .txt import still supported separately for phrase-only.
- **Import backup:** file picker → parse → replace-or-merge prompt 🟡 (default: merge by id, append new). Confirm before replace.
- Lives in **Settings**.

---

## 9. Settings

- 🟡 **Placement:** gear icon in the Library top bar (least intrusive; Browse stays clean). Opens a sheet.
- Contents: **Speech language** (dropdown of available `getVoices()` langs, default Thai + warning if absent) · **Export backup** · **Import backup** · phrase count / storage note.

---

## 10. PWA / offline

- `manifest.json`: name "Baat", short_name "Baat", display standalone, theme/background colors (indigo / near-black? 🟡 light bg #f5f5f7, set theme to accent), icons 192/512 + maskable.
- `index.html` meta: viewport (viewport-fit=cover), apple-mobile-web-app-capable, status-bar-style, apple-touch-icon 180.
- **Service worker:** precache shell (html/css/js/icons/manifest); cache-first; bump cache name on change. Registered after load, fails silently if unsupported.
- Everything works with zero network.

---

## 11. Icons

- Generate programmatically (no external assets): rounded-square indigo gradient + a stylized speech/“บ” or chat-bubble glyph 🟡. Sizes: 180 (apple), 192, 512, 512-maskable. Tooling: Python Pillow in build step, output to icons/.

---

## 12. Accessibility / quality floor

- All tap targets ≥44px. Visible focus states. `prefers-reduced-motion` respected. `prefers-color-scheme` both polished. aria-labels on icon buttons; dialogs use role + aria-modal; toast polite.

---

## 13. Build order

1. Scaffold repo + manifest + meta + empty modules.
2. Store + Mastery + seed sample data path.
3. Library (list, editor, add/edit/delete+confirm, txt import).
4. Browse (card, play, weighted shuffle, mastery hook).
5. Practice hub + 4 games + result.
6. Settings (lang + backup export/import).
7. Service worker + icon generation.
8. Self-review pass on iPhone widths (375/390/430) light+dark; fix; README + sample.txt.

---

## 14. Open / flagged (🟡) — veto any

- Browse nudge = +1; flashcard self-rate = ±1; game min = 4 phrases.
- Manual add allows blank phonetics (import still rejects).
- Backup format = JSON (separate from .txt phrase import).
- Backup import default = merge (not replace).
- Settings = gear in Library top bar.
- Minimal service worker added.
- Icon glyph design (Thai บ vs chat bubble).
- ±1 tuning kept as specified despite slow climb to Hot.
