export const dynamic = "force-dynamic";

type Status = "healthy" | "degraded" | "offline";

type InfraStatusPayload = {
  ok: boolean;
  checkedAt?: string;
  node?: {
    id: string;
    hostname: string;
    uptimeSeconds: number;
    cpuPercent: number | null;
    load1: number | null;
    cpuCount: number | null;
    memTotalMb: number | null;
    memUsedMb: number | null;
    memPercent: number | null;
    diskTotalKb: number | null;
    diskUsedKb: number | null;
    diskPercent: number | null;
    nginx: string;
    tailscale: string;
    status: Status;
  };
  services?: Array<{
    name: string;
    code: number;
    latencyMs: number;
    status: Status;
  }>;
};

type LegacyCheckStatus = "ok" | "warn" | "error" | "unknown";

type LegacyStatusPayload = {
  generatedAt?: string;
  nodes?: Array<{
    id?: string;
    title?: string;
    status?: LegacyCheckStatus;
    hardware?: {
      uptimeSeconds?: number;
      loadAverage?: Array<string | number>;
      memory?: { totalBytes?: number; usedBytes?: number };
      disk?: { root?: { totalBytes?: number; usedBytes?: number; usedPercent?: number } };
    };
  }>;
  services?: LegacyCheck[];
  endpoints?: LegacyCheck[];
};

type LegacyCheck = {
  id?: string;
  title?: string;
  status?: LegacyCheckStatus;
  httpStatus?: number;
  latencyMs?: number;
};

function isValidPayload(value: unknown): value is InfraStatusPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as InfraStatusPayload;
  return (
    payload.ok === true &&
    typeof payload.checkedAt === "string" &&
    Boolean(payload.node) &&
    typeof payload.node?.hostname === "string" &&
    typeof payload.node?.uptimeSeconds === "number" &&
    Array.isArray(payload.services)
  );
}

function isLegacyStatusPayload(value: unknown): value is LegacyStatusPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as LegacyStatusPayload;
  return Array.isArray(payload.nodes) && Array.isArray(payload.services) && Array.isArray(payload.endpoints);
}

function mapLegacyStatus(status: LegacyCheckStatus | undefined): Status {
  if (status === "ok") return "healthy";
  if (status === "warn") return "degraded";
  return "offline";
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percent(used: number | undefined, total: number | undefined): number | null {
  if (!used || !total || total <= 0) return null;
  return Math.round((used / total) * 100);
}

function toMegabytes(value: number | undefined): number | null {
  return value === undefined ? null : Math.round(value / (1024 * 1024));
}

function toKilobytes(value: number | undefined): number | null {
  return value === undefined ? null : Math.round(value / 1024);
}

function legacySnapshot(payload: LegacyStatusPayload): InfraStatusPayload {
  const node = payload.nodes?.find((candidate) => candidate.id === "vm26830");
  const hardware = node?.hardware;
  const memory = hardware?.memory;
  const disk = hardware?.disk?.root;
  const load1 = Number(hardware?.loadAverage?.[0]);
  const checks = [...(payload.services ?? []), ...(payload.endpoints ?? [])];

  return {
    ok: true,
    checkedAt: payload.generatedAt,
    node: node
      ? {
          id: "vm26830",
          hostname: node.title ?? "vm26830",
          uptimeSeconds: asFiniteNumber(hardware?.uptimeSeconds) ?? 0,
          cpuPercent: null,
          load1: Number.isFinite(load1) ? load1 : null,
          cpuCount: null,
          memTotalMb: toMegabytes(memory?.totalBytes),
          memUsedMb: toMegabytes(memory?.usedBytes),
          memPercent: percent(memory?.usedBytes, memory?.totalBytes),
          diskTotalKb: toKilobytes(disk?.totalBytes),
          diskUsedKb: toKilobytes(disk?.usedBytes),
          diskPercent:
            asFiniteNumber(disk?.usedPercent) ?? percent(disk?.usedBytes, disk?.totalBytes),
          nginx: "unknown",
          tailscale: "unknown",
          status: mapLegacyStatus(node.status),
        }
      : undefined,
    services: checks
      .filter((check): check is LegacyCheck & { id: string; title: string } =>
        typeof check.id === "string" && typeof check.title === "string",
      )
      .map((check) => ({
        name: check.id,
        code: asFiniteNumber(check.httpStatus) ?? 0,
        latencyMs: asFiniteNumber(check.latencyMs) ?? 0,
        status: mapLegacyStatus(check.status),
      })),
  };
}

function isAllowedLegacyStatusUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      url.hostname === "100.126.168.34" &&
      url.port === "14330" &&
      url.pathname === "/api/status"
    );
  } catch {
    return false;
  }
}

export async function GET() {
  const legacyStatusUrl = process.env.LEGACY_STATUS_URL;
  const statusUrl = process.env.INFRA_STATUS_URL;
  const token = process.env.INFRA_STATUS_TOKEN;

  if (legacyStatusUrl && !isAllowedLegacyStatusUrl(legacyStatusUrl)) {
    return Response.json(
      { ok: false, error: "The infrastructure status agent is not configured." },
      { status: 503 },
    );
  }

  if (!legacyStatusUrl && (!statusUrl || !token)) {
    return Response.json(
      { ok: false, error: "The infrastructure status agent is not configured." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(legacyStatusUrl ?? statusUrl!, {
      headers: legacyStatusUrl
        ? { Accept: "application/json" }
        : {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return Response.json(
        { ok: false, error: `Status agent returned HTTP ${response.status}.` },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as unknown;
    if (legacyStatusUrl && isLegacyStatusPayload(payload)) {
      return Response.json(legacySnapshot(payload), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (!isValidPayload(payload)) {
      return Response.json(
        { ok: false, error: "Status agent returned an invalid response." },
        { status: 502 },
      );
    }

    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { ok: false, error: "The infrastructure status agent is unreachable." },
      { status: 502 },
    );
  }
}
