import { GraduationCapIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface SkillLogoProps {
  src?: string;
  alt: string;
  className?: string;
}

export function SkillLogo({ src, alt, className }: SkillLogoProps) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <GraduationCapIcon
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
