# Advanced reading illustrations

These eight pictures belong to the separate **Very advanced** reading deck. They are
bundled with the app so the cards still work without a network connection.

The first five images were created for this project on 2026-09-20
(`accretion` and `ubiquitous` on 2026-10-06) with OpenAI's built-in
image-generation tool. They are original generated illustrations, not ARASAAC
pictograms, so they live outside `public/reading/arasaac/` and do not inherit
that directory's attribution or license statement.

## Visual briefs

| Word | Prompt focus |
| --- | --- |
| `osteichthyes` | A colorful bony fish with a child-friendly skeletal cutaway. |
| `nucleotide` | One three-part nucleotide: phosphate, pentose sugar, and nitrogenous base. |
| `planetesimal` | A rocky-and-icy planet-building body accreting from orbiting debris. |
| `parangaricutirimícuaro` | A tongue-twister association: Parícutin and San Juan Parangaricutiro's lava-surrounded church. |
| `axolotl` | A friendly pink axolotl with six external gill stalks, little legs, and a finned tail. |
| `accretion` | A snowball growing as it rolls downhill, gathering snow onto itself. |
| `ubiquitous` | A backyard comically overrun with pinecones on every surface. |
| `phytoplankton` | A cluster of smiling green plankton cells: diatoms, a dinoflagellate, a cell chain, and a colony. |

Every prompt requested a centered, original educational pictogram with bold
outlines, simple saturated color, a genuinely transparent background, and no
text, labels, border, plate, or watermark. After generation, each image was
cropped to its alpha bounds, resized to fit within 800x800, and PNG-optimized.
`ubiquitous` was also reduced to a 256-color palette, because its hundreds of
pinecone scales made the full-color file twice the size of the others.

On 2026-11-02 the PNGs were converted to WebP at quality 85 (2.9 MB to about
0.7 MB for the deck), so a reveal on a tablet does not wait on a 600 KB file.
`ubiquitous` is lossless WebP: lossy encoding made its palette image larger.
The original PNGs are in git history before that date.

`phytoplankton` was added on 2026-11-07 (PR #5) as a 1254x1254 WebP. It was
then cropped to its alpha bounds and resized to 800x790 at quality 85 to match
the rest of the deck (312 KB to 184 KB).

`parangaricutirimicuaro.webp` deliberately uses an ASCII filename. The displayed
word retains its Spanish stress mark: `parangaricutirimícuaro`.

See `manifest.json` for dimensions and the exact card-to-file mapping.
