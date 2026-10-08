import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { usePortalCelebrations } from "../lib/portalApi";
import { greeting } from "../lib/celebrations";
import { store } from "../lib/push";
import { Confetti } from "./Confetti";

const seenKey = (employeeId: string) => `adicorp.celebration.seen.${employeeId}`;

/**
 * The person's own birthday, work anniversary or first day: confetti and a greeting card,
 * once a day per device. Mounted on the portal engagement pages.
 */
export function CelebrationMoment() {
  const { employee } = useEmployeeAuth();
  const { data } = usePortalCelebrations();
  const mine = useMemo(() => data?.occasions.find((o) => o.is_me && o.days_until === 0) ?? null, [data]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!employee || !mine || !data) return;
    if (store.get(seenKey(employee.id)) === data.today) return;
    store.set(seenKey(employee.id), data.today);
    setOpen(true);
  }, [employee, mine, data]);

  if (!mine || !data) return null;
  const g = greeting(mine, data.company_name);
  const wishes = data.received.length;

  return (
    <>
      {open && <Confetti />}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl p-0 sm:max-w-sm">
          <div className="bg-primary px-6 pb-6 pt-7 text-center text-primary-foreground">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-foreground/15" aria-hidden>
              <PartyPopper className="h-6 w-6" />
            </div>
            <DialogTitle className="mt-3 font-display text-xl font-semibold text-primary-foreground">{g.title}</DialogTitle>
            <DialogDescription className="mt-1.5 text-sm text-primary-foreground/85">{g.body}</DialogDescription>
          </div>
          <div className="space-y-3 px-6 py-5 text-center">
            <p className="text-xs text-muted-foreground">
              {wishes > 0 ? `${wishes} ${wishes === 1 ? "colleague has" : "colleagues have"} sent you wishes so far.` : "Your colleagues can send you wishes today."}
            </p>
            <div className="flex justify-center gap-2">
              <Button asChild className="rounded-xl" onClick={() => setOpen(false)}>
                <Link to="/portal/celebrations">See your wishes</Link>
              </Button>
              <Button variant="ghost" className="rounded-xl" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
