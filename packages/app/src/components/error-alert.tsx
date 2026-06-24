import { ChevronDownIcon, CircleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { m } from "@/paraglide/messages";

export interface ErrorAlertProps {
  text: string;
  title?: string;
  className?: string;
}

export function ErrorAlert({ text, title, className }: ErrorAlertProps) {
  if (!text) return null;
  return (
    <Collapsible className={className}>
      <Alert variant="destructive">
        <CircleAlertIcon />
        <CollapsibleTrigger className="group/details col-start-2 flex w-full items-center justify-between gap-2 text-left">
          <AlertTitle>{title ?? m.session_error_generic_title()}</AlertTitle>
          <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/details:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="col-start-2 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <AlertDescription className="pt-1 text-destructive/90">
            {text}
          </AlertDescription>
        </CollapsibleContent>
      </Alert>
    </Collapsible>
  );
}
