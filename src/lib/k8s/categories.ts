import type { ResourceCategory } from "@/lib/k8s/parse";

export const CATEGORY_LABEL: Record<ResourceCategory, string> = {
  workload: "Workloads",
  network: "Networking",
  config: "Configuration",
  storage: "Storage",
  rbac: "Access Control",
  meta: "Cluster",
  other: "Other",
};

export const CATEGORY_ORDER: ResourceCategory[] = [
  "meta",
  "workload",
  "network",
  "config",
  "storage",
  "rbac",
  "other",
];

export const CATEGORY_COLOR_VAR: Record<ResourceCategory, string> = {
  workload: "var(--color-kind-workload)",
  network: "var(--color-kind-network)",
  config: "var(--color-kind-config)",
  storage: "var(--color-kind-storage)",
  rbac: "var(--color-kind-rbac)",
  meta: "var(--color-kind-meta)",
  other: "var(--color-kind-other)",
};

// Short two-letter glyphs for kinds — keeps cards icon-light and grid-aligned.
export const KIND_GLYPH: Record<string, string> = {
  Deployment: "Dp",
  Pod: "Po",
  ReplicaSet: "Rs",
  StatefulSet: "St",
  DaemonSet: "Ds",
  Job: "Jb",
  CronJob: "Cj",
  Service: "Sv",
  Ingress: "Ig",
  NetworkPolicy: "Np",
  Endpoints: "Ep",
  EndpointSlice: "Es",
  ConfigMap: "Cm",
  Secret: "Sc",
  PersistentVolume: "Pv",
  PersistentVolumeClaim: "Pc",
  StorageClass: "Sk",
  ServiceAccount: "Sa",
  Role: "Ro",
  ClusterRole: "Cr",
  RoleBinding: "Rb",
  ClusterRoleBinding: "Cb",
  Namespace: "Ns",
  HorizontalPodAutoscaler: "Hp",
  PodDisruptionBudget: "Pb",
  // Docker Compose synthetic kinds
  Project: "Pj",
  Volume: "Vo",
  Network: "Nw",
  Config: "Cf",
};

export function glyphFor(kind: string): string {
  if (KIND_GLYPH[kind]) return KIND_GLYPH[kind];
  // Build acronym: take uppercase letters
  const upper = kind.match(/[A-Z]/g) ?? [];
  if (upper.length >= 2) return (upper[0] + upper[1]).toLowerCase().replace(/^./, (c) => c.toUpperCase());
  return kind.slice(0, 2);
}
