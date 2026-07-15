import { ComposerFolderPicker } from "@/components/session/composer-folder-picker";
import { cn } from "@/lib/utils";

interface ComposerTrayProps {
  attachedDirectory?: string;
  defaultDirectory: string;
  disabled?: boolean;
  onDirectoryChange: (directory: string) => void;
  onDirectoryDetach: () => void;
  className?: string;
}

export function ComposerTray({
  attachedDirectory,
  defaultDirectory,
  disabled,
  onDirectoryChange,
  onDirectoryDetach,
  className,
}: ComposerTrayProps) {
  return (
    <div
      inert={disabled}
      className={cn(
        "relative z-0 -mt-6 rounded-b-3xl bg-input/20 px-2.5 pt-8 pb-2 transition-opacity duration-200",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-1 text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1">
          <ComposerFolderPicker
            attachedDirectory={attachedDirectory}
            defaultDirectory={defaultDirectory}
            disabled={disabled}
            onDirectoryChange={onDirectoryChange}
            onDirectoryDetach={onDirectoryDetach}
          />
          {/* Permission mode control is not ready yet. */}
        </div>
      </div>
    </div>
  );
}
