// @opencode-ref: opencode/packages/app/src/components/prompt-input/attachments.ts (dataUrl helper)

export function dataUrl(file: File, mime: string) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => resolve(""));
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const idx = value.indexOf(",");
      if (idx === -1) {
        resolve(value);
        return;
      }
      resolve(`data:${mime};base64,${value.slice(idx + 1)}`);
    });
    reader.readAsDataURL(file);
  });
}
