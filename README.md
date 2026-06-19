# Baat

A personal phrase translation trainer that lives in your browser. No servers, no accounts — just you and your phrases.

---

## What it does

- **Browse** — flip through your phrases one at a time; tap ▶ to hear the pronunciation.
- **Library** — manage all your phrases; color-coded Cold → Warm → Hot by mastery level.
- **Practice** — four games to build fluency:
  - **Match-up** — pair phrases to their romanized pronunciation.
  - **Multiple choice** — pick the correct phonetics.
  - **Listen & choose** — hear the phrase and identify it.
  - **Flashcards** — flip and self-rate.
- **Mastery tracking** — every browse and game result nudges a 0–100 mastery score. Colors update live.
- **Fully offline** — works with no internet after the first visit.
- **Speech synthesis** — built-in device speech (no API key needed). Configure the target language in Settings.

---

## Fork & deploy

1. Fork this repo on GitHub.
2. Go to **Settings → Pages**.
3. Under *Source*, choose **Deploy from a branch** → branch `main` → folder `/` (root).
4. Wait ~1 minute, then open the URL shown (e.g. `https://yourname.github.io/baat`).

---

## Add to iPhone Home Screen

1. Open the Pages URL in **Safari** on iPhone.
2. Tap the **Share** icon → **Add to Home Screen**.
3. Tap **Add**.
4. Launch the app from your home screen — it runs full-screen, offline.

---

## Add phrases

**One at a time:** Library tab → tap **+** → fill in Phrase, Translation, Phonetics, Note → Save.

**Bulk import `.txt`:** Library tab → tap **Import .txt** → pick your file.

### .txt format

Four labeled fields per entry, blank line between entries:

```
English: Hello
Translation: สวัสดี
Phonetics: sa-wat-dee
Note: Used when greeting someone

English: Thank you
Translation: ขอบคุณ
Phonetics: khop-khun
Note: Add a polite particle at the end for a more formal form
```

- `English:` — the source phrase
- `Translation:` — the target script or word
- `Phonetics:` — romanized pronunciation
- `Note:` — optional usage note

Entries missing English, Translation, or Phonetics are skipped. See [sample.txt](sample.txt) for a full example.

---

## Practice & mastery

Each phrase has a **mastery score** from 0 to 100, starting at 0.

| Color | Range | Meaning |
|-------|-------|---------|
| 🔵 Cold | 0–33 | Needs work |
| 🟡 Warm | 34–66 | Learning |
| 🔴 Hot  | 67–100 | Learned |

- **Browsing** a phrase: +1 mastery.
- **Game correct** / **Flashcard "Knew it"**: +1 mastery.
- **Game wrong** / **Flashcard "Didn't"**: −1 mastery.

Mastery is clamped to 0–100 and never excluded from shuffle — high-mastery entries just appear less often.

---

## Backup

**Settings → Export backup** — downloads a JSON file containing all phrases and mastery scores.

**Settings → Import backup** — merges phrases from a backup file (new IDs only; existing phrases are not overwritten).

---

## Change speech language

**Settings → Speech language** — select any language your device supports. Note: iOS uses the voices installed on the device; if no matching voice is found, playback may sound off.

---

## Privacy

All data is stored in your browser's `localStorage`. Nothing is sent to any server. No tracking, no analytics, no accounts.
