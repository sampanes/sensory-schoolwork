# Sensory Schoolwork

Sensory Schoolwork is a browser-based practice site for a first grader. It is designed for phone or tablet use with a stylus and currently includes handwriting math, handwriting spelling, and A-maze-ing sentences.

Live site: https://sampanes.github.io/sensory-schoolwork/

## What It Is

This site has three main activities:

- `Handwriting math`: solve vertical addition and subtraction problems by writing digits in answer boxes.
- `Handwriting spelling`: hear a word, write it one letter at a time, and optionally hear it used in a sentence.
- `A-maze-ing sentences`: trace through a word grid to build the hidden sentence.

There is also a `Configurations` page for changing math setup and spelling voice settings.

Everything runs in the browser. The app is built with React, TypeScript, and Vite, and GitHub Pages deploys it automatically from the repository.

## How To Navigate

Start on the home page and tap one of the three activity cards.

- `/` shows the home page with links to all activities.
- `/#/math` opens handwriting math.
- `/#/spelling` opens handwriting spelling.
- `/#/sentences` opens A-maze-ing sentences.
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

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Build And Deploy

```bash
npm run build
```

GitHub Pages deployment is handled by `.github/workflows/deploy.yml`. On push to `main` or `master`, GitHub Actions installs dependencies, builds the site, and deploys the generated `dist` output.
