import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function containsRevenueByItem(output) {
  const normalized = String(output).replaceAll(",", "");
  const widgets = /widgets[\s\S]{0,120}(?:\$\s*)?2400/i.test(normalized);
  const gadgets = /gadgets[\s\S]{0,120}(?:\$\s*)?1600/i.test(normalized);
  const pass = widgets && gadgets;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? "The answer reports the expected revenue for Widgets and Gadgets."
      : "Expected Widgets revenue of $2,400 and Gadgets revenue of $1,600.",
  };
}

export function reportIsUnchanged(_output, context) {
  const reportPath = context.vars?.reportPath;
  const expected = context.vars?.reportSha256;
  if (typeof reportPath !== "string" || typeof expected !== "string") {
    throw new Error("Missing report path or expected checksum");
  }
  const actual = createHash("sha256")
    .update(readFileSync(reportPath))
    .digest("hex");
  const pass = actual === expected;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? "The source report remained unchanged."
      : `The source report changed (expected ${expected}, received ${actual}).`,
  };
}
