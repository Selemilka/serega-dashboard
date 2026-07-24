export const dynamic = "force-dynamic";

type Status = "healthy" | "degraded" | "offline";

type InfraStatusPayload = {
  ok: boolean;
  checkedAt?: string;
  node?: {
    id: string;
    hostname: string;
    uptimeSeconds: number;
    cpuPercent: number;
    load1: number;
    cpuCount: number;
    memTotalMb: number;
    memUsedMb: number;
    memPercent: number;
    diskTotalKb: number;
    diskUsedKb: number;
    diskPercent: number;
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

export async function GET() {
  const statusUrl = process.env.INFRA_STATUS_URL;
  const token = process.env.INFRA_STATUS_TOKEN;

  if (!statusUrl || !token) {
    return Response.json(
      { ok: false, error: "The infrastructure status agent is not configured." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(statusUrl, {
      headers: {
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
