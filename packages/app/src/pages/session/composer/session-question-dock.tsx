import type {
  QuestionAnswer,
  QuestionRequest,
} from "@opencode-ai/sdk/v2/client";
import { CheckIcon, MessageCircleQuestionIcon } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { DockPrompt } from "@/components/session/dock-prompt";
import { Button } from "@/components/ui/button";
import { useSDK } from "@/contexts/sdk";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

interface SessionQuestionDockProps {
  request: QuestionRequest;
}

interface Store {
  tab: number;
  answers: QuestionAnswer[];
  custom: string[];
  customOn: boolean[];
  editing: boolean;
  focus: number;
}

const CACHE_MAX = 50;
const cache = new Map<
  string,
  {
    tab: number;
    answers: QuestionAnswer[];
    custom: string[];
    customOn: boolean[];
  }
>();

function cacheSet(
  id: string,
  value: {
    tab: number;
    answers: QuestionAnswer[];
    custom: string[];
    customOn: boolean[];
  },
) {
  if (cache.has(id)) cache.delete(id);
  cache.set(id, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function SessionQuestionDock({ request }: SessionQuestionDockProps) {
  const sdk = useSDK();
  const rootRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLButtonElement>(null);
  const optsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const repliedRef = useRef(false);
  const sendingRef = useRef(false);
  const focusFrameRef = useRef<number | undefined>(undefined);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusIndexRef = useRef(0);

  const questions = request.questions;
  const total = questions.length;

  const cached = useMemo(() => cache.get(request.id), [request.id]);
  const [store, setStore] = useState<Store>(() => ({
    tab: cached?.tab ?? 0,
    answers: cached?.answers ?? [],
    custom: cached?.custom ?? [],
    customOn: cached?.customOn ?? [],
    editing: false,
    focus: 0,
  }));
  const [sending, setSending] = useState(false);

  const question = questions[store.tab];
  const options = question?.options ?? [];
  const input = store.custom[store.tab] ?? "";
  const on = store.customOn[store.tab] === true;
  const multi = question?.multiple === true;
  const count = options.length + 1;
  const last = store.tab >= total - 1;

  const summary = useMemo(() => {
    const n = Math.min(store.tab + 1, total);
    return m.session_question_progress({
      current: String(n),
      total: String(total),
    });
  }, [store.tab, total]);

  // --- Focus management ---

  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(count - 1, i)),
    [count],
  );

  const pickFocus = useCallback(
    (tab: number = store.tab) => {
      const list = questions[tab]?.options ?? [];
      if (store.customOn[tab] === true) return list.length;
      return Math.max(
        0,
        list.findIndex(
          (item) => store.answers[tab]?.includes(item.label) ?? false,
        ),
      );
    },
    [questions, store.answers, store.customOn, store.tab],
  );

  const focus = useCallback(
    (i: number) => {
      const next = clamp(i);
      focusIndexRef.current = next;
      setStore((prev) =>
        prev.focus === next ? prev : { ...prev, focus: next },
      );
      if (focusFrameRef.current !== undefined)
        cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = requestAnimationFrame(() => {
        focusFrameRef.current = undefined;
        const el =
          next === options.length ? customRef.current : optsRef.current[next];
        el?.focus();
      });
    },
    [clamp, options.length],
  );

  useEffect(() => {
    focus(pickFocus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    return () => {
      if (focusFrameRef.current !== undefined)
        cancelAnimationFrame(focusFrameRef.current);
      if (focusTimerRef.current !== null) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      if (repliedRef.current) return;
      const s = storeRef.current;
      cacheSet(request.id, {
        tab: s.tab,
        answers: s.answers.map((a) => (a ? [...a] : [])),
        custom: s.custom.map((v) => v ?? ""),
        customOn: s.customOn.map((b) => b ?? false),
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- SDK calls ---

  const reply = useCallback(
    async (answers: QuestionAnswer[]) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      cache.delete(request.id);
      try {
        await sdk.client.question.reply({ requestID: request.id, answers });
        repliedRef.current = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(m.common_requestFailed(), { description: message });
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [sdk.client.question, request.id],
  );

  const reject = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    cache.delete(request.id);
    try {
      await sdk.client.question.reject({ requestID: request.id });
      repliedRef.current = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(m.common_requestFailed(), { description: message });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [sdk.client.question, request.id]);

  // --- Actions ---

  const customUpdate = useCallback(
    (value: string, selected: boolean = on) => {
      const prev = input.trim();
      const next = value.trim();

      setStore((s) => {
        const custom = setAt(s.custom, s.tab, value);
        if (!selected) return { ...s, custom };

        if (multi) {
          const current = s.answers[s.tab] ?? [];
          const removed = prev
            ? current.filter((item) => item.trim() !== prev)
            : current;
          const final =
            next && !removed.some((item) => item.trim() === next)
              ? [...removed, next]
              : removed;
          return { ...s, custom, answers: setAt(s.answers, s.tab, final) };
        }

        return {
          ...s,
          custom,
          answers: setAt(s.answers, s.tab, next ? [next] : []),
        };
      });
    },
    [on, input, multi],
  );

  const picked = useCallback(
    (answer: string) => store.answers[store.tab]?.includes(answer) ?? false,
    [store.answers, store.tab],
  );

  const pick = useCallback((answer: string, custom = false) => {
    setStore((prev) => {
      const answers = setAt(prev.answers, prev.tab, [answer]);
      const c = custom ? setAt(prev.custom, prev.tab, answer) : prev.custom;
      const co = custom ? prev.customOn : setAt(prev.customOn, prev.tab, false);
      return { ...prev, answers, custom: c, customOn: co, editing: false };
    });
  }, []);

  const toggle = useCallback((answer: string) => {
    setStore((prev) => {
      const current = prev.answers[prev.tab] ?? [];
      const next = current.includes(answer)
        ? current.filter((item) => item !== answer)
        : [...current, answer];
      return { ...prev, answers: setAt(prev.answers, prev.tab, next) };
    });
  }, []);

  const commitCustom = useCallback(() => {
    setStore((prev) => ({ ...prev, editing: false }));
    customUpdate(input);
    focus(options.length);
  }, [customUpdate, input, focus, options.length]);

  const selectOption = useCallback(
    (optIndex: number) => {
      if (sending) return;

      if (optIndex === options.length) {
        setStore((prev) => ({
          ...prev,
          focus: options.length,
          customOn: setAt(prev.customOn, prev.tab, true),
          editing: true,
        }));
        customUpdate(input, true);
        return;
      }

      const opt = options[optIndex];
      if (!opt) return;
      if (multi) {
        setStore((prev) => ({ ...prev, editing: false }));
        toggle(opt.label);
        return;
      }
      pick(opt.label);
    },
    [sending, options, multi, toggle, pick, customUpdate, input],
  );

  const collectAnswers = useCallback(() => {
    if (!store.editing || !on) {
      return questions.map((_, i) => store.answers[i] ?? []);
    }
    const value = input.trim();
    const current = store.answers[store.tab] ?? [];
    let tabAnswers: string[];
    if (multi) {
      const removed = value
        ? current.filter((item) => item.trim() !== value)
        : current;
      tabAnswers =
        value && !removed.some((item) => item.trim() === value)
          ? [...removed, value]
          : removed;
    } else {
      tabAnswers = value ? [value] : [];
    }
    return questions.map((_, i) =>
      i === store.tab ? tabAnswers : (store.answers[i] ?? []),
    );
  }, [store.editing, store.answers, store.tab, on, input, multi, questions]);

  const scheduleFocus = useCallback(
    (tab: number) => {
      if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        focus(pickFocus(tab));
      }, 0);
    },
    [focus, pickFocus],
  );

  const next = useCallback(() => {
    if (sendingRef.current) return;
    if (store.editing) commitCustom();

    if (store.tab >= total - 1) {
      void reply(collectAnswers());
      return;
    }

    const tab = store.tab + 1;
    setStore((prev) => ({ ...prev, tab, editing: false }));
    scheduleFocus(tab);
  }, [
    store.editing,
    store.tab,
    total,
    commitCustom,
    reply,
    collectAnswers,
    scheduleFocus,
  ]);

  const back = useCallback(() => {
    if (sending) return;
    if (store.tab <= 0) return;
    const tab = store.tab - 1;
    setStore((prev) => ({ ...prev, tab, editing: false }));
    scheduleFocus(tab);
  }, [sending, store.tab, scheduleFocus]);

  const jump = useCallback(
    (tab: number) => {
      if (sending) return;
      setStore((prev) => ({ ...prev, tab, editing: false }));
      scheduleFocus(tab);
    },
    [sending, scheduleFocus],
  );

  const customToggle = useCallback(() => {
    if (sending) return;

    if (!multi) {
      setStore((prev) => ({
        ...prev,
        focus: options.length,
        customOn: setAt(prev.customOn, prev.tab, true),
        editing: true,
      }));
      customUpdate(input, true);
      return;
    }

    const nextOn = !on;
    if (nextOn) {
      setStore((prev) => ({
        ...prev,
        focus: options.length,
        customOn: setAt(prev.customOn, prev.tab, true),
        editing: true,
      }));
      customUpdate(input, true);
      return;
    }

    const value = input.trim();
    setStore((prev) => {
      const answers = value
        ? setAt(
            prev.answers,
            prev.tab,
            (prev.answers[prev.tab] ?? []).filter(
              (item) => item.trim() !== value,
            ),
          )
        : prev.answers;
      return {
        ...prev,
        customOn: setAt(prev.customOn, prev.tab, false),
        editing: false,
        answers,
      };
    });
    focus(options.length);
  }, [sending, multi, on, input, options.length, customUpdate, focus]);

  // --- Keyboard nav ---

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape") {
        event.preventDefault();
        void reject();
        return;
      }

      const mod = (event.metaKey || event.ctrlKey) && !event.altKey;
      if (mod && event.key === "Enter") {
        if (event.repeat) return;
        event.preventDefault();
        next();
        return;
      }

      if (store.editing) return;
      const target = (event.target as HTMLElement)?.closest?.(
        '[data-slot="question-options"]',
      );
      if (!target) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        if (!sendingRef.current) focus(focusIndexRef.current + 1);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        if (!sendingRef.current) focus(focusIndexRef.current - 1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        focus(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        focus(count - 1);
      }
    },
    [reject, next, store.editing, focus, count],
  );

  // --- Render ---

  const answered = (i: number) => {
    if ((store.answers[i]?.length ?? 0) > 0) return true;
    return (
      store.customOn[i] === true && (store.custom[i] ?? "").trim().length > 0
    );
  };

  return (
    <DockPrompt
      kind="question"
      ref={rootRef}
      onKeyDown={handleKeyDown}
      className="max-h-[calc(100dvh-5rem)]"
      header={
        <>
          <MessageCircleQuestionIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{summary}</span>
          {total > 1 && (
            <div className="ml-auto flex items-center gap-1.5">
              {questions.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={sending}
                  onClick={() => jump(i)}
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    i === store.tab
                      ? "bg-foreground"
                      : answered(i)
                        ? "bg-foreground/50"
                        : "bg-muted-foreground/30",
                  )}
                  aria-label={`${m.session_tool_questions()} ${i + 1}`}
                />
              ))}
            </div>
          )}
        </>
      }
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={sending}
            onClick={() => void reject()}
            aria-keyshortcuts="Escape"
          >
            {m.common_dismiss()}
          </Button>
          <div className="flex items-center gap-2">
            {store.tab > 0 && (
              <Button
                variant="secondary"
                size="sm"
                disabled={sending}
                onClick={back}
              >
                {m.common_back()}
              </Button>
            )}
            <Button
              variant={last ? "default" : "secondary"}
              size="sm"
              disabled={sending}
              onClick={next}
              aria-keyshortcuts="Meta+Enter Control+Enter"
            >
              {last ? m.common_submit() : m.common_next()}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="shrink-0 text-sm">{question?.question}</p>
        <p className="shrink-0 text-xs text-muted-foreground">
          {multi
            ? m.session_question_hint_multi()
            : m.session_question_hint_single()}
        </p>
        <div
          data-slot="question-options"
          className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1"
        >
          {options.map((opt, i) => (
            <OptionButton
              key={i}
              multi={multi}
              picked={picked(opt.label)}
              label={opt.label}
              description={opt.description}
              disabled={sending}
              ref={(el) => {
                if (el) optsRef.current[i] = el;
                else delete optsRef.current[i];
              }}
              onFocus={() => {
                focusIndexRef.current = i;
                setStore((prev) => ({ ...prev, focus: i }));
              }}
              onClick={() => selectOption(i)}
            />
          ))}

          {store.editing ? (
            <CustomInputForm
              multi={multi}
              picked={on}
              value={input}
              sending={sending}
              onToggleMark={customToggle}
              onInput={(value) => customUpdate(value, on)}
              onCommit={commitCustom}
              onCancel={() => {
                setStore((prev) => ({ ...prev, editing: false }));
                focus(options.length);
              }}
            />
          ) : (
            <OptionButton
              ref={customRef}
              multi={multi}
              picked={on}
              label={m.session_question_type_own_answer()}
              description={input || m.session_question_custom_placeholder()}
              disabled={sending}
              onFocus={() => {
                focusIndexRef.current = options.length;
                setStore((prev) => ({ ...prev, focus: options.length }));
              }}
              onClick={() => {
                if (!sending) {
                  setStore((prev) => ({
                    ...prev,
                    focus: options.length,
                    customOn: setAt(prev.customOn, prev.tab, true),
                    editing: true,
                  }));
                  customUpdate(input, true);
                }
              }}
              onMarkClick={customToggle}
            />
          )}
        </div>
      </div>
    </DockPrompt>
  );
}

