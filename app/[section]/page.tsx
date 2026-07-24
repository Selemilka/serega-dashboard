import { notFound } from "next/navigation";
import Dashboard, { type DashboardSection } from "../components/dashboard";
import { infrastructureConfig } from "../lib/infrastructure-config";

const sections = new Set<DashboardSection>([
  "topology",
  "nodes",
  "projects",
  "alerts",
  "settings",
]);

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (!sections.has(section as DashboardSection)) {
    notFound();
  }

  return (
    <Dashboard
      section={section as DashboardSection}
      config={infrastructureConfig}
    />
  );
}
