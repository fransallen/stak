import yaml from "js-yaml";
import type { K8sResource, ParseResult, ResourceCategory } from "@/lib/k8s/parse";
import type { Relationship } from "@/lib/k8s/relationships";

// Compose "kinds" reuse the K8sResource container so the Board, ResourceCard,
// KindGlyph, and Details panels work without changes. Categories are mapped to
// the existing palette.
type ComposeKind =
  | "ComposeService"
  | "ComposeVolume"
  | "ComposeNetwork"
  | "ComposeSecret"
  | "ComposeConfig"
  | "ComposeProject";

const KIND_CATEGORY: Record<ComposeKind, ResourceCategory> = {
  ComposeService: "workload",
  ComposeVolume: "storage",
  ComposeNetwork: "network",
  ComposeSecret: "config",
  ComposeConfig: "config",
  ComposeProject: "meta",
};

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function dump(d: unknown): string {
  try {
    return yaml.dump(d, { lineWidth: 120, noRefs: true });
  } catch {
    return JSON.stringify(d, null, 2);
  }
}

function makeResource(
  kind: ComposeKind,
  name: string,
  raw: Record<string, unknown>,
  index: number,
  project: string,
): K8sResource {
  return {
    id: `${project}/${kind}/${name}#${index}`,
    apiVersion: "compose.docker.com/v3",
    kind: kind.replace(/^Compose/, ""), // shown as "Service", "Volume", etc.
    name,
    namespace: project,
    labels: (obj(raw.labels) as Record<string, string>) ?? {},
    annotations: {},
    raw,
    yaml: dump({ [name]: raw }),
    index,
    category: KIND_CATEGORY[kind],
  };
}

export function parseCompose(input: string, projectName = "compose"): ParseResult {
  const result: ParseResult = { resources: [], errors: [] };
  if (!input.trim()) return result;

  let doc: unknown;
  try {
    doc = yaml.load(input);
  } catch (e) {
    result.errors.push({ index: 0, message: (e as Error).message });
    return result;
  }
  const root = obj(doc);
  if (!root) {
    result.errors.push({ index: 0, message: "Compose file must be a mapping at the top level" });
    return result;
  }

  const project = str(root.name) ?? projectName;
  let idx = 0;

  // Synthetic project node so namespace grouping shows the compose file
  result.resources.push(
    makeResource(
      "ComposeProject",
      project,
      { name: project, version: root.version },
      idx++,
      project,
    ),
  );

  const services = obj(root.services) ?? {};
  for (const [name, raw] of Object.entries(services)) {
    const r = obj(raw) ?? {};
    result.resources.push(makeResource("ComposeService", name, r, idx++, project));
  }

  const volumes = obj(root.volumes) ?? {};
  for (const [name, raw] of Object.entries(volumes)) {
    const r = obj(raw) ?? {};
    result.resources.push(makeResource("ComposeVolume", name, r, idx++, project));
  }

  const networks = obj(root.networks) ?? {};
  for (const [name, raw] of Object.entries(networks)) {
    const r = obj(raw) ?? {};
    result.resources.push(makeResource("ComposeNetwork", name, r, idx++, project));
  }

  const secrets = obj(root.secrets) ?? {};
  for (const [name, raw] of Object.entries(secrets)) {
    const r = obj(raw) ?? {};
    result.resources.push(makeResource("ComposeSecret", name, r, idx++, project));
  }

  const configs = obj(root.configs) ?? {};
  for (const [name, raw] of Object.entries(configs)) {
    const r = obj(raw) ?? {};
    result.resources.push(makeResource("ComposeConfig", name, r, idx++, project));
  }

  return result;
}

function findRes(
  resources: K8sResource[],
  kind: string,
  name: string,
  project: string,
): K8sResource | undefined {
  return resources.find((r) => r.kind === kind && r.name === name && r.namespace === project);
}

function nameFromShortOrLong(item: unknown): string | undefined {
  if (typeof item === "string") return item;
  const o = obj(item);
  if (!o) return undefined;
  return str(o.source) ?? str(o.target) ?? str(o.name);
}

function volumeNameFromMount(item: unknown): string | undefined {
  if (typeof item === "string") {
    // long form "name:/path" or "./local:/path"
    const left = item.split(":")[0];
    if (!left || left.startsWith(".") || left.startsWith("/")) return undefined;
    return left;
  }
  const o = obj(item);
  if (!o) return undefined;
  if (str(o.type) && str(o.type) !== "volume") return undefined;
  return str(o.source);
}

export function buildComposeRelationships(resources: K8sResource[]): Relationship[] {
  const rels: Relationship[] = [];
  const seen = new Set<string>();
  const push = (r: Relationship) => {
    const key = `${r.from}->${r.to}:${r.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    rels.push(r);
  };

  for (const r of resources) {
    if (r.kind !== "Service") continue;
    const project = r.namespace;
    const raw = r.raw;

    // depends_on (array OR map form)
    const dep = raw.depends_on;
    const depNames: string[] = [];
    if (Array.isArray(dep)) {
      for (const d of dep) {
        const n = typeof d === "string" ? d : str(obj(d)?.service);
        if (n) depNames.push(n);
      }
    } else if (obj(dep)) {
      depNames.push(...Object.keys(obj(dep)!));
    }
    for (const n of depNames) {
      const t = findRes(resources, "Service", n, project);
      if (t) push({ from: r.id, to: t.id, kind: "owns", label: "depends on" });
    }

    // networks (array or map)
    const nets = raw.networks;
    const netNames: string[] =
      Array.isArray(nets)
        ? (nets.filter((x) => typeof x === "string") as string[])
        : obj(nets)
          ? Object.keys(obj(nets)!)
          : [];
    for (const n of netNames) {
      const t = findRes(resources, "Network", n, project);
      if (t) push({ from: r.id, to: t.id, kind: "selects", label: "network" });
    }

    // volumes / mounts
    for (const v of arr(raw.volumes)) {
      const n = volumeNameFromMount(v);
      if (!n) continue;
      const t = findRes(resources, "Volume", n, project);
      if (t) push({ from: r.id, to: t.id, kind: "mounts", label: "volume" });
    }

    // secrets
    for (const s of arr(raw.secrets)) {
      const n = nameFromShortOrLong(s);
      if (!n) continue;
      const t = findRes(resources, "Secret", n, project);
      if (t) push({ from: r.id, to: t.id, kind: "mounts", label: "secret" });
    }

    // configs
    for (const c of arr(raw.configs)) {
      const n = nameFromShortOrLong(c);
      if (!n) continue;
      const t = findRes(resources, "Config", n, project);
      if (t) push({ from: r.id, to: t.id, kind: "mounts", label: "config" });
    }

    // project membership (analogous to namespace)
    const proj = resources.find((x) => x.kind === "Project" && x.name === project);
    if (proj) push({ from: r.id, to: proj.id, kind: "in-namespace" });
  }

  // Non-service resources also belong to project
  for (const r of resources) {
    if (r.kind === "Project" || r.kind === "Service") continue;
    const proj = resources.find((x) => x.kind === "Project" && x.name === r.namespace);
    if (proj) push({ from: r.id, to: proj.id, kind: "in-namespace" });
  }

  return rels;
}
