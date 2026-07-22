import { ExternalLinkIcon } from "lucide-react";
import type { LinkSafetyConfig, LinkSafetyModalProps } from "streamdown";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { m } from "@/paraglide/messages";

function ExternalLinkDialog({
  isOpen,
  onClose,
  onConfirm,
  url,
}: LinkSafetyModalProps) {
  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.dialog_externalLink_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.dialog_externalLink_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <code className="max-h-32 overflow-y-auto rounded-3xl bg-input/50 px-3 py-2 font-mono text-sm break-all">
          {url}
        </code>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
            {m.dialog_externalLink_action()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const streamdownLinkSafety: LinkSafetyConfig = {
  enabled: true,
  renderModal: (props) => <ExternalLinkDialog {...props} />,
};
