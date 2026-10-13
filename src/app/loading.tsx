import { ProfileSkeleton } from "@/components/shared/Skeletons";
import { EmergencyBar } from "@/components/emergency/EmergencyBar";

/** The emergency bar renders first, even while a route segment loads. */
export default function Loading() {
  return (
    <>
      <EmergencyBar />
      <div className="mx-auto max-w-3xl px-4 py-6" role="status" aria-live="polite">
        <ProfileSkeleton />
      </div>
    </>
  );
}
