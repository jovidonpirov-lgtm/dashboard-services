import Dashboard from "@/components/dashboard";
import { demoStore } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <Dashboard
      demo={demoStore()}
      localPreview={process.env.NEXT_LOCAL_REVIEW === "1"}
    />
  );
}
