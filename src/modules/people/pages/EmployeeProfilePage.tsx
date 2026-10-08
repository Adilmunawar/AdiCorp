import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Activity, ArrowLeft, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Laptop, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, TabsNav, useTabParam, type TabItem } from "@/components/kit";
import { useDepartmentNames, useEmployee, useEmployees, usePeopleContext } from "../api/employees";
import { useEmployeeDocuments } from "../api/documents";
import { REQUIRED_DOCUMENTS } from "../lib/constants";
import { errorMessage } from "../lib/utils";
import { RejoinDialog, SeparateDialog } from "../components/EmployeeDialogs";
import { ProfileHeader, ProfileSkeleton } from "../components/profile/ProfileHeader";
import { OverviewTab } from "../components/profile/OverviewTab";
import { DocumentsPanel } from "../components/profile/DocumentsPanel";
import { AssetsTab } from "../components/profile/AssetsTab";
import { OnboardingTab } from "../components/profile/OnboardingTab";
import { LettersTab } from "../components/profile/LettersTab";
import { TimelineTab } from "../components/profile/TimelineTab";

/** An action started from the header's "More" menu that the target tab picks up once. */
type Intent = "upload" | "handover" | null;

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { isHR } = usePeopleContext();
  const { data: employee, isLoading, error } = useEmployee(id);
  const { data: everyone } = useEmployees();
  const location = useLocation();
  const departments = useDepartmentNames();
  const { data: docs } = useEmployeeDocuments(isHR ? id : undefined);
  const [separating, setSeparating] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [intent, setIntent] = useState<Intent>(null);

  // Previous / next person in directory order (same status group, by name), keeping the open tab.
  const siblings = useMemo(() => {
    if (!employee) return [];
    const active = employee.status === "active";
    return (everyone ?? []).filter((e) => (e.status === "active") === active).sort((a, b) => a.name.localeCompare(b.name));
  }, [everyone, employee]);
  const position = siblings.findIndex((e) => e.id === id);
  const prev = position > 0 ? siblings[position - 1] : null;
  const next = position >= 0 && position < siblings.length - 1 ? siblings[position + 1] : null;

  const onFile = new Set((docs ?? []).map((d) => d.document_type));
  const missingDocs = docs ? REQUIRED_DOCUMENTS.filter((r) => !onFile.has(r.type)).length : 0;

  const tabs: TabItem[] = isHR
    ? [
        { value: "overview", label: "Overview", icon: UserRound },
        { value: "documents", label: "Documents", icon: FileText, badge: employee?.status === "active" ? missingDocs : 0 },
        { value: "assets", label: "Equipment", icon: Laptop },
        { value: "onboarding", label: "Checklists", icon: ClipboardCheck },
        { value: "letters", label: "Letters", icon: Mail },
        { value: "timeline", label: "Timeline", icon: Activity },
      ]
    : [
        { value: "overview", label: "Overview", icon: UserRound },
        { value: "timeline", label: "Timeline", icon: Activity },
      ];
  const [tab, setTab] = useTabParam(tabs);

  // Name the browser tab after the person; the shell's title comes back on leave.
  useEffect(() => {
    if (!employee?.name) return;
    const previous = document.title;
    document.title = `${employee.name} · AdiCorp HR`;
    return () => {
      document.title = previous;
    };
  }, [employee?.name]);

  const go = (next: string) => {
    if (next === "documents-upload") {
      setIntent("upload");
      setTab("documents");
    } else if (next === "assets-handover") {
      setIntent("handover");
      setTab("assets");
    } else {
      setTab(next);
    }
  };

  if (isLoading && !employee) return <ProfileSkeleton />;
  if (!employee) {
    return (
      <EmptyState
        icon={UserRound}
        title={error ? "Could not load this employee" : "Employee not found"}
        description={error ? errorMessage(error) : "They may belong to another company, or the link is wrong."}
        action={
          <Button size="sm" asChild>
            <Link to="/employees">Back to employees</Link>
          </Button>
        }
      />
    );
  }

  const dept = employee.department_id ? departments.get(employee.department_id) ?? "" : "";

  return (
    <div className="animate-in fade-in duration-300">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 h-9 px-2 text-muted-foreground sm:h-8" asChild>
          <Link to="/employees">
            <ArrowLeft className="h-4 w-4" /> Employees
          </Link>
        </Button>
        {position >= 0 && siblings.length > 1 && (
          <nav className="flex items-center gap-1" aria-label="Browse employees">
            <span className="tabular mr-1 hidden text-[12px] text-muted-foreground sm:inline">
              {position + 1} of {siblings.length}
              {employee.status === "active" ? "" : " separated"}
            </span>
            {[
              { to: prev, label: "Previous", Icon: ChevronLeft },
              { to: next, label: "Next", Icon: ChevronRight },
            ].map(({ to, label, Icon }) =>
              to ? (
                <Button key={label} variant="outline" size="icon" className="h-9 w-9 rounded-xl sm:h-8 sm:w-8" asChild>
                  <Link to={`/employees/${to.id}${location.search}`} aria-label={`${label}: ${to.name}`} title={`${label}: ${to.name}`}>
                    <Icon className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button key={label} variant="outline" size="icon" className="h-9 w-9 rounded-xl sm:h-8 sm:w-8" disabled aria-label={`No ${label.toLowerCase()} employee`}>
                  <Icon className="h-4 w-4" />
                </Button>
              ),
            )}
          </nav>
        )}
      </div>

      <ProfileHeader
        employee={employee}
        departmentName={dept}
        isHR={isHR}
        onTab={go}
        onSeparate={() => setSeparating(true)}
        onRejoin={() => setRejoining(true)}
      />

      <TabsNav tabs={tabs} value={tab} onChange={setTab} className="mb-4" />

      {tab === "overview" && <OverviewTab employee={employee} departmentName={dept} />}
      {tab === "documents" && isHR && <DocumentsPanel employee={employee} openUpload={intent === "upload"} onUploadOpened={() => setIntent(null)} />}
      {tab === "assets" && isHR && <AssetsTab employee={employee} openHandover={intent === "handover"} onHandoverOpened={() => setIntent(null)} />}
      {tab === "onboarding" && isHR && <OnboardingTab employee={employee} />}
      {tab === "letters" && isHR && <LettersTab employeeId={employee.id} />}
      {tab === "timeline" && <TimelineTab employeeId={employee.id} />}

      <SeparateDialog employee={employee} open={separating} onOpenChange={setSeparating} />
      <RejoinDialog employee={employee} open={rejoining} onOpenChange={setRejoining} />
    </div>
  );
}
