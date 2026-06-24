import type { ErrorComponentProps } from "@tanstack/react-router";

import { ErrorAlert } from "@/components/error-alert";
import { Titlebar } from "@/components/titlebar";
import { m } from "@/paraglide/messages";

export function ErrorScreen({ error }: ErrorComponentProps) {
  return (
    <div className="flex h-screen flex-col">
      <Titlebar />
      <div className="flex flex-1 items-center justify-center px-4">
        <ErrorAlert
          className="w-full max-w-2xl"
          title={m.error_screen_message()}
          text={error.message}
        />
      </div>
    </div>
  );
}
