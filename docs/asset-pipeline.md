# Asset Pipeline V1

## 1. Folder Structure

```
assets/
├── shared/               ← reused by multiple prototypes
│   ├── images/
│   ├── audio/
│   ├── fonts/
│   └── effects/
└── prototypes/
    ├── 001-foundation-test/
    │   ├── images/
    │   └── audio/
    └── 002-rotation-world/
        ├── images/
        └── audio/
```

## 2. Shared vs Prototype Assets

**Shared** — generic assets reusable across multiple prototypes.
Examples: `ui_button`, `icon_star`, `sfx_click`, `generic_player`, `tile_floor`

Location: `assets/shared/`

**Prototype-specific** — assets that exist for one experiment only.
Examples: `gravity_orb`, `rotation_arrow`, `shadow_piece`

Location: `assets/prototypes/<prototype-name>/`

Rule: A prototype must NOT require another prototype's assets.

## 3. Naming Convention

Use lowercase snake_case. Be semantic.

### Categories

| Category | Examples |
|---|---|
| Player | `player_idle`, `player_walk`, `player_jump` |
| Enemy | `enemy_basic`, `enemy_boss` |
| Tiles | `tile_floor`, `tile_wall`, `tile_platform` |
| Items | `item_coin`, `item_key`, `item_health` |
| VFX | `fx_hit`, `fx_collect`, `fx_spawn`, `fx_explosion` |
| UI | `ui_button_primary`, `ui_panel`, `ui_icon_star` |
| SFX | `sfx_click`, `sfx_jump`, `sfx_collect`, `sfx_hit` |
| Music | `music_menu`, `music_gameplay` |

### Avoid

- `final.png`, `final2.png`, `new.png`
- `image1.png`, `thing.png`
- CamelCase filenames
- Spaces in filenames

## 4. Asset Manifest (assets.md)

Every prototype should have an `assets.md` describing its requirements.

This is a **workflow document**, not a runtime system. No code parses it.

### Template

```markdown
# Asset Requirements — <Prototype Name>

## Status

| Asset | Type | Size | Status | Source |
|---|---|---|---|---|
| Player | Sprite | 64×64 | placeholder | Code-generated |
| Goal | Sprite | 48×48 | placeholder | Code-generated |
| SFX Click | Audio | — | missing | — |

## Asset Details

### Player
- Type: sprite sheet
- Size: 64×64 per frame
- Animations: idle (4f), walk (6f)
- Background: transparent (PNG)
- Notes: top-down perspective

### SFX Click
- Type: WAV/OGG
- Duration: <0.5s
- Notes: UI interaction sound

## Visual Style
- Style: [pixel art / flat vector / hand-drawn / etc.]
- Perspective: top-down
- Palette: [describe or link]

## Source / License

| Asset | Source | License | Attribution | URL |
|---|---|---|---|---|
| Player | Code-generated | — | No | — |
```

## 5. Asset Status Vocabulary

| Status | Meaning |
|---|---|
| `missing` | Required but not yet created |
| `placeholder` | Primitive shape or temp stand-in |
| `generated` | Created by AI tool |
| `sourced` | From external library/pack |
| `approved` | Final, cleared for use |

## 6. Source and License Tracking

For any external or AI-generated asset, record:

| Field | Example |
|---|---|
| Source | Kenney Asset Pack |
| Creator | Kenney.nl |
| License | CC0 |
| Attribution required | No |
| URL | https://kenney.nl |

If license is unknown: mark `Unknown — verify before shipping`

## 7. Placeholder-First Workflow

```
IDEA
 ↓
MECHANIC (code first)
 ↓
PLACEHOLDER ASSETS (shapes, rectangles, circles)
 ↓
PLAYABLE PROTOTYPE
 ↓
PLAYTEST
 ↓
Does the mechanic work?
 ↓
YES → source/generate real assets
 NO → iterate or discard
```

Never spend time generating art before the mechanic is playable.

## 8. AI Asset Workflow

When an AI agent needs an asset:

1. **Check shared assets** — does `assets/shared/` have something suitable?
2. **Check prototype assets** — does this prototype already have it?
3. **Use a placeholder** — rectangle, circle, or colored shape for now.
4. **Record the requirement** — add to `assets.md` with status `missing`.
5. **Generate or source** — only after the mechanic is validated.
6. **Record source/license** — in the `assets.md` table.
7. **Place in correct folder** — shared or prototype-specific.
8. **Register in AssetKeys** — use the semantic naming convention.
9. **Load in PreloadScene** — explicitly, following existing patterns.

Do NOT randomly create duplicate assets.
Do NOT block gameplay on art.

## 9. Asset Normalization Guidelines

These are **guidelines**, not strict rules.

| Asset type | Recommended size | Format |
|---|---|---|
| Small icons / UI | 32×32 or 64×64 | PNG |
| Gameplay sprites | 32×32 or 64×64 | PNG |
| Characters | 64×64 or 128×128 | PNG |
| Tiles | 32×32, 48×48, or 64×64 | PNG |
| Large illustrations | 1024px+ | PNG or WebP |
| Sound effects | Short (<2s) | OGG + MP3 fallback |
| Music | Loop-ready | OGG + MP3 fallback |

Use PNG when transparency is needed. Use WebP for larger raster images without transparency.

## 10. Visual Style Consistency

Assets within one prototype should share:
- Art style (pixel art, flat vector, hand-drawn)
- Perspective (top-down, side-view, isometric)
- Lighting direction
- Color palette
- Outline treatment
- Scale relative to grid

Avoid mixing incompatible styles (e.g. pixel art player + photorealistic background) unless that contrast is intentional to the mechanic.

## 11. How Claude Should Handle Missing Assets

1. Default to primitive shapes (rectangle, circle) — always.
2. Note the requirement in `assets.md` with status `missing`.
3. Never block implementation waiting for art.
4. When real assets arrive, swap the key reference — no structural changes needed.

## 12. Phaser Asset Loading in This Repository

Assets are loaded in `src/scenes/PreloadScene.ts` during the `preload()` lifecycle.

```ts
// Shared assets (loaded every session)
this.load.image(AssetKeys.shared.player, 'assets/shared/images/player_idle.png')
this.load.audio(AssetKeys.shared.sfx_click, 'assets/shared/audio/sfx_click.ogg')

// Prototype-specific assets (add to prototypes namespace in AssetKeys)
this.load.image('gravity_orb', 'assets/prototypes/003-gravity-world/images/gravity_orb.png')
```

Asset keys are defined in `src/utils/AssetKeys.ts`. Always use the constant — never hardcode key strings in scenes.

```ts
// Good
this.load.image(AssetKeys.shared.player, 'assets/shared/images/player_idle.png')

// Bad
this.load.image('shared_player', 'assets/shared/images/player_idle.png')
```

---

## Before Adding an Asset — Checklist

- [ ] Does a suitable shared asset already exist?
- [ ] Can a placeholder work for now?
- [ ] Is the asset actually needed for the mechanic?
- [ ] Is the asset prototype-specific or shareable?
- [ ] Is the filename lowercase snake_case?
- [ ] Is the asset in the correct folder?
- [ ] Is the source/license recorded in `assets.md`?
- [ ] Is the key registered in `AssetKeys.ts`?
- [ ] Does the asset visually fit the prototype's style?
