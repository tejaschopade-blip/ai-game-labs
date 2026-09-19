# Assets — 010 Cozy Maze (Phases 1–2)

All visuals are Phaser Graphics primitives. No external art, no asset keys, nothing
loaded in `PreloadScene`.

## Palette

| Token | Hex | Used for |
|---|---|---|
| bg | `0xeef3e2` | Garden cream background |
| path | `0xe3dcc4` | Warm sand walkable tiles |
| hedge | `0x5a9d4a` | Hedge wall body |
| hedgeTop | `0x74b562` | Hedge top highlight |
| hedgeLeaf | `0x47803a` | Leaf speckles |
| player | `0xff9a5c` | Explorer body |
| playerLine | `0x4a3728` | Explorer outline + eyes |
| gold | `0xffd24a` | Key |
| wood | `0x9c6b3f` | Key gate slats |
| mint | `0x7ad4a0` | Exit arch + glow |
| stone | `0x9aa08f` | Switch plate, inactive |
| stoneDark | `0x777d6e` | Switch sunken ring |
| amber | `0xf0a93c` | Switch plate, active |
| amberLight | `0xfff3b0` | Switch highlight + travelling sparkle core |
| vine | `0x4f9b6a` | Remote gate vines |
| vineDark | `0x3a7550` | Vine leaf nodes |
| gem | `0xe0a33c` | Treasure body |
| gemLight | `0xf7d98a` | Treasure facet highlight |
| bloomPink | `0xf2c6e0` | Hidden-tile flower clue |
| bloomCream | `0xfff2b0` | Hidden-tile flower clue + sparkle |

## Elements

| Element | Visual | Status |
|---|---|---|
| Hedge wall | Rounded rect + top highlight + 3 deterministic leaf speckles | placeholder |
| Path tile | Flat rect | placeholder |
| Maze drop shadow | Rounded rect at 10% alpha | placeholder |
| Player | Circle + stroke + two eyes that lean toward travel direction | placeholder |
| Key | Circle bow with cut-out + shaft rect + two tooth rects, scale-pulse tween | placeholder |
| Key gate (locked) | 3 vertical rounded slats + 2 horizontal braces | placeholder |
| Key gate (opening) | `scaleX → 0.08`, `alpha → 0` over 420ms, `Back.In` | placeholder |
| Exit arch | Rounded-top rect with cream inner opening | placeholder |
| Exit glow | Circle, scale + alpha yoyo tween, 1100ms | placeholder |
| Key pickup | `vfx.burst` gold + `vfx.floatingText` | placeholder |
| Gate opening | `vfx.burst` wood + `vfx.floatingText` at the gate | placeholder |
| HUD key icon | Small Graphics key, grey → gold on pickup | placeholder |
| Level complete | Panel rect + text + button | placeholder |

### Phase 2 elements

| Element | Visual | Status |
|---|---|---|
| Switch (off) | Sunken stone ring + flat grey plate | placeholder |
| Switch (on) | Plate drops `0.04×tile`, stone → amber, lighter amber cap | placeholder |
| Switch activation | `vfx.scalePunch` 1.35 + `vfx.burst` amber | placeholder |
| Travelling pulse | Amber halo (scales 1.7×, fades) + bright core, lerped switch → gate over 520ms | placeholder |
| Remote gate (closed) | 3 vertical vine stems + leaf nodes, green to distinguish from the wooden key gate | placeholder |
| Remote gate (opening) | `scaleY → 0.05`, `alpha → 0` over 400ms, `Back.In` | placeholder |
| Falling leaves | 5 ellipses, staggered 880–1240ms, horizontal sway + 220° spin + fade | placeholder |
| Treasure gem | Two mirrored triangles + lighter facet, vertical bob tween 900ms | placeholder |
| Treasure pickup | `vfx.burst` gem + `vfx.floatingText` + `vfx.screenShake(3, 180)` | placeholder |
| Hidden tile (concealed) | Hedge drawn via the shared `drawHedge` helper + 4 pale flowers + pulsing sparkle | placeholder |
| Hidden tile (revealed) | `alpha → 0` over 300ms, then destroyed to expose the path beneath | placeholder |
| HUD gem icon | Small Graphics gem, grey → gold on pickup | placeholder |

The concealed hidden tile reuses the same `drawHedge()` helper as the maze itself, so
it is pixel-identical to a real hedge apart from the deliberate flower clue.

Speckle offsets are derived from `col * 7 + row * 13` rather than `Math.random()`, so
the hedges are stable across frames and identical between runs.

## Audio — missing

Nothing is wired up. Candidates if this prototype earns a Phase 2:

| Sound | Trigger | Status |
|---|---|---|
| `key_pickup` | Player enters the key tile | missing |
| `gate_open` | Key gate unlocks | missing |
| `footstep` | Per tile entered (would need rate limiting) | missing |
| `level_complete` | Player enters the exit | missing |
| `switch_click` | Switch plate depresses | missing |
| `vine_retract` | Remote gate opens (should land as the sparkle arrives) | missing |
| `secret_reveal` | Hidden hedge fades away | missing |
| `treasure_pickup` | Gem collected | missing |

## Future art direction

If this moves past prototype, the hedges and the explorer are the two elements that
would benefit most from real art — everything else reads fine as primitives. Hedges
would want a tileable sprite with corner variants so junctions do not look blocky.
