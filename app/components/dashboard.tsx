"use client";

import {
  AlertTriangle,
  Bell,
  Box,
  ChevronRight,
  CircuitBoard,
  CircleDot,
  Cloud,
  Cpu,
  Database,
  FolderKanban,
  Gauge,
  HardDrive,
  Home,
  Layers3,
  MemoryStick,
  Network,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Timer,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  InfrastructureConfig,
  InfrastructureNode,
  InfrastructureProject as Project,
  InfrastructureStatus as Status,
} from "../lib/infrastructure-config";

export type DashboardSection =
  | "overview"
  | "topology"
  | "nodes"
  | "projects"
  | "alerts"
  | "settings";

type ServiceSnapshot = {
  name: string;
  code: number;
  latencyMs: number;
  status: Status;
};

type LiveSnapshot = {
  ok: boolean;
  checkedAt?: string;
  error?: string;
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
  services?: ServiceSnapshot[];
};

const navItems = [
  { id: "overview", label: "Overview", href: "/", icon: Home },
  { id: "topology", label: "Topology", href: "/topology", icon: Network },
  { id: "nodes", label: "Nodes", href: "/nodes", icon: Server },
  { id: "projects", label: "Projects", href: "/projects", icon: FolderKanban },
  { id: "alerts", label: "Alerts", href: "/alerts", icon: Bell },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
] as const;

const sectionCopy: Record<
  DashboardSection,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: "Live infrastructure",
    title: "Infrastructure at a glance",
    description: "Your public gateway, private network, hardware, and workspaces.",
  },
  topology: {
    eyebrow: "Network map",
    title: "Topology",
    description: "Follow the path from the public edge to every project.",
  },
  nodes: {
    eyebrow: "Compute",
    title: "Nodes",
    description: "Health and capacity across servers, hardware, and workspaces.",
  },
  projects: {
    eyebrow: "Applications",
    title: "Projects",
    description: "Every service and project, grouped independently of its host.",
  },
  alerts: {
    eyebrow: "Attention",
    title: "Alerts",
    description: "Failures, degraded services, and infrastructure gaps.",
  },
  settings: {
    eyebrow: "Configuration",
    title: "Monitor settings",
    description: "Connections, polling, and dashboard behavior.",
  },
};

