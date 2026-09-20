# 011 — Loop Sort: assets

**No image, audio or font files ship with this prototype.** Everything on screen
is drawn at runtime with Phaser `Graphics` and baked once into a texture.

## Why baked, not live

A cube is seven fills. Twelve live `Graphics` objects re-tessellating those fills
every frame is the single most expensive thing a board like this can do, and it
buys nothing — the art never changes. So each distinct thing is drawn once into a
texture (`bakeTexture` / `bakeGraphics` in `src/presentation/Draw.ts`) and then
used as an `Image`.

Every drawing function lives in `LoopSortVisuals.ts` and takes a `Graphics`, so
it can be baked by the scene or composed into a larger bake (the goal chips draw
a cube inside a pill, for instance).

## What gets baked, and when

| Texture | Key | Rebuilt when |
|---|---|---|
| Conveyor track | *(anonymous)* | Level load — geometry depends on cell count |
| Slot well | `ls_well_<size>` | Cube size changes |
| Tread bar | `ls_tread_<len>` | Cube size changes |
| Intake chute | *(anonymous)* | Level load |
| Target bracket | `ls_target_{free,busy}_<size>` | Cube size changes |
| Cube | `ls_cube_<colour>_<size>` | Cube size changes |
| Batch card | `ls_card_{idle,pressed,disabled}_<w>_<h>` | Card size changes |
| Count chip | `ls_countchip` | Once |
| Tray plate, hub plate, goal chips | *(anonymous)* | Level load |

Keyed textures are tracked in `ownedTextures` and removed on level teardown, so
changing capacity (which changes cube size) never leaks a texture.

The track, the wells and the chute are all sized from one number — the arc length
of a single cell — so the whole machine rescales correctly for a 10-cell belt or
a 14-cell one without any per-level art.

## Audio

`Juice` is wired to seven semantic slots (`ls_select`, `ls_move`, `ls_match`,
`ls_chain`, `ls_pop`, `ls_success`, `ls_fail`). No audio files are loaded, so
every call is a silent no-op today. Dropping files in under those keys is the
only step needed to add sound.

## Fonts

Nunito, loaded from Google Fonts by `index.html` for the whole app. Nothing
prototype-specific.
