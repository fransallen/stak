import yaml from "js-yaml";

export interface K8sResource {
  id: string; // stable id within doc set
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  raw: Record<string, unknown>;
  yaml: string;
  index: number;
  category: ResourceCategory;
}

export type ResourceCategory =
  | "workload"
  | "network"
  | "config"
  | "storage"
  | "rbac"
  | "meta"
  | "other";

export interface ParseResult {
  resources: K8sResource[];
  errors: { index: number; message: string }[];
}

const CATEGORY_MAP: Record<string, ResourceCategory> = {
  // workloads
  Pod: "workload",
  Deployment: "workload",
  ReplicaSet: "workload",
  StatefulSet: "workload",
  DaemonSet: "workload",
  Job: "workload",
  CronJob: "workload",
  ReplicationController: "workload",
  // network
  Service: "network",
  Ingress: "network",
  NetworkPolicy: "network",
  Endpoints: "network",
  EndpointSlice: "network",
  Gateway: "network",
  HTTPRoute: "network",
  // config
  ConfigMap: "config",
  Secret: "config",
  // storage
  PersistentVolume: "storage",
  PersistentVolumeClaim: "storage",
  StorageClass: "storage",
  VolumeSnapshot: "storage",
  // rbac
  ServiceAccount: "rbac",
  Role: "rbac",
  ClusterRole: "rbac",
  RoleBinding: "rbac",
  ClusterRoleBinding: "rbac",
  // meta
  Namespace: "meta",
  ResourceQuota: "meta",
  LimitRange: "meta",
  HorizontalPodAutoscaler: "meta",
  PodDisruptionBudget: "meta",
};

export function categorize(kind: string): ResourceCategory {
  return CATEGORY_MAP[kind] ?? "other";
}

export function parseYaml(input: string): ParseResult {
  const result: ParseResult = { resources: [], errors: [] };
  if (!input.trim()) return result;

  let docs: unknown[] = [];
  try {
    docs = yaml.loadAll(input);
  } catch (e) {
    result.errors.push({ index: 0, message: (e as Error).message });
    return result;
  }

  docs.forEach((doc, i) => {
    if (!doc || typeof doc !== "object") return;
    const d = doc as Record<string, unknown>;
    const kind = typeof d.kind === "string" ? d.kind : undefined;
    const apiVersion = typeof d.apiVersion === "string" ? d.apiVersion : undefined;
    if (!kind || !apiVersion) {
      result.errors.push({ index: i, message: "Document missing kind or apiVersion" });
      return;
    }
    const meta = (d.metadata as Record<string, unknown> | undefined) ?? {};
    const name = typeof meta.name === "string" ? meta.name : "(unnamed)";
    const namespace = typeof meta.namespace === "string" ? meta.namespace : "default";
    const labels = (meta.labels as Record<string, string>) ?? {};
    const annotations = (meta.annotations as Record<string, string>) ?? {};

    let serialized = "";
    try {
      serialized = yaml.dump(d, { lineWidth: 120, noRefs: true });
    } catch {
      serialized = JSON.stringify(d, null, 2);
    }

    result.resources.push({
      id: `${namespace}/${kind}/${name}#${i}`,
      apiVersion,
      kind,
      name,
      namespace,
      labels,
      annotations,
      raw: d,
      yaml: serialized,
      index: i,
      category: categorize(kind),
    });
  });

  return result;
}
