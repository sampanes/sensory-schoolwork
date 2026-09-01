# ARASAAC pictograms

The 36 PNGs in this directory are the artwork for the Sound It Out reading
activity. They are bundled locally on purpose: the application must not fetch
artwork at runtime, so it keeps working on a phone with no signal.

## Attribution

ARASAAC pictograms are created by [Sergio Palao](https://www.palao.es/) for the
Government of Aragon and distributed by [ARASAAC](https://arasaac.org/) under a
[Creative Commons BY-NC-SA license](https://arasaac.org/terms-of-use).

Attribution: **Pictograms author: Sergio Palao. Origin: ARASAAC
(https://arasaac.org). License: CC (BY-NC-SA). Owner: Government of Aragon
(Spain).**

This is a non-commercial personal project, which is what the NC term requires.

## Contents

One PNG per word, named `<word>.png`. `manifest.json` maps each word to its
filename, its pixel size and its ARASAAC pictogram ID, so any image can be
traced back to the source or re-downloaded.

The files are the 500x500 originals cropped to their artwork bounds. The
sources average only about 60 percent content -- `log.png` had 151px of
transparent space above and below the drawing -- and that padding is invisible
but still occupies layout space, which pushed the word away from the picture in
the deck. Cropping is done in the original palette mode, so the whole set is
smaller after the crop (447 KB) than before it (701 KB). Transparency is
preserved; the deck never draws a border or plate behind a pictogram.

Each pictogram was chosen by eye rather than by taking the first search hit,
because several of these words return the wrong sense by default:

| Word | Meaning chosen | Why it needed care |
| ---- | -------------- | ------------------ |
| bat  | the animal     | search leads with the baseball bat |
| can  | metal tin can  | competes with the verb "can" |
| tin  | metal tin      | deliberately a different tin from `can.png` |
| tap  | faucet         | competes with "tap on the back" |
| fan  | electric fan   | competes with the handheld folding fan |
| ram  | male sheep     | -- |
| jam  | fruit spread   | competes with "traffic jam" |
| yam  | the vegetable  | -- |
| pin  | straight pin   | competes with bowling pin and rolling pin |
| bug  | beetle         | search leads with the verb "to bug"; a ladybug was rejected because a child would read it as "ladybug" |
| mug  | the cup        | search leads with "to mug / robbery" |
| net  | physical net   | -- |
| vet  | veterinarian   | plain "vet" only finds the clinic building |
| fig  | the fruit      | competes with the fig tree |
| hog  | pig            | deliberately a different pig from `pig.png` |
| log  | piece of wood  | plain "log" only finds logbook, cologne, psychologist |

## Re-downloading

Pictogram `<id>` at 500px comes from:
`https://static.arasaac.org/pictograms/<id>/<id>_500.png`

That gives back the uncropped 500x500 original. Re-crop it to the alpha
bounding box in its original mode, or the file will land here several times
larger than it needs to be:

```python
from PIL import Image
im = Image.open("<id>_500.png")            # mode "P"
im.crop(im.convert("RGBA").getbbox()).save("<word>.png", optimize=True)
```
