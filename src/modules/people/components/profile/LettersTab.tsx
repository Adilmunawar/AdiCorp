import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, SectionCard, StatusBadge, formatDate, humanize } from "@/components/kit";
import { db } from "@/integrations/supabase/client";
import { adminRoutes } from "@/modules/registry";
import { usePeopleContext } from "../../api/employees";

interface LetterRow {
  id: string;
  ref: string;
  kind: string;
  subject: string;
  issued_at: string;
  acknowledged_at: string | null;
  withdrawn_at: string | null;
}

const hasRoute = (path: string) => adminRoutes.some((r) => r.path === path);

/** Letters issued to this person (owned by the policies module; linked, not duplicated). */
export function LettersTab({ employeeId }: { employeeId: string }) {
  const { companyId } = usePeopleContext();
  const lettersAvailable = hasRoute("/letters");
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["people", companyId, "letters", employeeId],
    enabled: !!companyId && lettersAvailable,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from("hr_letters")
        .select("id,ref,kind,subject,issued_at,acknowledged_at,withdrawn_at")
        .eq("company_id", companyId)
        .eq("employee_id", employeeId)
        .order("issued_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LetterRow[];
    },
  });

  if (!lettersAvailable) {
    return (
      <SectionCard>
        <EmptyState icon={Mail} title="Letters are not enabled" description="HR letters live in the Policies & letters area." compact />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Letters"
      description={data.length ? `${data.length} ${data.length === 1 ? "letter" : "letters"} issued to this person` : "Appointment, warning, appreciation and other letters issued to this person"}
      icon={Mail}
      flush
      actions={
        hasRoute("/letters/new") ? (
          <Button size="sm" asChild>
            <Link to={`/letters/new?employee=${employeeId}`}>
              <FilePlus2 className="h-4 w-4" /> Issue a letter
            </Link>
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <ListSkeleton rows={3} className="p-4" />
      ) : isError ? (
        <EmptyState
          icon={Mail}
          title="Could not load the letters"
          description="Check the connection and try again."
          compact
          action={
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      ) : data.length === 0 ? (
        <EmptyState icon={Mail} title="No letters yet" description="Letters you issue appear here and in the employee's portal." compact />
      ) : (
        <ul className="divide-y divide-border/60">
          {data.map((l) => (
            <li key={l.id}>
              <Link to={`/letters/${l.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary" aria-hidden>
                  <Mail className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold" title={l.subject}>{l.subject}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {l.ref} · {humanize(l.kind)} · {formatDate(l.issued_at)}
                  </p>
                </div>
                <StatusBadge
                  status={l.withdrawn_at ? "cancelled" : l.acknowledged_at ? "signed" : "pending"}
                  label={l.withdrawn_at ? "Withdrawn" : l.acknowledged_at ? "Acknowledged" : "Awaiting"}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
