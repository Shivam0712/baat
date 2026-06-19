# Translator App — Living Spec

> Working document. Captures decisions as we make them. ✅ = decided · ❓ = open · 💡 = note

---

## 1. Project ground rules (locked)

- **Hosting:** GitHub Pages (static only, no backend).
- **Stack:** Single-page HTML + vanilla JS + CSS. CDN libs allowed, kept light.
- **Storage:** `localStorage` primary. Optional Google Sheets sync via Apps Script (backup/restore only).
- **Target:** iPhone Safari, 375–430px. Mobile-first, touch-friendly (≥44px targets).
- **PWA:** `manifest.json`, Apple touch icon 180×180, `apple-mobile-web-app-capable`, status bar meta, standalone launch.
- **Offline:** ✅ **Fully offline.** No translation API — user supplies translation + phonetics. Only optional network = Sheets sync.
- **Design:** Minimalist, premium iOS feel. Generous whitespace, system fonts, restrained color, subtle motion. Auto dark mode via `prefers-color-scheme`, both modes polished.
- **Persistence:** All data survives restarts. Destructive actions require confirmation.
- **Deliverables:** `index.html`, `style.css`, `app.js`, `manifest.json`, `icons/`, `README.md`.

---

## 2. Concept

✅ A personal **phrase collection** the user builds, then browses one-at-a-time.
✅ Two views: **View One** (browser) + **View Two** (library/manager).
✅ ~~Online translation API~~ **dropped** — app is fully offline; user provides all data.

### Data model (per entry)
```
{ id, input, translation, phonetics, viewCount, mastery, gamesSeen, gamesCorrect }
```
Stored as an array in `localStorage`.
- **`mastery`** = THE signal. Drives shuffle sampling, View Two coloring, and game selection.
  - Raised by **both** View One browsing (gentle nudge) **and** games (stronger).
  - 💡 Formula (default): rolling score; game correct +1, game wrong −1.5, browse +0.25; clamped to a range. 3 bands (cold/warm/hot) cut from this score.
- **`viewCount`** = cosmetic stat only (shown as a count); no longer steers anything.
- **Editing** a phrase's text → **mastery carries over** (not reset).
- **Shuffle sampling:** weighted random, weight ∝ 1/(1 + mastery), normalized across collection. Nothing ever excluded — high-mastery entries just appear less often, never zero.

---

## 3. View One — Browser

✅ Displays ONE entry at a time, three stacked fields (display, not input):
  1. **Input phrase** (source)
  2. **Translated phrase** (target script)
  3. **Phonetics + ▶ Play**
✅ **▶ Play** = iOS `SpeechSynthesis`, target voice, offline.
✅ **Shuffle button** (bottom) → swaps to a new entry, **weighted toward low-mastery** (weight ∝ 1/(1+mastery)); never excludes any entry.
✅ Showing an entry **nudges its mastery up gently** + increments viewCount.

---

## 4. View Two — Library / Manager

✅ A **list** of all entries; each row shows **Input only**.
✅ Tap a row → expand to **view/edit all three fields** (Input, Translation, Phonetics).
  - In the expanded view: **Save** + **Delete** buttons.
  - **Delete → confirm dialog** before removing.
✅ **"+" button** → manually add one entry (type/paste Input, Translation, Phonetics).
✅ **Bulk upload `.txt`:**
  - Format: 3 lines per entry (Input / Translation / Phonetics), **blank line between entries**.
  - On upload → **append** to existing list.
  - Entry **missing the phonetics line → rejected, warn the user** (report which/how many were skipped).
✅ **Color coding** = **mastery** (from games): **Cold → Warm → Hot** = needs work → learning → learned. (Not raw view count.)

❓ Color thresholds (e.g. 0 = cold / 1–4 = warm / 5+ = hot) — TBD, will use sensible defaults.
❓ Edit row: also allow **delete** (with confirmation)? Assumed yes.
❓ txt parser tolerance: trim whitespace, ignore multiple blank lines between entries — assumed yes.

---

## 5. View Three — Games / Practice

✅ **Hub of 4 game tiles** — pick one to play:
  1. **Match-up** — pair a column of Inputs with shuffled Phonetics (tap-to-pair).
  2. **Multiple choice** — show Input, pick correct Phonetics from options.
  3. **Listen & choose** — ▶ plays target speech, pick the matching Input.
  4. **Flashcard flip** — Input front, flip to reveal Phonetics + Play; self-rate.
✅ Goal: learn the **Input ↔ Phonetics** mapping.
✅ **Session entries:** user picks a **batch size**; batch filled **favoring cold / less-mastered** entries, random among ties.
✅ **Progress tracking:**
  - **Score / streak** shown per session.
  - Results **feed mastery** → updates View Two cold→hot coloring.

❓ Default batch size (suggest 10).
❓ Self-rate in flashcards: does "I knew it / didn't" count toward mastery like the other games? (Assume yes.)

---

## 6. Resolved / dropped

- ✅ Input field in View One = display only (not typed).
- ✅ No live translation; fully offline.
- ✅ Upload appends (not replace).
- ✅ Missing-phonetics entries rejected with warning.
- ✅ Edit/Delete inside expanded row; delete confirmed.
- ✅ Two signals: viewCount (exposure) + mastery (learning). **Coloring = mastery.**
- ✅ Games: all 4, hub layout.

---

## 8. Audio, backup & settings

✅ **▶ Play / target speech:** iOS `SpeechSynthesis`, **default language Thai**, **changeable in Settings**.
  - 💡 If device has no Thai voice, fall back gracefully + small note (Safari can't install voices).
✅ **Export / Import backup:** manual download of all phrases (+ mastery) as a file, re-importable. Safety hatch since data is local-only with no sync.
✅ **Game distractors:** wrong options drawn from the user's own list. If collection too small, guard with a "need at least N phrases" message.

❓ Where Settings lives (gear icon in a top bar? within a view?) — micro-decision, non-blocking.

---

## 9. Final decisions

- ✅ **Name:** Baat
- ✅ **View One shuffle:** weighted toward cold / less-mastered (study aid).
- ✅ **Navigation:** bottom tab bar, 3 icons.
- ✅ **Sheets sync:** dropped. Fully local, zero network.
- ✅ **Game batch size:** chosen in-app each session.
- ✅ **Mastery coloring:** 3 bands — Cold / Warm / Hot.
- ✅ **Vibe:** calm indigo/blue base + warm accent; mastery = temperature scale (cool slate → amber → warm coral).
