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
  radius:  { sm: 4, md: 8, lg: 16 },
  ui: {
    buttonHeight: 48,
    panelPadding: 16,
    toastDuration: 2000,
    safeMargin: 24,
  },
} as const
