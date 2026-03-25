// ---------------------------------------------------------------------------
// Claude Hub — Async Concurrency Semaphore
// ---------------------------------------------------------------------------
// Limits how many Claude Code instances can run concurrently. Callers that
// exceed the limit are queued and resolved FIFO when a slot frees up.
// ---------------------------------------------------------------------------

/**
 * A counting semaphore for async concurrency control.
 *
 * ```ts
 * const sem = new Semaphore(3); // max 3 concurrent
 * await sem.acquire();
 * try {
 *   // ... critical section ...
 * } finally {
 *   sem.release();
 * }
 * ```
 */
export class Semaphore {
  private _maxConcurrency: number;
  private _active: number = 0;
  private _queue: Array<() => void> = [];

  constructor(maxConcurrency: number) {
    if (maxConcurrency < 1) {
      throw new RangeError("Semaphore maxConcurrency must be >= 1");
    }
    this._maxConcurrency = maxConcurrency;
  }

  /** Number of callers waiting for a slot. */
  get queueLength(): number {
    return this._queue.length;
  }

  /** Number of currently active slots. */
  get activeCount(): number {
    return this._active;
  }

  /** Maximum concurrency this semaphore was created with. */
  get maxConcurrency(): number {
    return this._maxConcurrency;
  }

  /**
   * Acquire a slot. If all slots are taken the returned promise will not
   * resolve until a slot becomes available (FIFO ordering).
   */
  acquire(): Promise<void> {
    if (this._active < this._maxConcurrency) {
      this._active++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this._queue.push(resolve);
    });
  }

  /**
   * Release a slot. If callers are queued the next one is resolved
   * immediately (the slot is transferred, not freed then re-acquired).
   *
   * Throws if called when no slots are active (double-release guard).
   */
  release(): void {
    if (this._active <= 0) {
      throw new Error("Semaphore.release() called with no active slots — possible double-release");
    }

    const next = this._queue.shift();
    if (next) {
      // Transfer the slot directly to the next waiter (active count stays the same).
      next();
    } else {
      this._active--;
    }
  }
}