function formatUptime(seconds: number) {
  if (!seconds) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function statusLabel(status: Status) {
  if (status === "unconfigured") return "Not connected";
  return status[0].toUpperCase() + status.slice(1);
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" />
      {statusLabel(status)}
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  suffix = "%",
}: {
  icon: typeof Cpu;
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        <Icon size={15} />
        {label}
      </div>
      <div className="metric-value">
        {value === null ? "—" : `${value}${suffix}`}
      </div>
      <div className="metric-track">
        <span style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function NodeGlyph({ id }: { id: string }) {
  if (id.startsWith("raspberry")) return <CircuitBoard size={19} />;
  if (id === "codex-workspace") return <Box size={19} />;
  return <Server size={19} />;
}

export default function Dashboard({
  section,
  config,
}: {
  section: DashboardSection;
  config: InfrastructureConfig;
}) {
  const {
    nodes: configuredNodes,
    projects: configuredProjects,
    dashboard,
  } = config;
  const [selectedNodeId, setSelectedNodeId] = useState(
    dashboard.defaultNodeId,
  );
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      const data = (await response.json()) as LiveSnapshot;
      setSnapshot(data);
    } catch {
      setSnapshot({ ok: false, error: "Live data is temporarily unavailable." });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(refresh, 0);
    const interval = window.setInterval(
      refresh,
      dashboard.pollIntervalSeconds * 1000,
    );
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [dashboard.pollIntervalSeconds, refresh]);

  const nodes = useMemo(() => {
    if (!snapshot?.ok || !snapshot.node) return configuredNodes;
    return configuredNodes.map((node) =>
      node.id === snapshot.node!.id
        ? {
            ...node,
            status: snapshot.node!.status,
            subtitle: `${snapshot.node!.hostname} · public gateway`,
            metrics: {
              cpu: snapshot.node!.cpuPercent,
              memory: snapshot.node!.memPercent,
              disk: snapshot.node!.diskPercent,
              uptime: formatUptime(snapshot.node!.uptimeSeconds),
            },
          }
        : node,
    );
  }, [configuredNodes, snapshot]);

  const projects = useMemo(() => {
    if (!snapshot?.services) return configuredProjects;
    return configuredProjects.map((project) => {
      const live = snapshot.services?.find(
        (service) => service.name === project.id,
      );
      return live
        ? {
            ...project,
            status: live.status,
            latencyMs: live.latencyMs,
          }
        : project;
    });
  }, [configuredProjects, snapshot]);

  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const selectedProjects = projects.filter((project) =>
    selectedNode.projectIds.includes(project.id),
  );
  const knownStatuses = [...nodes.map((node) => node.status), ...projects.map((p) => p.status)];
  const counts = {
    healthy: knownStatuses.filter((status) => status === "healthy").length,
    degraded: knownStatuses.filter((status) => status === "degraded").length,
    offline: knownStatuses.filter((status) => status === "offline").length,
  };
  const alerts = projects.filter(
    (project) =>
      project.status === "offline" || project.status === "degraded",
  );
  const copy = sectionCopy[section];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <Layers3 size={20} />
          </span>
          <span>
            <strong>Serega</strong>
            <small>Stack Monitor</small>
          </span>
          <button
            className="mobile-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="main-nav" aria-label="Dashboard navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.id}
                className={section === item.id ? "active" : ""}
                href={item.href}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === "alerts" && alerts.length > 0 && (
                  <em>{alerts.length}</em>
                )}
              </a>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="connection-mini">
            <span className={snapshot?.ok ? "pulse live" : "pulse"} />
            <span>
              <strong>{snapshot?.ok ? "Live monitor connected" : "Connecting"}</strong>
              <small>VPS status agent</small>
            </span>
          </div>
          <div className="profile">
            <span>SS</span>
            <div>
              <strong>Sergey</strong>
              <small>Owner</small>
            </div>
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Layers3 size={19} />
          </button>
          <div className="breadcrumb">
            <span>Stack Monitor</span>
            <ChevronRight size={14} />
            <strong>{navItems.find((item) => item.id === section)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={() => setSearchOpen((open) => !open)}
              aria-label="Search"
            >
              <Search size={18} />
            </button>
            <button
              className="refresh-button"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? "spin" : ""} />
              <span>{refreshing ? "Checking" : "Refresh"}</span>
            </button>
          </div>
        </header>

        {searchOpen && (
          <div className="search-panel">
            <Search size={18} />
            <input autoFocus placeholder="Search nodes, projects, or alerts…" />
            <kbd>ESC</kbd>
          </div>
        )}

        <section className="page-heading">
          <div>
            <p>{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <span>{copy.description}</span>
          </div>
          <div className="health-summary">
            <div>
              <span className="status-dot healthy-dot" />
              <strong>{counts.healthy}</strong>
              <small>healthy</small>
            </div>
            <div>
              <span className="status-dot degraded-dot" />
              <strong>{counts.degraded}</strong>
              <small>degraded</small>
            </div>
            <div>
              <span className="status-dot offline-dot" />
              <strong>{counts.offline}</strong>
              <small>offline</small>
            </div>
          </div>
        </section>

        {!snapshot?.ok && snapshot?.error && (
          <div className="bridge-notice">
            <AlertTriangle size={17} />
            <span>{snapshot.error} Showing the last known infrastructure map.</span>
          </div>
        )}

        {(section === "overview" || section === "topology") && (
          <TopologyView
            nodes={nodes}
            projects={projects}
            selectedNode={selectedNode}
            selectedProjects={selectedProjects}
            onSelectNode={setSelectedNodeId}
            checkedAt={snapshot?.checkedAt}
          />
        )}
        {section === "nodes" && (
          <NodesView nodes={nodes} onSelectNode={setSelectedNodeId} />
        )}
        {section === "projects" && <ProjectsView projects={projects} nodes={nodes} />}
        {section === "alerts" && <AlertsView alerts={alerts} />}
        {section === "settings" && (
          <SettingsView snapshot={snapshot} config={config} />
        )}
      </main>
    </div>
  );
}

