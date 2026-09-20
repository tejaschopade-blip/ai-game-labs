# Assets — 011 Loop Sort DNA

**No external assets required.** Everything is Phaser Graphics and Text, drawn at
runtime. No `AssetKeys` entries were added and nothing is loaded in `PreloadScene`.

## Current visuals (V1)

| Element | Visual | Status |
|---|---|---|
| Belt track | Thick stroked path around a rounded-rect perimeter | placeholder |
| Slot socket | Rounded rect, darker when curtained | placeholder |
| Slot 0 marker | Outline ring around the compaction target | placeholder |
| Cube | Rounded square + top highlight, one fill per colour | placeholder |
| Cube shadow | `addShadow()` from `src/systems/Shadow.ts` | placeholder |
| Frozen cube | Cube plus translucent frost fill and stroke | placeholder |
| Curtain | Translucent violet panels over its slot range | placeholder |
| Ice halo | Frost outline around the frozen slot | placeholder |
| Barrier | Thick amber bar drawn between two slots | placeholder |
| Hidden cover | Opaque panels with a `?` glyph per slot | placeholder |
| Batch card | `UIFactory.createButton` + mini cube previews | placeholder |
| Capacity bar | `UIFactory.createProgressBar` | placeholder |
| Restart icon | `UIFactory.createIcon` with a vector `draw` callback | placeholder |
| Panels | `UIFactory.createPanel` + `createButton` | placeholder |
| Background | `createBackground()` gradient + dots, particles off | placeholder |
| Match / fail feedback | `GameJuice` success / fail / collect / levelComplete | placeholder |

## Possible future assets

Listed as candidates only — **no keys are defined and nothing is referenced in
code.** Do not add any of these until the mechanic is validated.

```
cube visual          (4 colour variants, or a tintable sprite)
cube frozen overlay
conveyor texture     (belt tread, directional)
truck / source visual
curtain
ice
barrier
hidden crate
background
UI icons             (restart, settings, level)
SFX                  cube enter, cube settle, match, chain, obstacle open,
                     level complete, level fail
music                ambient loop
```

## Audio

| Hook | Status |
|---|---|
| `GameJuice` success / fail / collect / select / destroy / levelComplete | wired, **silent** |

`GameJuice` is constructed with no sound keys. It checks
`scene.cache.audio.exists(key)` before playing, so the repo's zero audio assets
are a no-op rather than an error. No fake keys were invented.
