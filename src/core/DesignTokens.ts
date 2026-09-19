export const DesignTokens = {
  color: {
    bg: '#111122',
    surface: '#1a1a2e',
    border: '#333355',
    text: '#ffffff',
    textDim: '#888888',
    primary: '#4488ff',
    success: '#00ff88',
    danger: '#ff4455',
    warning: '#ffaa00',
  },
  typography: {
    title:   { fontSize: '48px', fontStyle: 'bold' as const },
    heading: { fontSize: '32px', fontStyle: 'bold' as const },
    body:    { fontSize: '18px' },
    small:   { fontSize: '13px' },
    tiny:    { fontSize: '11px' },
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 48 },
  radius:  { sm: 4, md: 8, lg: 16, pill: 999 },
  ui: {
    buttonHeight: 48,
    panelPadding: 16,
    toastDuration: 2000,
    safeMargin: 24,
  },

  // ── Foundation V3 ─────────────────────────────────────────────────────────
  // Sized for the 1080x1920 portrait design space, which is the default target
  // for new prototypes. The landscape `typography` / `ui` tokens above are
  // unchanged and back UIFactory's landscape text ramp. Note that prototypes
  // 001-010 draw their own text directly and do not consume either ramp.

  // Portrait text scale. At 1080 logical width on a ~390 CSS-px phone these
  // render at roughly 35 / 23 / 16 / 12 / 10 CSS px.
  text: {
    title:   { fontSize: '96px', fontStyle: 'bold' as const },
    heading: { fontSize: '64px', fontStyle: 'bold' as const },
    body:    { fontSize: '44px' },
    small:   { fontSize: '34px' },
    tiny:    { fontSize: '28px' },
  },

  button: {
    width: 560,
    height: 140,
    // ~44 CSS px at 1080 logical width — the standard comfortable tap target.
    minTouch: 120,
  },

  panel: {
    sm: { width: 640, height: 420 },
    md: { width: 840, height: 640 },
    lg: { width: 980, height: 1040 },
    padding: 48,
  },

  shadow: {
    offsetX: 0,
    offsetY: 6,
    alpha: 0.25,
    color: 0x000000,
  },

  duration: {
    instant: 80,
    fast: 150,
    normal: 250,
    slow: 400,
  },
} as const
