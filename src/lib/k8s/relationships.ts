import type { K8sResource } from "./parse";

export type RelationKind =
  | "selects" // Service -> Pod via selector
  | "mounts" // Workload -> ConfigMap/Secret/PVC
  | "owns" // Owner reference / template owner
  | "routes" // Ingress -> Service
  | "binds" // RoleBinding -> Role/ServiceAccount
  | "uses-sa" // Workload -> ServiceAccount
  | "scales" // HPA -> Workload
  | "in-namespace"; // any -> Namespace

export interface Relationship {
  from: string; // resource id
  to: string;
  kind: RelationKind;
  label?: string;
}

function getPath<T = unknown>(obj: unknown, path: (string | number)[]): T | undefined {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur as T | undefined;
}

function findByKindName(
  resources: K8sResource[],
  kinds: string[],
  name: string,
  namespace: string,
): K8sResource | undefined {
  return resources.find(
    (r) => kinds.includes(r.kind) && r.name === name && r.namespace === namespace,
  );
}

function selectorMatches(selector: Record<string, string>, labels: Record<string, string>) {
  const keys = Object.keys(selector);
  if (keys.length === 0) return false;
  return keys.every((k) => labels[k] === selector[k]);
}

function getPodTemplateLabels(r: K8sResource): Record<string, string> | undefined {
  // Workloads expose labels at spec.template.metadata.labels
  const labels = getPath<Record<string, string>>(r.raw, [
    "spec",
    "template",
    "metadata",
    "labels",
  ]);
  if (labels && typeof labels === "object") return labels;
  // Pods themselves use metadata.labels
  if (r.kind === "Pod") return r.labels;
  return undefined;
}

function getPodTemplateSpec(r: K8sResource): Record<string, unknown> | undefined {
  if (r.kind === "Pod") return r.raw.spec as Record<string, unknown> | undefined;
  return getPath<Record<string, unknown>>(r.raw, ["spec", "template", "spec"]);
}

