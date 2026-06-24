import { MultiFileDiff } from "@pierre/diffs/react";
import { useTheme } from "next-themes";

interface DiffProps {
  before: { name: string; contents: string };
  after: { name: string; contents: string };
  className?: string;
}

export function Diff({ before, after, className }: DiffProps) {
  const { resolvedTheme } = useTheme();
  const themeType = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div className="overflow-hidden rounded-md border">
      <MultiFileDiff
        oldFile={before}
        newFile={after}
        options={{
          theme: { dark: "pierre-dark", light: "pierre-light" },
          themeType,
        }}
        className={className}
      />
    </div>
  );
}
