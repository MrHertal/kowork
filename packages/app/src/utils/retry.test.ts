import { describe, expect, it } from "vitest";
import { HttpError, retry } from "./retry";

describe("retry", () => {
  it("returns the result on first success", async () => {
    let attempts = 0;
    const result = await retry(() => {
      attempts++;
      return Promise.resolve("ok");
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(1);
  });

  it("retries transient errors until success", async () => {
    let attempts = 0;
    const result = await retry(
      () => {
        attempts++;
        if (attempts < 3) return Promise.reject(new Error("failed to fetch"));
        return Promise.resolve("ok");
      },
      { delay: 1 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry non-transient errors", async () => {
    let attempts = 0;
    await expect(
      retry(
        () => {
          attempts++;
          return Promise.reject(new Error("boom"));
        },
        { delay: 1 },
      ),
    ).rejects.toThrow("boom");
    expect(attempts).toBe(1);
  });

  it("retries server errors and gives up after all attempts", async () => {
    let attempts = 0;
    await expect(
      retry(
        () => {
          attempts++;
          return Promise.reject(new HttpError(500, "Internal Server Error"));
        },
        { attempts: 2, delay: 1 },
      ),
    ).rejects.toThrow(HttpError);
    expect(attempts).toBe(2);
  });

  it("does not retry client errors", async () => {
    let attempts = 0;
    await expect(
      retry(
        () => {
          attempts++;
          return Promise.reject(new HttpError(404, "Not Found"));
        },
        { delay: 1 },
      ),
    ).rejects.toThrow(HttpError);
    expect(attempts).toBe(1);
  });
});
