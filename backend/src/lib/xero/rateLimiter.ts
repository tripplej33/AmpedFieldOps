/**
 * Xero API Rate Limiter
 * 
 * Xero Rate Limits:
 * - 60 calls per minute
 * - 5,000 calls per day
 * - 5 concurrent calls
 * 
 * This utility helps manage rate limits and implements retry logic with exponential backoff
 */

interface RateLimitState {
  minuteCalls: number;
  minuteWindowStart: number;
  dailyCalls: number;
  dailyWindowStart: number;
  concurrentCalls: number;
}

class XeroRateLimiter {
  private state: RateLimitState = {
    minuteCalls: 0,
    minuteWindowStart: Date.now(),
    dailyCalls: 0,
    dailyWindowStart: Date.now(),
    concurrentCalls: 0
  };

  private readonly MINUTE_LIMIT = 60;
  private readonly DAILY_LIMIT = 5000;
  private readonly CONCURRENT_LIMIT = 5;
  private readonly MINUTE_WINDOW = 60 * 1000; // 60 seconds
  private readonly DAILY_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Check if we can make an API call
   * Returns wait time in milliseconds if we need to wait, 0 if we can proceed
   */
  canMakeCall(): number {
    const now = Date.now();

    // Reset minute window if expired
    if (now - this.state.minuteWindowStart >= this.MINUTE_WINDOW) {
      this.state.minuteCalls = 0;
      this.state.minuteWindowStart = now;
    }

    // Reset daily window if expired
    if (now - this.state.dailyWindowStart >= this.DAILY_WINDOW) {
      this.state.dailyCalls = 0;
      this.state.dailyWindowStart = now;
    }

    // Check concurrent limit
    if (this.state.concurrentCalls >= this.CONCURRENT_LIMIT) {
      return 100; // Wait 100ms before retrying
    }

    // Check minute limit
    if (this.state.minuteCalls >= this.MINUTE_LIMIT) {
      const waitTime = this.MINUTE_WINDOW - (now - this.state.minuteWindowStart);
      return Math.max(waitTime, 100);
    }

    // Check daily limit
    if (this.state.dailyCalls >= this.DAILY_LIMIT) {
      const waitTime = this.DAILY_WINDOW - (now - this.state.dailyWindowStart);
      return Math.max(waitTime, 60000); // Wait at least 1 minute
    }

    return 0; // Can proceed
  }

  /**
   * Record that an API call is starting
   */
  startCall(): void {
    this.state.concurrentCalls++;
    this.state.minuteCalls++;
    this.state.dailyCalls++;
  }

  /**
   * Record that an API call has completed
   */
  endCall(): void {
    if (this.state.concurrentCalls > 0) {
      this.state.concurrentCalls--;
    }
  }

  /**
   * Parse rate limit headers from Xero API response
   */
  updateFromHeaders(headers: Headers): void {
    const dayRemaining = headers.get('X-DayLimit-Remaining');
    const minRemaining = headers.get('X-MinLimit-Remaining');
    const appMinRemaining = headers.get('X-AppMinLimit-Remaining');

    if (dayRemaining !== null) {
      const remaining = parseInt(dayRemaining, 10);
      if (!isNaN(remaining)) {
        this.state.dailyCalls = Math.max(0, this.DAILY_LIMIT - remaining);
      }
    }

    if (minRemaining !== null) {
      const remaining = parseInt(minRemaining, 10);
      if (!isNaN(remaining)) {
        this.state.minuteCalls = Math.max(0, this.MINUTE_LIMIT - remaining);
      }
    }
  }

  /**
   * Get current rate limit status
   */
  getStatus() {
    const now = Date.now();
    return {
      minuteCalls: this.state.minuteCalls,
      minuteLimit: this.MINUTE_LIMIT,
      minuteRemaining: Math.max(0, this.MINUTE_LIMIT - this.state.minuteCalls),
      dailyCalls: this.state.dailyCalls,
      dailyLimit: this.DAILY_LIMIT,
      dailyRemaining: Math.max(0, this.DAILY_LIMIT - this.state.dailyCalls),
      concurrentCalls: this.state.concurrentCalls,
      concurrentLimit: this.CONCURRENT_LIMIT
    };
  }
}

// Singleton instance
export const xeroRateLimiter = new XeroRateLimiter();

/**
 * Execute a fetch request with rate limiting and retry logic
 */
export async function fetchWithRateLimit(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let attempt = 0;

  while (attempt < maxRetries) {
    // Check rate limits
    const waitTime = xeroRateLimiter.canMakeCall();
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Start tracking the call
    xeroRateLimiter.startCall();

    try {
      const response = await fetch(url, options);

      // Update rate limiter from response headers
      xeroRateLimiter.updateFromHeaders(response.headers);

      // Handle rate limit errors (429)
      if (response.status === 429) {
        xeroRateLimiter.endCall();
        
        // Get retry-after header
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
        
        if (attempt < maxRetries - 1) {
          console.warn(`[Xero Rate Limit] Hit rate limit, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          attempt++;
          continue;
        } else {
          throw new Error(`Xero API rate limit exceeded after ${maxRetries} attempts`);
        }
      }

      // Success - end call tracking
      xeroRateLimiter.endCall();
      return response;

    } catch (error) {
      xeroRateLimiter.endCall();
      
      // Retry on network errors with exponential backoff
      if (attempt < maxRetries - 1 && error instanceof Error) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.warn(`[Xero API] Request failed, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        attempt++;
        continue;
      }
      
      throw error;
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts`);
}

