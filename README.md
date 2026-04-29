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

## ComfyUI Bulk Image MVP

This project does not include ComfyUI, models, or a separate Python environment. It uses the existing helper repo at `Q:\AI\Repos\lyric-video` and its `scripts\comfyui_server.py` and `scripts\comfyui_queue.py` adapters.

First check or start the local ComfyUI API server from PowerShell:

```powershell
cd Q:\AI\Repos\lyric-video
python scripts\comfyui_server.py status
```

If it is not running:

```powershell
cd Q:\AI\Repos\lyric-video
python scripts\comfyui_server.py start --root "C:\AI\ComfyUI_portable"
```

Then run the probe dry-run from this repo:

```powershell
# From this repository root:
python .\scripts\comfyui_bulk_images.py probe --dry-run
```

If the dry-run command looks right and ComfyUI is running, generate exactly one probe image:

```powershell
python .\scripts\comfyui_bulk_images.py probe
```

Probe images download to `generated\images\comfyui\probes\`. Each downloaded image gets the helper `.comfyui.json` sidecar plus this project's `.prompt.json` sidecar with the prompt, sentence, description, seed, dimensions, workflow, and command metadata.

Only after the probe style/settings are approved, dry-run a small bulk batch from `generated\prompts\image_jobs.csv`:

```powershell
python .\scripts\comfyui_bulk_images.py bulk --dry-run --limit 3
```

Then queue the same limited batch:

```powershell
python .\scripts\comfyui_bulk_images.py bulk --limit 3
```

Bulk images download to `generated\images\comfyui\bulk\`. The CSV columns are `id`, `sentence`, `description`, `width`, `height`, and `seed`. The script uses `description` as the visual subject and uses `sentence` only as scene context; by default it also tells the image model not to render words, captions, labels, numbers, signs, or readable text.

The current `basic_flux_t2i.api.json` workflow does not expose a negative prompt text node, so the wrapper records the negative prompt in sidecar metadata but omits `--negative-prompt` unless the workflow is updated to support it.

## Build And Deploy

```bash
npm run build
```

GitHub Pages deployment is handled by `.github/workflows/deploy.yml`. On push to `main` or `master`, GitHub Actions installs dependencies, builds the site, and deploys the generated `dist` output.
