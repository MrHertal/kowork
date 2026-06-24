import { m } from "@/paraglide/messages";

export function NewSessionView() {
  return (
    <div className="flex size-full items-center justify-center px-6 pb-30">
      <p className="text-sm text-muted-foreground">{m.session_new_welcome()}</p>
    </div>
  );
}
