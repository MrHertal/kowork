interface Diagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity?: number;
}

import { m } from "@/paraglide/messages";

export type { Diagnostic };

export function getDiagnostics(
  diagnosticsByFile: Record<string, Diagnostic[]> | undefined,
  filePath: string | undefined,
): Diagnostic[] {
  if (!diagnosticsByFile || !filePath) return [];
  const diagnostics = diagnosticsByFile[filePath] ?? [];
  return diagnostics.filter((d) => d.severity === 1).slice(0, 3);
}

export function DiagnosticsDisplay({
  diagnostics,
}: {
  diagnostics: Diagnostic[];
}) {
  if (diagnostics.length === 0) return null;

  return (
    <div className="space-y-1 pt-2">
      {diagnostics.map((d, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs">
          <span className="font-medium text-red-600">{m.common_error()}</span>
          <span className="text-muted-foreground">
            [{d.range.start.line + 1}:{d.range.start.character + 1}]
          </span>
          <span className="text-muted-foreground">{d.message}</span>
        </div>
      ))}
    </div>
  );
}
