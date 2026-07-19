import { useState } from "react";

import { KoworkIcon } from "@/components/kowork-icon";
import { m } from "@/paraglide/messages";

const welcomeMessages = [
  m.session_new_welcome_1,
  m.session_new_welcome_2,
  m.session_new_welcome_3,
  m.session_new_welcome_4,
] as const;

export function NewSessionView() {
  const [welcome] = useState(
    () =>
      welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)] ??
      welcomeMessages[0],
  );
  return (
    <div className="flex items-center justify-center gap-3">
      <KoworkIcon />
      <h1 className="text-2xl font-normal tracking-tight text-balance">
        {welcome()}
      </h1>
    </div>
  );
}
