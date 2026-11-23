import { useEffect, useRef } from "react";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    !!target.closest("[role='dialog']")
  );
}

type Handler = (e: KeyboardEvent) => void;

/**
 * Register single-key shortcuts (e.g. "j", "?") and two-key sequences ("g i").
 * Ignored while typing in inputs or inside dialogs.
 */
export function useHotkeys(map: Record<string, Handler>, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let timer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key;
      if (pending) {
        const combo = `${pending} ${key}`;
        pending = null;
        window.clearTimeout(timer);
        const h = ref.current[combo];
        if (h) {
          e.preventDefault();
          h(e);
        }
        return;
      }
      if (Object.keys(ref.current).some((k) => k.startsWith(`${key} `))) {
        pending = key;
        timer = window.setTimeout(() => (pending = null), 900);
        return;
      }
      const h = ref.current[key];
      if (h) {
        e.preventDefault();
        h(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [enabled]);
}
