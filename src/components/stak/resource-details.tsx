import type { K8sResource } from "@/lib/k8s/parse";
import type { Relationship } from "@/lib/k8s/relationships";
import { KindGlyph } from "./kind-glyph";

interface DetailsProps {
  resource: K8sResource | null;
  resources: K8sResource[];
  relationships: Relationship[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

const RELATION_LABEL: Record<string, string> = {
  selects: "selects",
  mounts: "mounts",
  owns: "owns",
  routes: "routes to",
  binds: "binds",
  "uses-sa": "uses SA",
  scales: "scales",
  "in-namespace": "in namespace",
};

export function ResourceDetails({
  resource,
  resources,
  relationships,
  onSelect,
  onClose,
}: DetailsProps) {
  if (!resource) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-kumo-base p-6 text-center">
        <p className="text-sm text-kumo-strong">Select a resource</p>
        <p className="text-xs text-kumo-subtle">
          Click a card to inspect its YAML and relationships.
        </p>
      </div>
    );
  }

  const outgoing = relationships
    .filter((r) => r.from === resource.id && r.kind !== "in-namespace")
    .map((r) => ({ rel: r, target: resources.find((x) => x.id === r.to) }))
    .filter((x) => x.target);
  const incoming = relationships
    .filter((r) => r.to === resource.id && r.kind !== "in-namespace")
    .map((r) => ({ rel: r, target: resources.find((x) => x.id === r.from) }))
    .filter((x) => x.target);

  const labelEntries = Object.entries(resource.labels);

  return (
    <div className="flex h-full flex-col bg-kumo-base">
      <div className="flex items-start justify-between gap-3 border-b border-kumo-hairline p-4">
        <div className="flex min-w-0 items-start gap-3">
          <KindGlyph kind={resource.kind} category={resource.category} size={40} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-kumo-default">
              {resource.name}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-kumo-subtle">
              {resource.kind} · {resource.apiVersion}
            </p>
            <p className="mt-0.5 font-mono text-xs text-kumo-subtle">
              ns: {resource.namespace}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-auto p-4">
        {labelEntries.length > 0 && (
          <Section title="Labels">
            <div className="flex flex-wrap gap-1.5">
              {labelEntries.map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center rounded-md bg-kumo-recessed px-2 py-0.5 font-mono text-[11px] text-kumo-strong"
                >
                  {k}={v}
                </span>
              ))}
            </div>
          </Section>
        )}

        {(outgoing.length > 0 || incoming.length > 0) && (
          <Section title="Relationships">
            <div className="space-y-1.5">
              {outgoing.map(({ rel, target }) => (
                <RelationRow
                  key={`o-${rel.from}-${rel.to}-${rel.kind}`}
                  arrow="→"
                  label={RELATION_LABEL[rel.kind] ?? rel.kind}
                  target={target!}
                  onClick={() => onSelect(target!.id)}
                />
              ))}
              {incoming.map(({ rel, target }) => (
                <RelationRow
                  key={`i-${rel.from}-${rel.to}-${rel.kind}`}
                  arrow="←"
                  label={RELATION_LABEL[rel.kind] ?? rel.kind}
                  target={target!}
                  onClick={() => onSelect(target!.id)}
                />
              ))}
            </div>
          </Section>
        )}

        <Section title="Manifest">
          <pre className="overflow-auto rounded-lg bg-kumo-recessed p-3 font-mono text-[11.5px] leading-relaxed text-kumo-default hairline">
            {resource.yaml}
          </pre>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-kumo-subtle">
        {title}
      </h3>
      {children}
    </div>
  );
}

function RelationRow({
  arrow,
  label,
  target,
  onClick,
}: {
  arrow: string;
  label: string;
  target: K8sResource;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-xs transition-colors hover:bg-kumo-tint"
    >
      <span className="font-mono text-kumo-subtle">{arrow}</span>
      <span className="font-mono text-kumo-subtle">{label}</span>
      <KindGlyph kind={target.kind} category={target.category} size={20} />
      <span className="truncate text-kumo-default">{target.name}</span>
      <span className="font-mono text-[10px] text-kumo-subtle">{target.kind}</span>
    </button>
  );
}
