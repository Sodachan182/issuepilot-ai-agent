import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Cpu,
  FolderGit2,
  Gauge,
  History,
  Inbox,
  Keyboard,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  WifiOff,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { clockTime, cn } from "../../lib/format";
import { useHotkeys } from "../../lib/keyboard";
import { usePersistentState, useTheme, type ThemeChoice } from "../../lib/theme";
import { Button, Dialog, Kbd, Select, Sheet, Tooltip } from "../ui/primitives";
import { RepoModeBadge } from "./badges";
import { BrandMark } from "./BrandMark";

export function useCurrentRepoId(): [number | null, (id: number | null) => void] {
  const params = useParams();
  const [stored, setStored] = usePersistentState<number | null>("issuepilot.repo", null);
  const fromUrl = params.repoId ? Number(params.repoId) : null;
  return [fromUrl ?? stored, setStored];
}

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed,
  onNavigate,
  disabled,
}: {
  to: string;
  icon: typeof Inbox;
  label: string;
  collapsed: boolean;
  onNavigate?: () => void;
  disabled?: boolean;
}) {
  const content = (
    <NavLink
      to={to}
      end={to === "/repos"}
      onClick={onNavigate}
      aria-disabled={disabled}
      className={({ isActive }) =>
        cn(
          "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
          isActive ? "bg-accent-subtle text-accent-text" : "text-muted hover:bg-surface-2 hover:text-fg",
          collapsed && "justify-center px-0",
          disabled && "pointer-events-none opacity-50",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span aria-hidden className="absolute top-1.5 bottom-1.5 -left-2 w-0.5 rounded bg-accent" /> : null}
          <Icon size={16} strokeWidth={1.75} aria-hidden />
          {collapsed ? <span className="sr-only">{label}</span> : <span>{label}</span>}
        </>
      )}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip content={label} side="right">
      {content}
    </Tooltip>
  ) : (
    content
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const [repoId] = useCurrentRepoId();
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2">
      <NavItem to="/repos" icon={FolderGit2} label="Repositories" collapsed={collapsed} onNavigate={onNavigate} />
      <NavItem
        to={repoId ? `/repos/${repoId}/issues` : "/repos"}
        icon={Inbox}
        label="Inbox"
        collapsed={collapsed}
        onNavigate={onNavigate}
        disabled={!repoId}
      />
      <NavItem to="/history" icon={History} label="History" collapsed={collapsed} onNavigate={onNavigate} />
      <NavItem to="/reports" icon={BarChart3} label="Reports" collapsed={collapsed} onNavigate={onNavigate} />
      <div className="mt-auto border-t border-border pt-2 pb-2">
        <NavItem to="/settings" icon={Settings} label="Settings" collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

const THEME_ICON: Record<ThemeChoice, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const Icon = THEME_ICON[theme];
  return (
    <Tooltip content={`Theme: ${theme}. Click to switch.`}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Theme: ${theme}. Switch to ${NEXT_THEME[theme]}`}
        onClick={() => setTheme(NEXT_THEME[theme])}
      >
        <Icon size={16} strokeWidth={1.75} />
      </Button>
    </Tooltip>
  );
}

function ProviderPill() {
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 30_000 });
  const ai = config.data?.ai;
  if (!ai) return null;
  if (ai.mode === "heuristic") {
    return (
      <Tooltip content="Rule-based keyword analysis. No AI model is used. Configure GEMINI_API_KEY and AI_PROVIDER=gemini in .env for AI analysis.">
        <span
          tabIndex={0}
          className="hidden h-6 items-center gap-1.5 rounded-md border border-warning/40 px-2 text-[12px] font-medium text-warning sm:inline-flex"
        >
          <Cpu size={13} strokeWidth={1.75} aria-hidden />
          Heuristic mode
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      content={
        ai.configured
          ? `AI analysis by ${ai.provider_label} · ${ai.model}`
          : `${ai.provider_label} is selected but not configured. Add its API key and model to .env.`
      }
    >
      <span
        tabIndex={0}
        className={cn(
          "hidden h-6 max-w-[240px] items-center gap-1.5 truncate rounded-md border px-2 text-[12px] font-medium sm:inline-flex",
          ai.configured ? "border-accent/40 text-accent-text" : "border-danger/40 text-danger",
        )}
      >
        <span aria-hidden className={cn("size-1.5 rounded-full", ai.configured ? "bg-success" : "bg-danger")} />
        AI · {ai.provider_label === "Gemini" ? ai.model : `${ai.provider_label} · ${ai.model}`}
      </span>
    </Tooltip>
  );
}

function RateLimitPill() {
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 30_000 });
  const rl = config.data?.github.rate_limit;
  if (!rl || rl.limit === null || rl.remaining === null) return null;
  const low = rl.remaining / rl.limit < 0.1;
  return (
    <Tooltip content={`GitHub API: ${rl.remaining} of ${rl.limit} requests left. Resets at ${clockTime(rl.reset_at)}.`}>
      <span
        tabIndex={0}
        className={cn(
          "hidden h-6 items-center gap-1.5 rounded-md px-1.5 text-[12px] md:inline-flex tnum",
          low ? "text-warning" : "text-subtle",
        )}
      >
        <Gauge size={13} strokeWidth={1.75} aria-hidden />
        {rl.remaining.toLocaleString()}
      </span>
    </Tooltip>
  );
}

function RepoSwitcher() {
  const navigate = useNavigate();
  const [repoId, setRepoId] = useCurrentRepoId();
  const repos = useQuery({ queryKey: ["repos"], queryFn: api.repos });
  const list = repos.data ?? [];
  const current = list.find((r) => r.id === repoId);
  if (!list.length) return <span className="truncate text-muted">No repository connected</span>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor="repo-switcher" className="sr-only">
        Repository
      </label>
      <Select
        id="repo-switcher"
        value={current?.id ?? ""}
        onChange={(e) => {
          const id = Number(e.target.value);
          setRepoId(id);
          navigate(`/repos/${id}/issues`);
        }}
        className="max-w-[180px] truncate border-transparent bg-transparent font-mono text-[12px] hover:border-border sm:max-w-[260px]"
      >
        {!current ? <option value="">Select repository</option> : null}
        {list.map((r) => (
          <option key={r.id} value={r.id}>
            {r.full_name}
          </option>
        ))}
      </Select>
      {current ? (
        <span className="hidden sm:inline-flex">
          <RepoModeBadge status={current.write_status} />
        </span>
      ) : null}
    </div>
  );
}

function OfflineBanner() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 15_000, retry: 1 });
  if (!health.isError) return null;
  return (
    <div role="alert" className="flex items-center gap-2 border-b border-danger/30 bg-danger-subtle px-4 py-2 text-[13px]">
      <WifiOff size={14} strokeWidth={1.75} className="text-danger" aria-hidden />
      <span>Can't reach the IssuePilot backend at 127.0.0.1:8000.</span>
      <Button size="sm" variant="ghost" onClick={() => health.refetch()}>
        Retry
      </Button>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["j / k", "Next / previous issue"],
  ["Enter", "Open focused issue"],
  ["x", "Toggle row selection"],
  ["a", "Analyze current or selected issues"],
  ["e", "Edit draft reply"],
  ["Esc", "Close dialog or leave edit"],
  ["g then i", "Go to inbox"],
  ["g then h", "Go to history"],
  ["g then r", "Go to reports"],
  ["?", "Show keyboard shortcuts"],
];

export function AppShell({ children }: { children?: ReactNode }) {
  const [collapsed, setCollapsed] = usePersistentState("issuepilot.sidebarCollapsed", false);
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const navigate = useNavigate();
  const [repoId] = useCurrentRepoId();

  useHotkeys({
    "?": () => setHelp(true),
    "g i": () => navigate(repoId ? `/repos/${repoId}/issues` : "/repos"),
    "g h": () => navigate("/history"),
    "g r": () => navigate("/reports"),
  });

  return (
    <div className="flex h-full bg-bg text-fg">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-surface md:flex",
          collapsed ? "w-14" : "w-[224px]",
        )}
      >
        <div className={cn("flex h-12 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
          <BrandMark />
          {collapsed ? null : <span className="text-[14px] font-semibold tracking-[-0.01em]">IssuePilot</span>}
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className={cn("flex border-t border-border p-2", collapsed ? "justify-center" : "justify-between")}>
          {collapsed ? null : (
            <Button variant="ghost" size="sm" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts">
              <Keyboard size={14} strokeWidth={1.75} /> Shortcuts
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
          </Button>
        </div>
      </aside>

      <Sheet open={drawer} onOpenChange={setDrawer} title="IssuePilot" side="left" className="w-[260px]">
        <div className="flex h-full flex-col pt-2">
          <SidebarNav collapsed={false} onNavigate={() => setDrawer(false)} />
        </div>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 md:px-4">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={() => setDrawer(true)}>
            <Menu size={16} strokeWidth={1.75} />
          </Button>
          <RepoSwitcher />
          <div className="ml-auto flex items-center gap-1.5">
            <ProviderPill />
            <RateLimitPill />
            <ThemeToggle />
          </div>
        </header>
        <OfflineBanner />
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          {children ?? <Outlet />}
        </main>
      </div>

      <Dialog open={help} onOpenChange={setHelp} title="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <Kbd>{k}</Kbd>
              </dt>
              <dd className="text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  );
}
