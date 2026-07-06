// Dark and light theme color palettes - PURPLE theme (per user spec).
// All previously-blue accents are now purple tones.

export const DARK_COLORS = {
  bg:               '#1A0F26',  // deep dark purple
  bgSecondary:      '#261A40',  // slightly lighter purple
  bgTertiary:       '#0F0821',  // near-black purple
  border:           '#2E1F4A',  // purple border
  borderLight:      '#352858',  // lighter purple border
  textPrimary:      '#F0EAF5',  // slightly purple-tinted white
  textSecondary:    '#BFAED1',  // muted purple-gray
  textMuted:        '#7C6F95',  // dim purple-gray
  accent:           '#A678E0',  // bright purple - PRIMARY ACCENT
  accentLight:      '#C09FE0',  // lighter purple
  scanFill:         '#4A2E8A',  // dark purple for scan circle gradient inner
  scanOuter:        '#281E45',  // outer ring color
  scanOuterShadow:  'rgba(166,120,224,0.3)',
  waveColor:        '#4A2E70',  // deep purple waves
  orbitBg:          '#261A40',  // ring backdrop
};

export const LIGHT_COLORS = {
  bg:               '#FFFFFF',
  bgSecondary:      '#F8F4FA',  // faint purple tint
  bgTertiary:       '#F0EAF5',  // faint purple tint
  border:           '#E5DCE8',  // light purple border
  borderLight:      '#EBE0F0',  // very faint purple border
  textPrimary:      '#4A2E8A',  // dark purple
  textSecondary:    '#4A2E70',  // purple
  textMuted:        '#92789A',  // dim purple
  accent:           '#4A2E8A',  // dark purple
  accentLight:      '#A678E0',  // light purple
  scanFill:         '#4A2E8A',  // dark purple
  scanOuter:        '#FFFFFF',
  scanOuterShadow:  'rgba(74,46,138,0.12)',
  waveColor:        '#D1B5E8',  // faint purple waves
  orbitBg:          '#FFFFFF',
};

export function getColors(isLight) {
  return isLight ? LIGHT_COLORS : DARK_COLORS;
}
