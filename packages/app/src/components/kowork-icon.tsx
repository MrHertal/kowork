import { motion } from "motion/react";
import { useState } from "react";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

export function KoworkIcon({ busy = false }: { busy?: boolean }) {
  const [spins, setSpins] = useState(0);

  return (
    <motion.button
      type="button"
      aria-hidden
      tabIndex={-1}
      disabled={busy}
      onClick={() => setSpins((count) => count + 1)}
      className={cn(
        "inline-flex w-fit shrink-0 border-0 bg-transparent p-0 outline-none",
        busy ? "cursor-default" : "cursor-pointer",
      )}
      animate={{ rotate: spins * 360 }}
      whileHover={busy ? undefined : { scale: 1.05 }}
      whileTap={busy ? undefined : { scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <motion.span
        key={busy ? "busy" : "idle"}
        className="inline-flex"
        animate={{ rotate: busy ? 360 : 0 }}
        transition={
          busy
            ? {
                duration: 0.6,
                repeat: Number.POSITIVE_INFINITY,
                ease: "linear",
              }
            : { duration: 0 }
        }
      >
        <Logo className="h-9 w-auto text-primary" />
      </motion.span>
    </motion.button>
  );
}
