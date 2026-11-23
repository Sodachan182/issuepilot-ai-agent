import { ChevronRight, Quote } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "../../lib/format";
import type { Evidence } from "../../lib/types";

export function EvidenceDisclosure({
  evidence,
  onQuoteClick,
  label = "Why?",
}: {
  evidence: Evidence[];
  onQuoteClick?: (e: Evidence) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!evidence.length) return null;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded text-[12px] font-medium text-muted hover:text-fg"
      >
        <ChevronRight size={13} className={cn("transition-transform", open && "rotate-90")} aria-hidden />
        {label}
        <span className="font-normal text-subtle">({evidence.length})</span>
      </button>
      {open ? (
        <ul id={id} className="mt-2 space-y-2">
          {evidence.map((e, i) => (
            <li key={i} className="border-l-2 border-border-strong pl-3">
              <p className="text-[12px] font-medium text-muted">{e.claim}</p>
              <button
                type="button"
                onClick={() => onQuoteClick?.(e)}
                className="mt-0.5 flex w-full items-start gap-1.5 rounded text-left hover:bg-surface-2"
                title="Show in the original issue"
              >
                <Quote size={12} className="mt-1 shrink-0 text-subtle" aria-hidden />
                <span className="text-[13px]">{e.quote}</span>
              </button>
              <p className="mt-0.5 text-[11px] text-subtle">from {e.source}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
