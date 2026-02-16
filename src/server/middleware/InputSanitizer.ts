import { INPUT_LIMITS } from '../config/limits';

export class InputSanitizer {
  sanitize(msg: any): void {
    switch (msg.type) {
      case 'move':
      case 'scroll':
        msg.dx = this.clamp(msg.dx, INPUT_LIMITS.MIN_COORDINATE, INPUT_LIMITS.MAX_COORDINATE);
        msg.dy = this.clamp(msg.dy, INPUT_LIMITS.MIN_COORDINATE, INPUT_LIMITS.MAX_COORDINATE);
        break;

      case 'zoom':
        msg.delta = this.clamp(msg.delta, INPUT_LIMITS.MIN_ZOOM_DELTA, INPUT_LIMITS.MAX_ZOOM_DELTA);
        break;

      case 'text':
        if (msg.text.length > INPUT_LIMITS.MAX_TEXT_LENGTH) {
          msg.text = msg.text.substring(0, INPUT_LIMITS.MAX_TEXT_LENGTH);
        }
        break;

      case 'key':
        if (msg.key.length > INPUT_LIMITS.MAX_KEY_LENGTH) {
          msg.key = msg.key.substring(0, INPUT_LIMITS.MAX_KEY_LENGTH);
        }
        break;

      case 'combo':
        if (msg.keys.length > INPUT_LIMITS.MAX_COMBO_KEYS) {
          msg.keys = msg.keys.slice(0, INPUT_LIMITS.MAX_COMBO_KEYS);
        }
        break;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}