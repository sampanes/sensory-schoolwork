# Sensory Schoolwork

Sensory Schoolwork is a browser-based practice site for an early grade-schooler. It is designed for phone or tablet use and includes handwriting math, handwriting spelling, A-maze-ing sentences, and Sound It Out reading practice.

Live site: https://sampanes.github.io/sensory-schoolwork/

## What It Is

This site has four main activities:

- `Handwriting math`: solve vertical addition and subtraction problems by writing digits in answer boxes.
- `Handwriting spelling`: hear a word, write it one letter at a time, and optionally hear it used in a sentence.
- `A-maze-ing sentences`: trace through a word grid to build the hidden sentence.
- `Sound It Out`: practice decoding word families, then reveal a picture and hear the whole word.

There is also a `Configurations` page for changing math setup and spelling voice settings.

## Grade Levels

The home page has a level switch (`K`, `1`, `2`). Content is tagged with the grade it is
*introduced* in, and the switch is cumulative: at grade 2 the child still sees everything from
K and grade 1, because review is the point. Anything above the active level is hidden, so a
second-grade addition never adds a card to a first grader'"'"'s home screen.

The choice is stored in `localStorage` under `app.grade` and defaults to grade 1. The rule
itself lives in [src/utils/gradePreferences.ts](src/utils/gradePreferences.ts).

Where the grade tag lives per activity:

- `Activities` (the home page cards): the `grade` field in `src/pages/HomePage.tsx`. Sound It
  Out is grade 0, so it stays available at every level.
- `Spelling banks`: the `grade` field on each bank in `src/apps/spelling/banks/`.
- `Sentence mazes`: the optional `grade` field on each puzzle. Absent means grade 1.
- `Math`: not tagged. Difficulty is already a range on the `Configurations` page.

Everything runs in the browser. The app is built with React, TypeScript, and Vite, and GitHub Pages deploys it automatically from the repository.

## How To Navigate

Start on the home page and tap one of the four activity cards.

- `/` shows the home page with links to all activities.
- `/#/math` opens handwriting math.
- `/#/spelling` opens handwriting spelling.
- `/#/sentences` opens A-maze-ing sentences.
- `/#/reading` opens the Sound It Out word-family chooser.
- `/#/configurations` opens the configuration screen.

The `Configurations` page is the place to adjust the math round setup and the spelling voice without changing code.

## How To Add Words, Problems, Or Sentences

### Add spelling words

Edit [src/apps/spelling/spellingWords.ts](src/apps/spelling/spellingWords.ts).

Each entry looks like this:

```ts
{ word: "cat", sentence: "The cat took a nap on the warm step." }
```

Add or remove objects in `SPELLING_WORDS` and the spelling app will use that list.

For a whole word list, add a bank in [src/apps/spelling/banks/](src/apps/spelling/banks/) instead,
give it a `grade`, and register it in `banks/index.ts`. Banks appear on the `Configurations`
page as one-tap buttons that load the list into the custom-list editor.

### Change math problems

Math problems are generated from rules rather than stored as a fixed list.

Edit [src/apps/math/mathProblems.ts](src/apps/math/mathProblems.ts) if you want to change:

- default operand ranges
- addition or subtraction availability
- round length defaults
- generation behavior

For day-to-day use, you can also change the current math setup from the in-app `Configurations` page.

### Add sentence mazes

Edit [src/apps/sentences/data/puzzles.json](src/apps/sentences/data/puzzles.json).

Each puzzle contains:

- a `puzzle_id`
- an `image_description`
- a `grid`
- a `solution_sentence`
- a `solution_words` list
- a `solution_cells` path

The sentences app reads that JSON file directly.

A puzzle may also carry a `grade`; leaving it out means grade 1. Append higher-grade puzzles to
the END of the array. Progress is saved as an index into the filtered list, so inserting one in
the middle would shift every later index and scramble which puzzles are already complete.

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Puzzle Hint Image Generator

There is a Python helper at `scripts/comfyui_bulk_images.py` for batch-generating puzzle hint images via a local ComfyUI server. It is a dev-tool, not part of the site build. See [scripts/README.md](scripts/README.md) for setup and usage.

## Build And Deploy

```bash
npm run build
```

GitHub Pages deployment is handled by `.github/workflows/deploy.yml`. On push to `main` or `master`, GitHub Actions installs dependencies, builds the site, and deploys the generated `dist` output.