export function buildRelationships(resources: K8sResource[]): Relationship[] {
  const rels: Relationship[] = [];
  const seen = new Set<string>();
  const push = (r: Relationship) => {
    const key = `${r.from}->${r.to}:${r.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    rels.push(r);
  };

  for (const r of resources) {
    // Service.spec.selector matches workload pod template labels
    if (r.kind === "Service") {
      const selector = getPath<Record<string, string>>(r.raw, ["spec", "selector"]);
      if (selector && typeof selector === "object") {
        for (const target of resources) {
          const labels = getPodTemplateLabels(target);
          if (!labels) continue;
          if (target.namespace !== r.namespace) continue;
          if (selectorMatches(selector, labels)) {
            push({ from: r.id, to: target.id, kind: "selects" });
          }
        }
      }
    }

    // Ingress -> Service
    if (r.kind === "Ingress") {
      const rules = getPath<unknown[]>(r.raw, ["spec", "rules"]) ?? [];
      for (const rule of rules) {
        const paths = getPath<unknown[]>(rule, ["http", "paths"]) ?? [];
        for (const p of paths) {
          const svcName = getPath<string>(p, ["backend", "service", "name"]);
          if (svcName) {
            const svc = findByKindName(resources, ["Service"], svcName, r.namespace);
            if (svc) push({ from: r.id, to: svc.id, kind: "routes" });
          }
        }
      }
      const defBackend = getPath<string>(r.raw, ["spec", "defaultBackend", "service", "name"]);
      if (defBackend) {
        const svc = findByKindName(resources, ["Service"], defBackend, r.namespace);
        if (svc) push({ from: r.id, to: svc.id, kind: "routes" });
      }
    }

    // HPA -> workload
    if (r.kind === "HorizontalPodAutoscaler") {
      const targetKind = getPath<string>(r.raw, ["spec", "scaleTargetRef", "kind"]);
      const targetName = getPath<string>(r.raw, ["spec", "scaleTargetRef", "name"]);
      if (targetKind && targetName) {
        const target = findByKindName(resources, [targetKind], targetName, r.namespace);
        if (target) push({ from: r.id, to: target.id, kind: "scales" });
      }
    }

    // RoleBinding / ClusterRoleBinding
    if (r.kind === "RoleBinding" || r.kind === "ClusterRoleBinding") {
      const roleRefName = getPath<string>(r.raw, ["roleRef", "name"]);
      const roleRefKind = getPath<string>(r.raw, ["roleRef", "kind"]);
      if (roleRefKind && roleRefName) {
        const role = findByKindName(resources, [roleRefKind], roleRefName, r.namespace);
        if (role) push({ from: r.id, to: role.id, kind: "binds", label: "role" });
      }
      const subjects = (getPath<unknown[]>(r.raw, ["subjects"]) ?? []) as Record<
        string,
        unknown
      >[];
      for (const s of subjects) {
        const sKind = typeof s.kind === "string" ? s.kind : undefined;
        const sName = typeof s.name === "string" ? s.name : undefined;
        const sNs = typeof s.namespace === "string" ? s.namespace : r.namespace;
        if (sKind && sName) {
          const sub = findByKindName(resources, [sKind], sName, sNs);
          if (sub) push({ from: r.id, to: sub.id, kind: "binds", label: "subject" });
        }
      }
    }

    // Workload -> ServiceAccount, ConfigMap, Secret, PVC
    const podSpec = getPodTemplateSpec(r);
    if (podSpec) {
      const sa = podSpec.serviceAccountName as string | undefined;
      if (sa) {
        const target = findByKindName(resources, ["ServiceAccount"], sa, r.namespace);
        if (target) push({ from: r.id, to: target.id, kind: "uses-sa" });
      }

      const volumes = (podSpec.volumes as Record<string, unknown>[] | undefined) ?? [];
      for (const v of volumes) {
        const cmName = getPath<string>(v, ["configMap", "name"]);
        if (cmName) {
          const t = findByKindName(resources, ["ConfigMap"], cmName, r.namespace);
          if (t) push({ from: r.id, to: t.id, kind: "mounts", label: "configMap" });
        }
        const secretName = getPath<string>(v, ["secret", "secretName"]);
        if (secretName) {
          const t = findByKindName(resources, ["Secret"], secretName, r.namespace);
          if (t) push({ from: r.id, to: t.id, kind: "mounts", label: "secret" });
        }
        const pvcName = getPath<string>(v, ["persistentVolumeClaim", "claimName"]);
        if (pvcName) {
          const t = findByKindName(resources, ["PersistentVolumeClaim"], pvcName, r.namespace);
          if (t) push({ from: r.id, to: t.id, kind: "mounts", label: "pvc" });
        }
      }

      const containers = ((podSpec.containers as Record<string, unknown>[] | undefined) ?? [])
        .concat((podSpec.initContainers as Record<string, unknown>[] | undefined) ?? []);
      for (const c of containers) {
        const envFrom = (c.envFrom as Record<string, unknown>[] | undefined) ?? [];
        for (const ef of envFrom) {
          const cmName = getPath<string>(ef, ["configMapRef", "name"]);
          if (cmName) {
            const t = findByKindName(resources, ["ConfigMap"], cmName, r.namespace);
            if (t) push({ from: r.id, to: t.id, kind: "mounts", label: "envFrom" });
          }
          const secretName = getPath<string>(ef, ["secretRef", "name"]);
          if (secretName) {
            const t = findByKindName(resources, ["Secret"], secretName, r.namespace);
            if (t) push({ from: r.id, to: t.id, kind: "mounts", label: "envFrom" });
          }
        }
        const env = (c.env as Record<string, unknown>[] | undefined) ?? [];
        for (const e of env) {
          const cmName = getPath<string>(e, ["valueFrom", "configMapKeyRef", "name"]);
          if (cmName) {
            const t = findByKindName(resources, ["ConfigMap"], cmName, r.namespace);
            if (t) push({ from: r.id, to: t.id, kind: "mounts", label: "env" });
          }
          const secretName = getPath<string>(e, ["valueFrom", "secretKeyRef", "name"]);
          if (secretName) {
            const t = findByKindName(resources, ["Secret"], secretName, r.namespace);
            if (t) push({ from: r.id, to: t.id, kind: "mounts", label: "env" });
          }
        }
      }
    }

    // Namespace links
    if (r.kind !== "Namespace") {
      const ns = resources.find((x) => x.kind === "Namespace" && x.name === r.namespace);
      if (ns) push({ from: r.id, to: ns.id, kind: "in-namespace" });
    }

    // Owner references
    const owners =
      (getPath<Record<string, unknown>[]>(r.raw, ["metadata", "ownerReferences"]) ?? []) as Record<
        string,
        unknown
      >[];
    for (const o of owners) {
      const ok = typeof o.kind === "string" ? o.kind : undefined;
      const on = typeof o.name === "string" ? o.name : undefined;
      if (ok && on) {
        const owner = findByKindName(resources, [ok], on, r.namespace);
        if (owner) push({ from: owner.id, to: r.id, kind: "owns" });
      }
    }
  }

  return rels;
}
