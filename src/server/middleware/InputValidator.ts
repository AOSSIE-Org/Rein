import { INPUT_LIMITS, VALID_BUTTONS, VALID_MESSAGE_TYPES } from '../config/limits';

export class InputValidator {
  isValid(msg: any): boolean {
    if (!msg || typeof msg !== 'object') {
      return false;
    }

    if (!VALID_MESSAGE_TYPES.includes(msg.type)) {
      return false;
    }

    switch (msg.type) {
      case 'move':
      case 'scroll':
        if (typeof msg.dx !== 'number' || typeof msg.dy !== 'number') {
          return false;
        }
        if (!isFinite(msg.dx) || !isFinite(msg.dy)) {
          return false;
        }
        break;

      case 'click':
        if (!VALID_BUTTONS.includes(msg.button)) {
          return false;
        }
        if (typeof msg.press !== 'boolean') {
          return false;
        }
        break;

      case 'zoom':
        if (typeof msg.delta !== 'number' || !isFinite(msg.delta)) {
          return false;
        }
        break;

      case 'text':
        if (typeof msg.text !== 'string') {
          return false;
        }
        break;

      case 'key':
        if (typeof msg.key !== 'string') {
          return false;
        }
        break;

      case 'combo':
        if (!Array.isArray(msg.keys)) {
          return false;
        }
        if (msg.keys.some((k: any) => typeof k !== 'string')) {
          return false;
        }
        break;

      case 'paste':
      case 'copy':
        break;
    }

    return true;
  }
}