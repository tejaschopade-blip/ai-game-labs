export const AssetKeys = {
  shared: {
    pixel:          'shared_pixel',
    player:         'shared_player',
    target:         'shared_target',
    enemy:          'shared_enemy',
    icon_star:      'shared_icon_star',
    sfx_click:      'shared_sfx_click',
    sfx_success:    'shared_sfx_success',
    music_gameplay: 'shared_music_gameplay',
  },
  // Prototype-specific keys — add entries here as real assets are introduced.
  // Current prototypes use code-generated shapes and have no external asset keys.
  prototypes: {
    '001': {
      // No external assets — all shapes are code-generated
    },
    '002': {
      // Future keys when audio is added:
      // sfx_rotate: '002_sfx_rotate',
      // sfx_goal:   '002_sfx_goal',
    },
  },
} as const
