import { cn } from "@/lib/utils";
import type { K8sResource } from "@/lib/k8s/parse";
import { KindGlyph } from "./kind-glyph";

interface ResourceCardProps {
  resource: K8sResource;
  active?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  relationCount?: number;
  onClick?: () => void;
  onHover?: (hovering: boolean) => void;
}

export function ResourceCard({
  resource,
  active,
  highlighted,
  dimmed,
  relationCount = 0,
  onClick,
  onHover,
}: ResourceCardProps) {
  return (
    <button
      type="button"
      data-resource-id={resource.id}
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-lg bg-kumo-base p-3 text-left transition-all",
        "hairline hover:bg-kumo-tint",
        active && "ring-2 ring-kumo-brand ring-offset-2 ring-offset-kumo-canvas",
        highlighted && !active && "ring-1 ring-kumo-brand/40",
        dimmed && "opacity-35",
      )}
    >
      <KindGlyph kind={resource.kind} category={resource.category} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium text-kumo-default">{resource.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-kumo-subtle">
          <span className="font-mono">{resource.kind}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{resource.apiVersion}</span>
        </div>
      </div>
      {relationCount > 0 && (
        <span
          className="shrink-0 rounded-full bg-kumo-recessed px-1.5 py-0.5 font-mono text-[10px] text-kumo-strong"
          title={`${relationCount} relationship${relationCount === 1 ? "" : "s"}`}
        >
          {relationCount}
        </span>
      )}
    </button>
  );
}
