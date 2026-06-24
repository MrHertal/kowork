import { Separator } from "@/components/ui/separator";
import { m } from "@/paraglide/messages";

export function CompactionPart() {
  return (
    <div className="flex items-center gap-3 py-2">
      <Separator className="flex-1" />
      <span className="cursor-default text-xs text-muted-foreground">
        {m.session_divider_compaction()}
      </span>
      <Separator className="flex-1" />
    </div>
  );
}
