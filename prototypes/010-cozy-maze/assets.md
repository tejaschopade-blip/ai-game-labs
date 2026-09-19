# Assets — 010 Cozy Maze (Phase 1)

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
| wood | `0x9c6b3f` | Gate slats |
| mint | `0x7ad4a0` | Exit arch + glow |

## Elements

| Element | Visual | Status |
|---|---|---|
| Hedge wall | Rounded rect + top highlight + 3 deterministic leaf speckles | placeholder |
| Path tile | Flat rect | placeholder |
| Maze drop shadow | Rounded rect at 10% alpha | placeholder |
| Player | Circle + stroke + two eyes that lean toward travel direction | placeholder |
| Key | Circle bow with cut-out + shaft rect + two tooth rects, scale-pulse tween | placeholder |
| Gate (locked) | 3 vertical rounded slats + 2 horizontal braces | placeholder |
| Gate (opening) | `scaleX → 0.08`, `alpha → 0` over 420ms, `Back.In` | placeholder |
| Exit arch | Rounded-top rect with cream inner opening | placeholder |
| Exit glow | Circle, scale + alpha yoyo tween, 1100ms | placeholder |
| Key pickup | `vfx.burst` gold + `vfx.floatingText` | placeholder |
| Gate opening | `vfx.burst` wood + `vfx.floatingText` at the gate | placeholder |
| HUD key icon | Small Graphics key, grey → gold on pickup | placeholder |
| Level complete | Panel rect + text + button | placeholder |

Speckle offsets are derived from `col * 7 + row * 13` rather than `Math.random()`, so
the hedges are stable across frames and identical between runs.

## Audio — missing

Nothing is wired up. Candidates if this prototype earns a Phase 2:

| Sound | Trigger | Status |
|---|---|---|
| `key_pickup` | Player enters the key tile | missing |
| `gate_open` | Gate unlocks | missing |
| `footstep` | Per tile entered (would need rate limiting) | missing |
| `level_complete` | Player enters the exit | missing |

## Future art direction

If this moves past prototype, the hedges and the explorer are the two elements that
would benefit most from real art — everything else reads fine as primitives. Hedges
would want a tileable sprite with corner variants so junctions do not look blocky.