// --- Sub-components ---

function Mark({ multi, picked }: { multi: boolean; picked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 items-center justify-center border transition-colors",
        multi ? "rounded-sm" : "rounded-full",
        picked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/40",
      )}
    >
      {picked &&
        (multi ? (
          <CheckIcon className="size-3" />
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        ))}
    </span>
  );
}

interface OptionButtonProps {
  multi: boolean;
  picked: boolean;
  label: string;
  description?: string;
  disabled: boolean;
  ref?: React.Ref<HTMLButtonElement>;
  onFocus?: () => void;
  onClick: () => void;
  onMarkClick?: () => void;
}

function OptionButton({
  multi,
  picked,
  label,
  description,
  disabled,
  ref,
  onFocus,
  onClick,
  onMarkClick,
}: OptionButtonProps) {
  return (
    <button
      type="button"
      ref={ref}
      role={multi ? "checkbox" : "radio"}
      aria-checked={picked}
      disabled={disabled}
      onFocus={onFocus}
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        picked ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
      )}
    >
      <span
        className="mt-0.5 shrink-0"
        onClick={
          onMarkClick
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                onMarkClick();
              }
            : undefined
        }
      >
        <Mark multi={multi} picked={picked} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </span>
    </button>
  );
}

function CustomInputForm({
  multi,
  picked,
  value,
  sending,
  onToggleMark,
  onInput,
  onCommit,
  onCancel,
}: {
  multi: boolean;
  picked: boolean;
  value: string;
  sending: boolean;
  onToggleMark: () => void;
  onInput: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.style.height = "0px";
        el.style.height = `${el.scrollHeight}px`;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <form
      role={multi ? "checkbox" : "radio"}
      aria-checked={picked}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm",
        picked ? "border-primary bg-primary/5" : "border-border",
      )}
      onMouseDown={(e) => {
        if (sending) {
          e.preventDefault();
          return;
        }
        if (e.target instanceof HTMLTextAreaElement) return;
        textareaRef.current?.focus();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        onCommit();
      }}
    >
      <span
        className="mt-0.5 shrink-0 cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleMark();
        }}
      >
        <Mark multi={multi} picked={picked} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium">
          {m.session_question_type_own_answer()}
        </span>
        <textarea
          ref={textareaRef}
          placeholder={m.session_question_custom_placeholder()}
          value={value}
          rows={1}
          disabled={sending}
          className="w-full resize-none border-none bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
              return;
            }
            if ((e.metaKey || e.ctrlKey) && !e.altKey) return;
            if (e.key !== "Enter" || e.shiftKey) return;
            e.preventDefault();
            onCommit();
          }}
          onChange={(e) => {
            onInput(e.target.value);
            resize(e.target);
          }}
        />
      </span>
    </form>
  );
}

// --- Helpers ---

function setAt<T>(arr: T[], index: number, value: T): T[] {
  const next = [...arr];
  next[index] = value;
  return next;
}
