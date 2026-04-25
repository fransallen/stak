import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { K8sResource } from "@/lib/k8s/parse";
import type { Relationship, RelationKind } from "@/lib/k8s/relationships";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/k8s/categories";
import { ResourceCard } from "./resource-card";
import { cn } from "@/lib/utils";

interface BoardProps {
  resources: K8sResource[];
  relationships: Relationship[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  groupLabel?: string;
}

const RELATION_STYLE: Record<RelationKind, { color: string; dash?: string; label: string }> = {
  selects: { color: "var(--color-kind-network)", label: "selects" },
  mounts: { color: "var(--color-kind-config)", dash: "4 3", label: "mounts" },
  owns: { color: "var(--color-kumo-strong)", label: "owns" },
  routes: { color: "var(--color-kind-network)", label: "routes" },
  binds: { color: "var(--color-kind-rbac)", dash: "4 3", label: "binds" },
  "uses-sa": { color: "var(--color-kind-rbac)", dash: "2 3", label: "uses SA" },
  scales: { color: "var(--color-kind-workload)", label: "scales" },
  "in-namespace": { color: "var(--color-kumo-hairline-strong)", dash: "1 4", label: "in ns" },
};

interface CardRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Board({ resources, relationships, selectedId, onSelect, groupLabel = "namespace" }: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Record<string, CardRect>>({});
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showNamespaceLinks, setShowNamespaceLinks] = useState(false);
  const [view, setView] = useState({ x: 24, y: 24, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const viewRef = useRef(view);
  const didDragRef = useRef(false);
  useLayoutEffect(() => { viewRef.current = view; }, [view]);

  const byNamespace = new Map<string, K8sResource[]>();
  for (const r of resources) {
    const list = byNamespace.get(r.namespace) ?? [];
    list.push(r);
    byNamespace.set(r.namespace, list);
  }
  const namespaces = Array.from(byNamespace.keys()).sort();

  const focusId = hoverId ?? selectedId;

  const neighbors = new Map<string, Set<string>>();
  for (const rel of relationships) {
    if (!neighbors.has(rel.from)) neighbors.set(rel.from, new Set());
    if (!neighbors.has(rel.to)) neighbors.set(rel.to, new Set());
    neighbors.get(rel.from)!.add(rel.to);
    neighbors.get(rel.to)!.add(rel.from);
  }
  const focusedSet = new Set<string>();
  if (focusId) {
    focusedSet.add(focusId);
    for (const n of neighbors.get(focusId) ?? []) focusedSet.add(n);
  }

  const relationCounts = new Map<string, number>();
  for (const rel of relationships) {
    if (rel.kind === "in-namespace") continue;
    relationCounts.set(rel.from, (relationCounts.get(rel.from) ?? 0) + 1);
    relationCounts.set(rel.to, (relationCounts.get(rel.to) ?? 0) + 1);
  }

  // Measure card positions in canvas-local coordinates
  const measure = useCallback(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const canvasRect = canvasEl.getBoundingClientRect();
    const s = viewRef.current.scale;
    const cardEls = canvasEl.querySelectorAll<HTMLElement>("[data-resource-id]");
    const next: Record<string, CardRect> = {};
    cardEls.forEach((el) => {
      const id = el.getAttribute("data-resource-id");
      if (!id) return;
      const r = el.getBoundingClientRect();
      next[id] = {
        id,
        x: (r.left - canvasRect.left) / s,
        y: (r.top - canvasRect.top) / s,
        w: r.width / s,
        h: r.height / s,
      };
    });
    setRects(next);
  }, []);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvasEl);
    canvasEl.querySelectorAll<HTMLElement>("[data-resource-id]").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [resources, relationships, measure]);

  useEffect(() => { measure(); }, [view, measure]);

  // Non-passive wheel handler for zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((v) => {
        const newScale = Math.max(0.1, Math.min(3, v.scale * factor));
        return {
          scale: newScale,
          x: cx - (cx - v.x) * (newScale / v.scale),
          y: cy - (cy - v.y) * (newScale / v.scale),
        };
      });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const panX = viewRef.current.x;
    const panY = viewRef.current.y;
    didDragRef.current = false;
    setIsDragging(true);

    function onMouseMove(e: MouseEvent) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) didDragRef.current = true;
      setView((v) => ({ ...v, x: panX + dx, y: panY + dy }));
    }

    function onMouseUp() {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  }

  const pathFor = (a: CardRect, b: CardRect) => {
    const ax = a.x + a.w;
    const ay = a.y + a.h / 2;
    const bx = b.x;
    const by = b.y + b.h / 2;
    let sx = ax, sy = ay, ex = bx, ey = by;
    if (a.x > b.x + b.w) {
      sx = a.x;
      ex = b.x + b.w;
    } else if (Math.abs(a.x - b.x) < 40 && Math.abs(a.y - b.y) > 80) {
      sx = a.x + a.w / 2; sy = a.y + a.h;
      ex = b.x + b.w / 2; ey = b.y;
    }
    const dx = Math.max(40, Math.abs(ex - sx) * 0.4);
    return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`;
  };

  const visibleRels = relationships.filter((r) => showNamespaceLinks || r.kind !== "in-namespace");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-kumo-hairline bg-kumo-base/50 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2 text-xs text-kumo-subtle">
          <span className="font-mono uppercase tracking-wider">Topology</span>
          <span>·</span>
          <span>
            {resources.length} resource{resources.length === 1 ? "" : "s"} ·{" "}
            {visibleRels.length} link{visibleRels.length === 1 ? "" : "s"}
          </span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-kumo-strong">
          <input
            type="checkbox"
            checked={showNamespaceLinks}
            onChange={(e) => setShowNamespaceLinks(e.target.checked)}
            className="h-3.5 w-3.5 accent-kumo-brand"
          />
          Show {groupLabel} links
        </label>
      </div>

      <div
        ref={containerRef}
        className={cn(
          "relative flex-1 overflow-hidden bg-kumo-canvas grid-bg select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onMouseDown={handleMouseDown}
        onClick={() => { if (!didDragRef.current) onSelect(null); }}
      >
        {/* Transformed infinite canvas */}
        <div
          ref={canvasRef}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "0 0",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <div className="relative">
            {/* SVG overlay in canvas-local coords */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <defs>
                {Object.entries(RELATION_STYLE).map(([key, s]) => (
                  <marker
                    key={key}
                    id={`arrow-${key}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={s.color} />
                  </marker>
                ))}
              </defs>
              {visibleRels.map((rel, i) => {
                const a = rects[rel.from];
                const b = rects[rel.to];
                if (!a || !b) return null;
                const style = RELATION_STYLE[rel.kind];
                const isFocused = !focusId || rel.from === focusId || rel.to === focusId;
                return (
                  <path
                    key={i}
                    d={pathFor(a, b)}
                    fill="none"
                    stroke={style.color}
                    strokeWidth={isFocused ? 1.75 : 1}
                    strokeDasharray={style.dash}
                    opacity={isFocused ? 0.85 : 0.18}
                    markerEnd={`url(#arrow-${rel.kind})`}
                  />
                );
              })}
            </svg>

            <div className="relative space-y-8 p-6">
              {namespaces.map((ns) => {
                const items = byNamespace.get(ns) ?? [];
                const byCat = new Map<string, K8sResource[]>();
                for (const r of items) {
                  const list = byCat.get(r.category) ?? [];
                  list.push(r);
                  byCat.set(r.category, list);
                }
                return (
                  <section key={ns} className="space-y-4">
                    <header className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-kumo-base px-2 py-1 font-mono text-xs text-kumo-strong hairline">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: "var(--color-kind-meta)" }}
                        />
                        {groupLabel}/{ns}
                      </span>
                      <span className="h-px flex-1 bg-kumo-hairline" />
                    </header>

                    <div className="flex flex-row items-start gap-4">
                      {CATEGORY_ORDER.filter((c) => byCat.has(c)).map((cat) => {
                        const list = byCat.get(cat) ?? [];
                        return (
                          <div
                            key={cat}
                            className={cn("w-60 shrink-0 rounded-xl bg-kumo-elevated/60 p-3 hairline")}
                          >
                            <div className="mb-2.5 flex items-center justify-between px-1 text-xs">
                              <span className="font-medium uppercase tracking-wider text-kumo-strong">
                                {CATEGORY_LABEL[cat]}
                              </span>
                              <span className="font-mono text-kumo-subtle">{list.length}</span>
                            </div>
                            <div className="space-y-2">
                              {list.map((r) => (
                                <div key={r.id} onClick={(e) => e.stopPropagation()}>
                                  <ResourceCard
                                    resource={r}
                                    active={selectedId === r.id}
                                    highlighted={focusedSet.has(r.id) && r.id !== selectedId}
                                    dimmed={focusId !== null && !focusedSet.has(r.id)}
                                    relationCount={relationCounts.get(r.id) ?? 0}
                                    onClick={() => onSelect(r.id === selectedId ? null : r.id)}
                                    onHover={(h) => setHoverId(h ? r.id : null)}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {namespaces.length === 0 && (
                <div className="flex h-64 items-center justify-center rounded-xl bg-kumo-base p-10 text-center hairline">
                  <div className="space-y-1">
                    <p className="text-sm text-kumo-default">No resources to visualize</p>
                    <p className="text-xs text-kumo-subtle">
                      Paste a manifest or upload a YAML file to begin.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls overlay */}
        <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5">
          <button
            className="pointer-events-auto rounded-md bg-kumo-base px-2 py-1 text-[11px] text-kumo-strong hairline transition-colors hover:bg-kumo-tint"
            onClick={(e) => { e.stopPropagation(); setView({ x: 24, y: 24, scale: 1 }); }}
          >
            Reset
          </button>
          <span className="rounded-md bg-kumo-base px-2 py-1 font-mono text-[11px] text-kumo-subtle hairline">
            {Math.round(view.scale * 100)}%
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-kumo-hairline bg-kumo-base/50 px-4 py-2 text-[11px] text-kumo-subtle">
        {(Object.entries(RELATION_STYLE) as [RelationKind, (typeof RELATION_STYLE)[RelationKind]][])
          .filter(([k]) => showNamespaceLinks || k !== "in-namespace")
          .map(([k, s]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <svg width="22" height="6" className="overflow-visible">
                <line x1="0" y1="3" x2="22" y2="3" stroke={s.color} strokeWidth="1.5" strokeDasharray={s.dash} />
              </svg>
              <span className="font-mono">{s.label}</span>
            </span>
          ))}
      </div>
    </div>
  );
}
