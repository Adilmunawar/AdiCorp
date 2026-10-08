import { CelebrationMoment } from "./CelebrationMoment";
import { ComingUpOnceADay } from "./ComingUp";
import { PushPrompt } from "./PushPrompt";

/** Shared extras on the staff engagement pages: the push reminder and HR's once-a-day week ahead. */
export function StaffExtras({ showComingUp = true }: { showComingUp?: boolean }) {
  return (
    <>
      <PushPrompt audience="staff" settingsHref="/notifications" />
      {showComingUp && <ComingUpOnceADay />}
    </>
  );
}

/** Shared extras on the portal engagement pages: the push reminder and the person's own celebration moment. */
export function PortalExtras() {
  return (
    <>
      <PushPrompt audience="portal" settingsHref="/portal/devices" />
      <CelebrationMoment />
    </>
  );
}
