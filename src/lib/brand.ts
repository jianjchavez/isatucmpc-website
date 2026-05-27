export const COLORS = {
  navy: '#010066',
  orange: '#FE9900',
  gold: '#FFC001',
  red: '#FF3F00',
  blue: '#0102FD',
  green: '#23CD63',
  ink: '#111827',
  slate: '#6B7280',
  rule: '#E8E8E8',
  background: '#F5F5F5',
  white: '#FFFFFF',
} as const;

export const FONTS = {
  display: "'Montserrat', system-ui, sans-serif",
  body: "'Open Sans', system-ui, sans-serif",
} as const;

export const BRAND_GRADIENT = `linear-gradient(to right, ${COLORS.navy}, ${COLORS.orange}, ${COLORS.gold})`;
