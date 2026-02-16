import { RATE_LIMITS } from '../config/limits';

export class RateLimiter {
  private lastMessageTime: Map<string, Map<string, number>>;

  constructor() {
    this.lastMessageTime = new Map();
  }

  shouldProcess(clientId: string, messageType: string): boolean {
    const now = Date.now();
    
    if (!this.lastMessageTime.has(clientId)) {
      this.lastMessageTime.set(clientId, new Map());
    }
    
    const clientTimes = this.lastMessageTime.get(clientId)!;
    const lastTime = clientTimes.get(messageType) || 0;
    const interval = RATE_LIMITS[messageType as keyof typeof RATE_LIMITS] || RATE_LIMITS.default;
    
    if (now - lastTime < interval) {
      return false;
    }
    
    clientTimes.set(messageType, now);
    return true;
  }

  cleanup(clientId: string): void {
    this.lastMessageTime.delete(clientId);
  }
}