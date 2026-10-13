import { Suspense } from "react";
import { EmergencySearch } from "./EmergencySearch";

export default function EmergencyPage() {
  return (
    <Suspense>
      <EmergencySearch />
    </Suspense>
  );
}