function TopologyView({
  nodes,
  projects,
  selectedNode,
  selectedProjects,
  onSelectNode,
  checkedAt,
}: {
  nodes: InfrastructureNode[];
  projects: Project[];
  selectedNode: InfrastructureNode;
  selectedProjects: Project[];
  onSelectNode: (id: string) => void;
  checkedAt?: string;
}) {
  return (
    <div className="topology-layout">
      <section className="topology-card">
        <div className="topology-toolbar">
          <div className="filter-row">
            <button>All statuses <ChevronRight size={13} /></button>
            <button>All types <ChevronRight size={13} /></button>
            <button>All regions <ChevronRight size={13} /></button>
          </div>
          <div className="legend">
            <span><i className="status-dot healthy-dot" /> Healthy</span>
            <span><i className="status-dot degraded-dot" /> Degraded</span>
            <span><i className="status-dot offline-dot" /> Offline</span>
          </div>
        </div>

        <div className="map-canvas">
          <div className="layer-label layer-edge"><Cloud size={14} /> EDGE</div>
          <div className="layer-label layer-tail"><Network size={14} /> TAILSCALE</div>
          <div className="layer-label layer-physical"><Radio size={14} /> PHYSICAL</div>
          <div className="layer-label layer-workspace"><Box size={14} /> WORKSPACE</div>
          <svg
            className="topology-lines"
            viewBox="0 0 900 650"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M450 35 V120" />
            <path d="M450 220 V260 C450 290 250 255 250 315" />
            <path d="M450 220 V260 C450 290 655 255 655 315" />
            <path d="M655 405 V455" />
            <path d="M250 405 V520 C250 555 450 520 450 585" />
          </svg>
          <div className="internet-node"><Cloud size={16} /></div>
          {nodes.map((node) => {
            const serviceCount = projects.filter((project) =>
              node.projectIds.includes(project.id),
            ).length;
            return (
              <button
                key={node.id}
                className={`map-node map-${node.id} ${
                  selectedNode.id === node.id ? "selected" : ""
                }`}
                onClick={() => onSelectNode(node.id)}
              >
                <span className="node-icon"><NodeGlyph id={node.id} /></span>
                <span className="node-copy">
                  <strong>{node.name}</strong>
                  <small>{node.subtitle}</small>
                </span>
                <span className={`status-dot ${node.status}-dot`} />
                <span className="node-projects">
                  <FolderKanban size={12} />
                  {serviceCount} {serviceCount === 1 ? "project" : "projects"}
                </span>
              </button>
            );
          })}
          <div className="map-help">Select a node to inspect its health and projects.</div>
        </div>
      </section>

      <aside className="inspector">
        <div className="inspector-head">
          <div className="node-title">
            <span className="node-icon"><NodeGlyph id={selectedNode.id} /></span>
            <div>
              <h2>{selectedNode.name}</h2>
              <p>
                {selectedNode.address} · {selectedNode.location} ·{" "}
                {selectedNode.hardware.model}
              </p>
            </div>
          </div>
          <StatusBadge status={selectedNode.status} />
        </div>

        <div className="metric-grid">
          <Metric icon={Cpu} label="CPU" value={selectedNode.metrics.cpu} />
          <Metric icon={MemoryStick} label="RAM" value={selectedNode.metrics.memory} />
          <Metric icon={HardDrive} label="Disk" value={selectedNode.metrics.disk} />
          <Metric
            icon={Timer}
            label="Uptime"
            value={null}
            suffix=""
          />
          <div className="uptime-overlay">{selectedNode.metrics.uptime}</div>
        </div>

        <div className="inspector-section">
          <div className="section-label">
            <span>Projects on this node</span>
            <small>{selectedProjects.length}</small>
          </div>
          <div className="project-list">
            {selectedProjects.length ? (
              selectedProjects.map((project) => (
                <div className="project-row" key={project.id}>
                  <span className="project-icon">
                    <Box size={16} />
                  </span>
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.endpoint}</small>
                  </span>
                  <StatusBadge status={project.status} />
                  <ChevronRight size={15} />
                </div>
              ))
            ) : (
              <div className="empty-state">
                <CircleDot size={18} />
                <p>No projects connected yet.</p>
              </div>
            )}
          </div>
        </div>

        <div className="inspector-section connection-card">
          <div className="section-label"><span>Connection</span></div>
          <div className="connection-row">
            <span className="mesh-icon"><Network size={18} /></span>
            <div>
              <strong>
                {selectedNode.location}
              </strong>
              <small>
                {checkedAt
                  ? `Checked ${new Date(checkedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Awaiting first check"}
              </small>
            </div>
            <ShieldCheck size={18} className="verified" />
          </div>
        </div>
      </aside>
    </div>
  );
}

function NodesView({
  nodes,
  onSelectNode,
}: {
  nodes: InfrastructureNode[];
  onSelectNode: (id: string) => void;
}) {
  return (
    <div className="content-card-grid">
      {nodes.map((node) => (
        <article className="node-card" key={node.id}>
          <div className="node-card-head">
            <span className="node-icon large"><NodeGlyph id={node.id} /></span>
            <div>
              <h2>{node.name}</h2>
              <p>{node.subtitle}</p>
            </div>
            <StatusBadge status={node.status} />
          </div>
          <div className="node-address">
            <Network size={15} />
            <span>{node.address}</span>
            <small>
              {node.location} · {node.hardware.model}
            </small>
          </div>
          <div className="node-metrics">
            <Metric icon={Cpu} label="CPU" value={node.metrics.cpu} />
            <Metric icon={MemoryStick} label="RAM" value={node.metrics.memory} />
            <Metric icon={HardDrive} label="Disk" value={node.metrics.disk} />
          </div>
          <button className="text-button" onClick={() => onSelectNode(node.id)}>
            Inspect node <ChevronRight size={15} />
          </button>
        </article>
      ))}
    </div>
  );
}

function ProjectsView({
  projects,
  nodes,
}: {
  projects: Project[];
  nodes: InfrastructureNode[];
}) {
  return (
    <section className="table-card">
      <div className="table-toolbar">
        <div>
          <h2>All projects</h2>
          <p>{projects.length} services across {nodes.length} nodes</p>
        </div>
        <button><FolderKanban size={15} /> Group by node</button>
      </div>
      <div className="data-table">
        <div className="table-row table-head">
          <span>Project</span>
          <span>Node</span>
          <span>Endpoint</span>
          <span>Latency</span>
          <span>Status</span>
        </div>
        {projects.map((project) => (
          <div className="table-row" key={project.id}>
            <span className="project-name">
              <span className="project-icon"><Box size={16} /></span>
              <span><strong>{project.name}</strong><small>{project.description}</small></span>
            </span>
            <span>{nodes.find((node) => node.id === project.nodeId)?.name}</span>
            <span className="mono">{project.endpoint}</span>
            <span>{project.latencyMs === null ? "—" : `${project.latencyMs} ms`}</span>
            <span><StatusBadge status={project.status} /></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AlertsView({ alerts }: { alerts: Project[] }) {
  return (
    <div className="alerts-layout">
      <section className="alert-list">
        {alerts.map((alert) => (
          <article className="alert-card" key={alert.id}>
            <span className={`alert-icon status-${alert.status}`}>
              {alert.status === "offline" ? <WifiOff size={20} /> : <AlertTriangle size={20} />}
            </span>
            <div>
              <div className="alert-title">
                <h2>{alert.name} is {alert.status}</h2>
                <StatusBadge status={alert.status} />
              </div>
              <p>
                {alert.status === "offline"
                  ? "The upstream did not accept a connection during the latest check."
                  : "The service responded, but the upstream returned a server error."}
              </p>
              <small>Latest check · automatic probe</small>
            </div>
            <button aria-label={`Open ${alert.name}`}><ChevronRight size={17} /></button>
          </article>
        ))}
        {!alerts.length && (
          <div className="empty-alerts">
            <ShieldCheck size={28} />
            <h2>Everything looks quiet</h2>
            <p>No active infrastructure alerts.</p>
          </div>
        )}
      </section>
      <aside className="alert-summary-card">
        <p>Current state</p>
        <strong>{alerts.length}</strong>
        <span>active alerts</span>
        <div>
          <small>Automatic checks</small>
          <b>Every 60 seconds</b>
        </div>
      </aside>
    </div>
  );
}

function SettingsView({
  snapshot,
  config,
}: {
  snapshot: LiveSnapshot | null;
  config: InfrastructureConfig;
}) {
  const unconfiguredNodes = config.nodes
    .filter((node) => node.status === "unconfigured")
    .map((node) => node.name);
  const settings = [
    {
      icon: Gauge,
      title: "Status collector",
      description: "Server-side live metrics endpoint",
      state: snapshot?.ok ? "Connected" : "Checking",
    },
    {
      icon: Timer,
      title: "Polling interval",
      description: "Refresh health and service probes",
      state: `${config.dashboard.pollIntervalSeconds} seconds`,
    },
    {
      icon: Bell,
      title: "Alert delivery",
      description: "In-dashboard alerts only",
      state: "Dashboard",
    },
    {
      icon: Database,
      title: "History",
      description: "Long-term metric retention",
      state: "Not configured",
    },
  ];
  return (
    <div className="settings-grid">
      {settings.map((setting) => {
        const Icon = setting.icon;
        return (
          <article className="setting-card" key={setting.title}>
            <span className="setting-icon"><Icon size={20} /></span>
            <div><h2>{setting.title}</h2><p>{setting.description}</p></div>
            <span>{setting.state}</span>
            <ChevronRight size={17} />
          </article>
        );
      })}
      <article className="setting-callout">
        <Gauge size={22} />
        <div>
          <h2>Ready for more nodes</h2>
          <p>
            {unconfiguredNodes.length
              ? `${unconfiguredNodes.join(", ")} ${
                  unconfiguredNodes.length === 1 ? "is" : "are"
                } represented in the YAML topology but intentionally show as not connected until their collectors exist.`
              : "All YAML-defined nodes have an active configuration."}
          </p>
        </div>
      </article>
    </div>
  );
}
