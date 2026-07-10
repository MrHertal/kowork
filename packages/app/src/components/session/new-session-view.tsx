import { motion } from "motion/react";
import { useState } from "react";

import { Logo } from "@/components/logo";
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
  const [spins, setSpins] = useState(0);

  return (
    <div className="flex items-center justify-center gap-3">
      <motion.button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => setSpins((count) => count + 1)}
        className="inline-flex shrink-0 cursor-pointer border-0 bg-transparent p-0 outline-none"
        animate={{ rotate: spins * 360 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <Logo className="h-9 w-auto text-primary" />
      </motion.button>
      <h1 className="text-2xl font-normal tracking-tight text-balance">
        {welcome()}
      </h1>
    </div>
  );
}
