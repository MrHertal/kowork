import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { m } from "@/paraglide/messages";

export function RenameSessionDialog({
  title,
  onConfirm,
  children,
}: {
  title: string;
  onConfirm: (newTitle: string) => void;
  children: (openDialog: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(title);
  const [pending, setPending] = useState(false);

  const canSave = value.trim().length > 0 && value.trim() !== title;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setValue(title);
    if (!next) setPending(false);
  }

  function handleSave() {
    if (!canSave || pending) return;
    setPending(true);
    onConfirm(value.trim());
    setOpen(false);
  }

  return (
    <>
      {children(() => handleOpenChange(true))}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.dialog_rename_title()}</DialogTitle>
            <DialogDescription>
              {m.dialog_rename_description()}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            autoFocus
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{m.common_cancel()}</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={!canSave || pending}>
              {m.common_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
