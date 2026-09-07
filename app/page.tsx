import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Dashboard localPreview={process.env.NEXT_LOCAL_REVIEW === "1"} />;
}
