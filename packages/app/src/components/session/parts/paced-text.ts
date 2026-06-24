// @opencode-ref: opencode/packages/ui/src/components/message-part.tsx
import { useEffect, useRef, useState } from "react";

const TEXT_RENDER_PACE_MS = 24;
const TEXT_RENDER_SNAP = /[\s.,!?;:)\]]/;

function step(size: number) {
  if (size <= 12) return 2;
  if (size <= 48) return 4;
  if (size <= 96) return 8;
  return Math.min(24, Math.ceil(size / 8));
}

function next(text: string, start: number) {
  const end = Math.min(text.length, start + step(text.length - start));
  const max = Math.min(text.length, end + 8);
  for (let i = end; i < max; i++) {
    if (TEXT_RENDER_SNAP.test(text[i] ?? "")) return i + 1;
  }
  return end;
}

export function usePacedText(text: string, live: boolean): string {
  const [shown, setShown] = useState(text);
  const shownRef = useRef(text);
  const targetRef = useRef(text);
  const liveRef = useRef(live);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  targetRef.current = text;
  liveRef.current = live;

  useEffect(() => {
    const sync = (value: string) => {
      shownRef.current = value;
      setShown(value);
    };

    const clear = () => {
      if (timeoutRef.current === undefined) return;
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    };

    const run = () => {
      timeoutRef.current = undefined;
      const target = targetRef.current;
      if (!liveRef.current) {
        sync(target);
        return;
      }
      if (
        !target.startsWith(shownRef.current) ||
        target.length <= shownRef.current.length
      ) {
        sync(target);
        return;
      }
      const end = next(target, shownRef.current.length);
      sync(target.slice(0, end));
      if (end < target.length) {
        timeoutRef.current = setTimeout(run, TEXT_RENDER_PACE_MS);
      }
    };

    if (!live) {
      clear();
      sync(text);
      return;
    }
    if (
      !text.startsWith(shownRef.current) ||
      text.length < shownRef.current.length
    ) {
      clear();
      sync(text);
      return;
    }
    if (
      text.length === shownRef.current.length ||
      timeoutRef.current !== undefined
    ) {
      return;
    }
    timeoutRef.current = setTimeout(run, TEXT_RENDER_PACE_MS);
  }, [text, live]);

  useEffect(
    () => () => {
      if (timeoutRef.current === undefined) return;
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    },
    [],
  );

  return shown;
}
