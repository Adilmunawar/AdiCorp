import { BellRing } from "lucide-react";
import { PageHeader } from "@/components/kit";
import { PushDevicesCard } from "../../components/PushDevicesCard";

/** Portal: turn notifications on or off on this device and manage the others. */
export default function PortalDevicesPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="My portal" title="Device notifications" description="Get leave decisions, messages and announcements on your phone." icon={BellRing} />
      <PushDevicesCard audience="portal" />
    </div>
  );
}
