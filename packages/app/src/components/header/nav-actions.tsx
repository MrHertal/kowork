import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { DeleteSessionDialog } from "@/components/session/delete-session-dialog";
import { RenameSessionDialog } from "@/components/session/rename-session-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { m } from "@/paraglide/messages";

export function NavActions({
  onDelete,
  onRename,
  title,
}: {
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  title: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 data-[state=open]:bg-accent"
          aria-label={m.common_moreActions()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-fit min-w-48 rounded-lg" align="end">
        <RenameSessionDialog title={title} onConfirm={onRename}>
          {(openDialog) => (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                openDialog();
              }}
            >
              <Pencil className="text-muted-foreground" />
              <span>{m.common_rename()}</span>
            </DropdownMenuItem>
          )}
        </RenameSessionDialog>
        <DeleteSessionDialog title={title} onConfirm={onDelete}>
          {(openDialog) => (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                openDialog();
              }}
            >
              <Trash2 className="text-muted-foreground" />
              <span>{m.common_delete()}</span>
            </DropdownMenuItem>
          )}
        </DeleteSessionDialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
