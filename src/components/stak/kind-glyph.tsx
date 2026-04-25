import type { ResourceCategory } from "@/lib/k8s/parse";
import { CATEGORY_COLOR_VAR, glyphFor } from "@/lib/k8s/categories";

export function KindGlyph({
  kind,
  category,
  size = 32,
}: {
  kind: string;
  category: ResourceCategory;
  size?: number;
}) {
  const color = CATEGORY_COLOR_VAR[category];
  return (
    <div
      className="flex items-center justify-center rounded-md font-mono font-semibold tracking-tight"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        color,
        backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 25%, transparent)`,
      }}
      aria-label={kind}
      title={kind}
    >
      {glyphFor(kind)}
    </div>
  );
}
