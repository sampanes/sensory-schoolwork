# ComfyUI Bulk Image MVP

`comfyui_bulk_images.py` is a Python helper for batch-generating puzzle hint images via a local ComfyUI server. It is independent of the React app and not bundled with the site build.

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

`--limit 3` is only for small test batches. After the probe style/settings are approved, omit `--limit` to process every row in the CSV:

```powershell
python .\scripts\comfyui_bulk_images.py bulk
```

To process every sentence puzzle directly from `src\apps\sentences\data\puzzles.json`, using each puzzle's `image_description` and `solution_sentence`:

```powershell
python .\scripts\comfyui_bulk_images.py bulk --dry-run --puzzles-json
python .\scripts\comfyui_bulk_images.py bulk --puzzles-json
```

Bulk images download to `generated\images\comfyui\bulk\`. The CSV columns are `id`, `sentence`, `description`, `width`, `height`, and `seed`. The script uses `description` as the visual subject and uses `sentence` only as scene context; by default it also tells the image model not to render words, captions, labels, numbers, signs, or readable text.

The current `basic_flux_t2i.api.json` workflow does not expose a negative prompt text node, so the wrapper records the negative prompt in sidecar metadata but omits `--negative-prompt` unless the workflow is updated to support it.
