import { Check, Copy, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MarkdownView } from "../../components/app/MarkdownView";
import { Button, Tabs, Textarea } from "../../components/ui/primitives";
import type { Proposal } from "../../lib/types";

const MAX = 2000;

export function DraftReplyEditor({
  proposal,
  draft,
  editing,
  onEditingChange,
  onSave,
  saving,
  readOnly,
}: {
  proposal: Proposal | undefined;
  draft: string;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  onSave: (body: string) => void;
  saving?: boolean;
  readOnly?: boolean;
}) {
  const current = proposal?.payload.body ?? draft;
  const [value, setValue] = useState(current);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    if (!editing) setValue(current);
  }, [current, editing]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current);
      toast.success("Draft reply copied");
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  return (
    <section aria-labelledby="draft-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="draft-heading" className="text-[13px] font-semibold">
          Draft reply <span className="font-normal text-subtle">· suggested, not posted</span>
        </h3>
        <div className="flex items-center gap-1">
          {proposal?.edited ? <span className="mr-1 text-[12px] text-accent-text">Edited</span> : null}
          {!editing && !readOnly ? (
            <Button size="sm" variant="ghost" onClick={() => onEditingChange(true)} aria-keyshortcuts="e">
              <Pencil size={13} strokeWidth={1.75} aria-hidden /> Edit
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={copy}>
            <Copy size={13} strokeWidth={1.75} aria-hidden /> Copy
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2 rounded-lg border border-border">
          <Tabs
            label="Draft editor mode"
            value={tab}
            onChange={setTab}
            items={[
              { value: "write", label: "Write" },
              { value: "preview", label: "Preview" },
            ]}
            className="px-2"
          />
          <div className="p-2">
            {tab === "write" ? (
              <Textarea
                aria-label="Draft reply"
                value={value}
                maxLength={MAX}
                autoFocus
                rows={Math.min(14, Math.max(6, value.split("\n").length + 2))}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    onEditingChange(false);
                  }
                }}
              />
            ) : (
              <div className="min-h-24 px-1 py-1">
                <MarkdownView source={value} showImages={false} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-2">
            <span className="text-[12px] text-subtle tnum">
              {value.length.toLocaleString()} / {MAX.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => onEditingChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!value.trim() || saving || value === current}
                onClick={() => onSave(value)}
              >
                <Check size={13} aria-hidden /> Save
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-border bg-surface px-3 py-2.5">
          <MarkdownView source={current} showImages={false} />
        </div>
      )}

      {proposal?.edited && proposal.original_payload.body ? (
        <div className="mt-1.5">
          <button
            type="button"
            className="text-[12px] text-muted underline-offset-2 hover:underline"
            aria-expanded={showOriginal}
            onClick={() => setShowOriginal((v) => !v)}
          >
            {showOriginal ? "Hide original suggestion" : "View original suggestion"}
          </button>
          {showOriginal ? (
            <div className="mt-1.5 rounded-md border border-dashed border-border px-3 py-2 text-muted">
              <MarkdownView source={proposal.original_payload.body} showImages={false} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
