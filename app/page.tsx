import Dashboard from "./components/dashboard";
import { infrastructureConfig } from "./lib/infrastructure-config";

export default function Home() {
  return <Dashboard section="overview" config={infrastructureConfig} />;
}
