import { ImageOff } from "lucide-react";
import { Children, cloneElement, isValidElement, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Button } from "../ui/primitives";

export interface Highlight {
  text: string;
  kind: "evidence" | "injection";
  id?: string;
}

function highlightString(text: string, highlights: Highlight[], keyPrefix: string): ReactNode {
  if (!highlights.length || !text) return text;
  const lower = text.toLowerCase();
  type Hit = { start: number; end: number; h: Highlight };
  const hits: Hit[] = [];
  for (const h of highlights) {
    const needle = h.text.trim().toLowerCase();
    if (needle.length < 3) continue;
    let idx = lower.indexOf(needle);
    while (idx !== -1) {
      hits.push({ start: idx, end: idx + needle.length, h });
      idx = lower.indexOf(needle, idx + needle.length);
    }
  }
  if (!hits.length) return text;
  hits.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let pos = 0;
  hits.forEach((hit, i) => {
    if (hit.start < pos) return;
    if (hit.start > pos) out.push(text.slice(pos, hit.start));
    out.push(
      <mark
        key={`${keyPrefix}-${i}`}
        data-highlight={hit.h.id}
        className={hit.h.kind === "injection" ? "ip-injection" : "ip-highlight"}
      >
        {text.slice(hit.start, hit.end)}
      </mark>,
    );
    pos = hit.end;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

function withHighlights(children: ReactNode, highlights: Highlight[], prefix = "h"): ReactNode {
  return Children.map(children, (child, i) => {
    if (typeof child === "string") return highlightString(child, highlights, `${prefix}${i}`);
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children !== undefined) {
      return cloneElement(child, undefined, withHighlights(child.props.children, highlights, `${prefix}${i}-`));
    }
    return child;
  });
}

/**
 * Renders untrusted issue markdown safely: no raw HTML (react-markdown default),
 * rehype-sanitize, hardened links, and remote images blocked until the user opts in.
 */
export function MarkdownView({
  source,
  highlights = [],
  showImages,
  onShowImages,
}: {
  source: string;
  highlights?: Highlight[];
  showImages: boolean;
  onShowImages?: () => void;
}) {
  const hasImages = /!\[[^\]]*\]\([^)]+\)|<img\s/i.test(source);
  const components = useMemo<Components>(() => {
    const hl = (children: ReactNode) => withHighlights(children, highlights);
    return {
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">
          {hl(children)}
        </a>
      ),
      img: ({ src, alt }) =>
        showImages ? (
          <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="max-w-full rounded" referrerPolicy="no-referrer" />
        ) : (
          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 text-[12px] text-subtle">
            <ImageOff size={12} aria-hidden /> image hidden{alt ? `: ${alt}` : ""}
          </span>
        ),
      p: ({ children }) => <p>{hl(children)}</p>,
      li: ({ children }) => <li>{hl(children)}</li>,
      td: ({ children }) => <td>{hl(children)}</td>,
      h1: ({ children }) => <h3>{hl(children)}</h3>,
      h2: ({ children }) => <h3>{hl(children)}</h3>,
      h3: ({ children }) => <h3>{hl(children)}</h3>,
      h4: ({ children }) => <h4>{hl(children)}</h4>,
      code: ({ children, className }) => <code className={className}>{hl(children)}</code>,
      // Scrollable code blocks must be reachable by keyboard (WCAG 2.1.1).
      pre: ({ children }) => (
        <pre tabIndex={0} aria-label="Code block">
          {children}
        </pre>
      ),
    };
  }, [highlights, showImages]);

  if (!source.trim()) return <p className="text-subtle italic">No description provided.</p>;
  return (
    <div>
      <div className="prose-issue">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={components}>
          {source}
        </ReactMarkdown>
      </div>
      {hasImages && !showImages && onShowImages ? (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-subtle">
          <span>Images are hidden to avoid loading remote content.</span>
          <Button size="sm" variant="ghost" onClick={onShowImages}>
            Show images
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export { highlightString };
