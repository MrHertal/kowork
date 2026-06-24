import { PlugIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface McpLogoProps {
  src?: string;
  alt: string;
  className?: string;
}

export function McpLogo({ src, alt, className }: McpLogoProps) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <PlugIcon
        className={cn("size-5 shrink-0 text-muted-foreground", className)}
        aria-label={alt}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn("size-5 shrink-0", className)}
      onError={() => setErrored(true)}
    />
  );
}
