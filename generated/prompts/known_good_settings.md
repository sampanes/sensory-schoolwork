# Known Good ComfyUI Image Settings

Status:
Template only. A probe image has not been approved yet.

Workflow:
Q:\AI\Repos\lyric-video\workflows\comfyui\node-graphs\basic_flux_t2i.api.json

Date tested:
Not tested yet.

Prompt pattern:
friendly classroom illustration, bright colors, clean shapes, soft lighting, kid-safe, educational worksheet style. Visual subject: {description}. Sentence meaning for context only, not text to display: {solution_sentence}. Do not include words, letters, captions, labels, numbers, signs, or readable text in the image.

Negative prompt:
words, letters, captions, labels, numbers, watermark, logo, scary, photorealistic faces, complex hands, extra fingers, clutter

Current workflow note:
The current `basic_flux_t2i.api.json` workflow does not expose a negative prompt text node. The wrapper records this negative prompt in metadata, but omits `--negative-prompt` unless the workflow is updated to include a negative text node.

Size:
1024x1024

Seed policy:
Use a fixed seed while testing. Use varied seeds only after the style is approved.

Probe output location:
generated/images/comfyui/probes/

Bulk output location:
generated/images/comfyui/bulk/

Notes:
- Start with `python .\scripts\comfyui_bulk_images.py probe --dry-run`.
- Generate exactly one probe image and approve the style before bulk generation.
- The sentence is context for the visual, not text to render in the image.
