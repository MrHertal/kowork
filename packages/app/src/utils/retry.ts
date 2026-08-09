export interface RetryOptions {
  attempts?: number;
  delay?: number;
  factor?: number;
  maxDelay?: number;
  retryIf?: (error: unknown) => boolean;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} ${statusText}`);
    this.name = "HttpError";
  }
}

const TRANSIENT_MESSAGES = [
  "load failed",
  "network connection was lost",
  "network request failed",
  "failed to fetch",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
];

function isTransientError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof HttpError) return error.status >= 500;
  const message = error instanceof Error ? error.message : error;
  if (typeof message !== "string") return false;
  const lower = message.toLowerCase();
  return TRANSIENT_MESSAGES.some((m) => lower.includes(m));
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    delay = 500,
    factor = 2,
    maxDelay = 10000,
    retryIf = isTransientError,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !retryIf(error)) throw error;
      const wait = Math.min(delay * Math.pow(factor, attempt), maxDelay);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}
