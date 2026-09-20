# 012 Arrows — assets

Everything is drawn in code and baked to a texture at runtime. No image files.

## Baked textures

| Key | Drawn by | Notes |
|---|---|---|
| `arrows_tray_{cols}x{rows}_{cell}` | `drawTray` | Frame, recessed field, hairline grid, exit channels. One per board shape. |
| `arrows_well_{cell}` | `drawCellWell` | Empty cell. Shared by every cell on the board. |
| `arrows_tile_{dir}_{size}` | `drawArrowTile` | Four total — one per direction, including its drop shadow. |

Keys carry the cell size because the art is resolution-specific. `ArrowsView`
tracks the keys it created and removes them on `destroy()`, so a differently
shaped level cannot inherit stale art.

## Transient art (live Graphics, not baked)

Runway preview, blocker ring, gate flash. Short-lived and changing, so baking
would cost more than it saves.

## Sound slots

Wired through `p.juice.play(slot)`; silent no-ops until the files exist.

| Slot | Moment | Suggested key |
|---|---|---|
| `select` | finger lands on a tile | `sfx_select` |
| `collect` | an arrow launches | `sfx_swoosh` |
| `fail` | blocked tap | `sfx_bump` |
| `move` | a nudged arrow slides | `sfx_slide` |
| `complete` | board cleared | `sfx_win` |

Drop the files into `assets/shared/audio/`, load them in `PreloadScene`, and
they start playing with no change to this prototype.
