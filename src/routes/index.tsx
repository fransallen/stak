import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseYaml } from "@/lib/k8s/parse";
import { buildRelationships } from "@/lib/k8s/relationships";
import { SAMPLE_YAML } from "@/lib/k8s/sample";
import { parseCompose, buildComposeRelationships } from "@/lib/compose/parse";
import { SAMPLE_COMPOSE } from "@/lib/compose/sample";
import { Board } from "@/components/stak/board";
import { YamlEditor } from "@/components/stak/yaml-editor";
import { ResourceDetails } from "@/components/stak/resource-details";

type Mode = "kubernetes" | "compose";

const MODE_CONFIG: Record<
  Mode,
  {
    label: string;
    short: string;
    sample: string;
    filename: string;
    placeholder: string;
    groupLabel: string;
  }
> = {
  kubernetes: {
    label: "Kubernetes",
    short: "k8s",
    sample: SAMPLE_YAML,
    filename: "manifest.yaml",
    placeholder:
      "# Paste Kubernetes YAML here, or drop a .yaml file.\n# Multi-document files (--- separators) are supported.",
    groupLabel: "namespace",
  },
  compose: {
    label: "Docker Compose",
    short: "compose",
    sample: SAMPLE_COMPOSE,
    filename: "compose.yaml",
    placeholder:
      "# Paste a docker-compose.yaml here, or drop a file.\n# Services, volumes, networks, secrets and configs are supported.",
    groupLabel: "project",
  },
};

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Stak · Visualize your Kubernetes & Docker Compose stacks" },
      {
        name: "description",
        content:
          "Stak turns your Kubernetes manifests and Docker Compose files into a clear visual map of your stack — see services, volumes, networks and how they connect.",
      },
    ],
  }),
});

function Index() {
  const [mode, setMode] = useState<Mode>("kubernetes");
  const [yamlByMode, setYamlByMode] = useState<Record<Mode, string>>({
    kubernetes: SAMPLE_YAML,
    compose: SAMPLE_COMPOSE,
  });
  const yamlText = yamlByMode[mode];
  const setYamlText = (v: string) => setYamlByMode((s) => ({ ...s, [mode]: v }));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(true);
  const [editorWidth, setEditorWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  function startResize(e: React.MouseEvent) {
    resizeDragRef.current = { startX: e.clientX, startWidth: editorWidth };
    setIsResizing(true);
    e.preventDefault();

    function onMouseMove(e: MouseEvent) {
      if (!resizeDragRef.current) return;
      const delta = e.clientX - resizeDragRef.current.startX;
      setEditorWidth(Math.max(200, Math.min(600, resizeDragRef.current.startWidth + delta)));
    }

    function onMouseUp() {
      resizeDragRef.current = null;
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem("stak-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const { resources, errors } = useMemo(
    () => (mode === "kubernetes" ? parseYaml(yamlText) : parseCompose(yamlText)),
    [yamlText, mode],
  );
  const relationships = useMemo(
    () =>
      mode === "kubernetes" ? buildRelationships(resources) : buildComposeRelationships(resources),
    [resources, mode],
  );

  // Clear selection if it no longer exists
  useEffect(() => {
    if (selectedId && !resources.find((r) => r.id === selectedId)) {
      setSelectedId(null);
    }
  }, [resources, selectedId]);

  // Switching mode resets selection
  useEffect(() => {
    setSelectedId(null);
  }, [mode]);

  // Apply theme class on <html>
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("stak-theme", theme);
  }, [theme]);

  const selected = selectedId ? (resources.find((r) => r.id === selectedId) ?? null) : null;
  const cfg = MODE_CONFIG[mode];

  return (
    <div className="flex h-screen flex-col bg-kumo-canvas text-kumo-default">
      <header className="flex items-center justify-between border-b border-kumo-hairline bg-kumo-base px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="leading-tight">
            <Link to="/" className="flex items-baseline gap-1 hover:opacity-75 transition-opacity">
              <span className="text-[15px] font-bold tracking-tight">upset.dev</span>
              <span className="text-[15px] font-normal text-muted-foreground">Stak</span>
            </Link>
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-kumo-subtle">
              Visualize your stack
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Config format"
            className="ml-3 inline-flex rounded-md bg-kumo-recessed p-0.5 hairline"
          >
            {(Object.keys(MODE_CONFIG) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={
                  mode === m
                    ? "rounded-[5px] bg-kumo-base px-2.5 py-1 text-[11px] font-medium text-kumo-default shadow-sm"
                    : "rounded-[5px] px-2.5 py-1 text-[11px] text-kumo-subtle transition-colors hover:text-kumo-default"
                }
              >
                {MODE_CONFIG[m].label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditorOpen((o) => !o)}
            className="rounded-md px-2.5 py-1 text-xs text-kumo-strong transition-colors hover:bg-kumo-tint"
          >
            {editorOpen ? "Hide editor" : "Show editor"}
          </button>
          <a
            href="https://github.com/fransallen/stak"
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-2.5 py-1 text-xs text-kumo-link transition-colors hover:bg-kumo-tint"
          >
            GitHub ↗
          </a>
          <a
            href={
              mode === "kubernetes"
                ? "https://kubernetes.io/docs/concepts/overview/working-with-objects/"
                : "https://docs.docker.com/compose/compose-file/"
            }
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-2.5 py-1 text-xs text-kumo-link transition-colors hover:bg-kumo-tint"
          >
            {cfg.short} docs ↗
          </a>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label="Toggle dark mode"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-md px-2 py-1 text-xs text-kumo-strong transition-colors hover:bg-kumo-tint"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}

      <main
        className="grid min-h-0 flex-1 gap-px bg-kumo-hairline"
        style={{
          gridTemplateColumns: editorOpen
            ? selected
              ? `${editorWidth}px minmax(0, 1fr) minmax(320px, 420px)`
              : `${editorWidth}px minmax(0, 1fr)`
            : selected
              ? "minmax(0, 1fr) minmax(320px, 420px)"
              : "minmax(0, 1fr)",
        }}
      >
        {editorOpen && (
          <div className="relative min-h-0">
            <YamlEditor
              value={yamlText}
              onChange={setYamlText}
              errors={errors}
              resourceCount={resources.length}
              filename={cfg.filename}
              sample={cfg.sample}
              placeholder={cfg.placeholder}
            />
            <div
              onMouseDown={startResize}
              className="absolute inset-y-0 -right-[3px] z-20 w-[7px] cursor-col-resize group"
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-kumo-brand opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </div>
        )}
        <Board
          resources={resources}
          relationships={relationships}
          selectedId={selectedId}
          onSelect={setSelectedId}
          groupLabel={cfg.groupLabel}
        />
        {selected && (
          <ResourceDetails
            resource={selected}
            resources={resources}
            relationships={relationships}
            onSelect={setSelectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </main>
    </div>
  );
}
