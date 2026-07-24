import { parse } from "yaml";
import infrastructureYaml from "../../config/infrastructure.yaml?raw";

export type InfrastructureStatus =
  | "healthy"
  | "degraded"
  | "offline"
  | "unconfigured";
export type InfrastructureLayer =
  | "edge"
  | "tailscale"
  | "physical"
  | "workspace";

export type InfrastructureNode = {
  id: string;
  name: string;
  subtitle: string;
  address: string;
  location: string;
  status: InfrastructureStatus;
  layer: InfrastructureLayer;
  hardware: {
    kind: string;
    model: string;
    cpu?: string;
    memory?: string;
    storage?: string;
    architecture?: string;
    os?: string;
  };
  metrics: {
    cpu: number | null;
    memory: number | null;
    disk: number | null;
    uptime: string;
  };
  projectIds: string[];
};

export type InfrastructureProject = {
  id: string;
  name: string;
  nodeId: string;
  endpoint: string;
  status: InfrastructureStatus;
  latencyMs: number | null;
  description: string;
};

export type InfrastructureConfig = {
  version: 1;
  dashboard: { defaultNodeId: string; pollIntervalSeconds: number };
  nodes: InfrastructureNode[];
  projects: InfrastructureProject[];
};

const statuses = new Set<InfrastructureStatus>([
  "healthy",
  "degraded",
  "offline",
  "unconfigured",
]);
const layers = new Set<InfrastructureLayer>([
  "edge",
  "tailscale",
  "physical",
  "workspace",
]);

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function asOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, path);
}

function asNullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number or null`);
  }
  return value;
}

function parseConfig(source: string): InfrastructureConfig {
  const root = asRecord(parse(source), "config");
  if (root.version !== 1) throw new Error("config.version must be 1");

  const dashboard = asRecord(root.dashboard, "dashboard");
  const pollIntervalSeconds = asNullableNumber(
    dashboard.pollIntervalSeconds,
    "dashboard.pollIntervalSeconds",
  );
  if (pollIntervalSeconds === null || pollIntervalSeconds < 10) {
    throw new Error("dashboard.pollIntervalSeconds must be at least 10");
  }
  if (!Array.isArray(root.nodes) || root.nodes.length === 0) {
    throw new Error("nodes must contain at least one node");
  }
  if (!Array.isArray(root.projects)) {
    throw new Error("projects must be an array");
  }

  const nodeIds = new Set<string>();
  const nodes = root.nodes.map((value, index): InfrastructureNode => {
    const path = `nodes[${index}]`;
    const node = asRecord(value, path);
    const id = asString(node.id, `${path}.id`);
    if (nodeIds.has(id)) throw new Error(`duplicate node id: ${id}`);
    nodeIds.add(id);
    const status = asString(node.status, `${path}.status`) as InfrastructureStatus;
    const layer = asString(node.layer, `${path}.layer`) as InfrastructureLayer;
    if (!statuses.has(status)) throw new Error(`${path}.status is invalid`);
    if (!layers.has(layer)) throw new Error(`${path}.layer is invalid`);
    const hardware = asRecord(node.hardware, `${path}.hardware`);
    const metrics = asRecord(node.metrics, `${path}.metrics`);
    return {
      id,
      name: asString(node.name, `${path}.name`),
      subtitle: asString(node.subtitle, `${path}.subtitle`),
      address: asString(node.address, `${path}.address`),
      location: asString(node.location, `${path}.location`),
      status,
      layer,
      hardware: {
        kind: asString(hardware.kind, `${path}.hardware.kind`),
        model: asString(hardware.model, `${path}.hardware.model`),
        cpu: asOptionalString(hardware.cpu, `${path}.hardware.cpu`),
        memory: asOptionalString(hardware.memory, `${path}.hardware.memory`),
        storage: asOptionalString(hardware.storage, `${path}.hardware.storage`),
        architecture: asOptionalString(
          hardware.architecture,
          `${path}.hardware.architecture`,
        ),
        os: asOptionalString(hardware.os, `${path}.hardware.os`),
      },
      metrics: {
        cpu: asNullableNumber(metrics.cpu, `${path}.metrics.cpu`),
        memory: asNullableNumber(metrics.memory, `${path}.metrics.memory`),
        disk: asNullableNumber(metrics.disk, `${path}.metrics.disk`),
        uptime: asString(metrics.uptime, `${path}.metrics.uptime`),
      },
      projectIds: [],
    };
  });

  const projectIds = new Set<string>();
  const projects = root.projects.map((value, index): InfrastructureProject => {
    const path = `projects[${index}]`;
    const project = asRecord(value, path);
    const id = asString(project.id, `${path}.id`);
    if (projectIds.has(id)) throw new Error(`duplicate project id: ${id}`);
    projectIds.add(id);
    const nodeId = asString(project.nodeId, `${path}.nodeId`);
    if (!nodeIds.has(nodeId)) {
      throw new Error(`${path}.nodeId references unknown node: ${nodeId}`);
    }
    const status = asString(
      project.status,
      `${path}.status`,
    ) as InfrastructureStatus;
    if (!statuses.has(status)) throw new Error(`${path}.status is invalid`);
    return {
      id,
      name: asString(project.name, `${path}.name`),
      nodeId,
      endpoint: asString(project.endpoint, `${path}.endpoint`),
      status,
      latencyMs: asNullableNumber(project.latencyMs, `${path}.latencyMs`),
      description: asString(project.description, `${path}.description`),
    };
  });

  for (const node of nodes) {
    node.projectIds = projects
      .filter((project) => project.nodeId === node.id)
      .map((project) => project.id);
  }
  const defaultNodeId = asString(
    dashboard.defaultNodeId,
    "dashboard.defaultNodeId",
  );
  if (!nodeIds.has(defaultNodeId)) {
    throw new Error(
      `dashboard.defaultNodeId references unknown node: ${defaultNodeId}`,
    );
  }
  return {
    version: 1,
    dashboard: { defaultNodeId, pollIntervalSeconds },
    nodes,
    projects,
  };
}

export const infrastructureConfig = parseConfig(infrastructureYaml);
