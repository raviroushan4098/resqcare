import { PageShell } from "@/components/shared/PageShell";
import { PermissionDenied } from "@/components/shared/ProtectedRoute";

export default function PermissionDeniedPage() {
  return (
    <PageShell>
      <PermissionDenied />
    </PageShell>
  );
}
