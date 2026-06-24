// Defers the optimistic write by `delayMs`: fast errors clear the timer
// before it fires, so users don't see the optimistic state flash in and out.
export function scheduleOptimisticWrite(
  write: () => void,
  rollback: () => void,
  delayMs = 250,
) {
  let committed = false;
  const timer = setTimeout(() => {
    write();
    committed = true;
  }, delayMs);

  return {
    commit: () => {
      clearTimeout(timer);
    },
    rollback: () => {
      clearTimeout(timer);
      if (committed) rollback();
    },
  };
}
