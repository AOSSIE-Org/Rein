export const RATE_LIMITS = {
  move: 16,
  scroll: 16,
  click: 50,
  text: 100,
  key: 100,
  combo: 50,
  zoom: 50,
  paste: 50,
  copy: 50,
  default: 33
} as const;

export const INPUT_LIMITS = {
  MAX_TEXT_LENGTH: 1000,
  MAX_KEY_LENGTH: 50,
  MAX_COMBO_KEYS: 10,
  MAX_COORDINATE: 5000,
  MIN_COORDINATE: -5000,
  MAX_ZOOM_DELTA: 100,
  MIN_ZOOM_DELTA: -100,
} as const;

export const VALID_BUTTONS = ['left', 'right', 'middle'] as const;
export type ValidButton = typeof VALID_BUTTONS[number];

export const VALID_MESSAGE_TYPES = [
  'move',
  'click',
  'scroll',
  'key',
  'text',
  'zoom',
  'combo',
  'paste',
  'copy'
] as const;
export type ValidMessageType = typeof VALID_MESSAGE_TYPES[number];