import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { Briefcase, Plus, UserSearch, Users } from "lucide-react";
import { db } from "@/integrations/supabase/client";
import type { ModuleManifest, Role } from "../types";
import { useNewApplicationsCount } from "./lib/api";

const JobsPage = lazy(() => import("./pages/JobsPage"));
const JobEditorPage = lazy(() => import("./pages/JobEditorPage"));
const ApplicantsPage = lazy(() => import("./pages/ApplicantsPage"));
const PublicCareersPage = lazy(() => import("./public/PublicCareersPage"));
const PublicJobPage = lazy(() => import("./public/PublicJobPage"));
const PortalOpeningsPage = lazy(() => import("./portal/PortalOpeningsPage"));

/** Hiring is HR work; the owner sees everything. Finance never sees candidates. */
const HIRING: Role[] = ["owner", "hr"];

const manifest: ModuleManifest = {
  id: "careers",
  routes: [
    { path: "/hiring", element: <Navigate to="/hiring/jobs" replace />, roles: HIRING },
    { path: "/hiring/jobs", element: <JobsPage />, roles: HIRING },
    { path: "/hiring/jobs/new", element: <JobEditorPage />, roles: HIRING },
    { path: "/hiring/jobs/:id", element: <JobEditorPage />, roles: HIRING },
    { path: "/hiring/applicants", element: <ApplicantsPage />, roles: HIRING },
  ],
  nav: [
    { key: "careers.jobs", label: "Jobs", href: "/hiring/jobs", icon: Briefcase, group: "Hiring", roles: HIRING, order: 10 },
    {
      key: "careers.applicants",
      label: "Applicants",
      href: "/hiring/applicants",
      icon: Users,
      group: "Hiring",
      roles: HIRING,
      order: 20,
      useBadge: useNewApplicationsCount,
    },
  ],
  publicRoutes: [
    { path: "/careers/:slug", element: <PublicCareersPage />, roles: [] },
    { path: "/careers/:slug/:jobSlug", element: <PublicJobPage />, roles: [] },
  ],
  portalRoutes: [{ path: "openings", element: <PortalOpeningsPage /> }],
  portalNav: [{ key: "careers.openings", label: "Open roles", href: "/portal/openings", icon: Briefcase, order: 80 }],
  search: [
    {
      id: "careers.applicants",
      label: "Applicants",
      roles: HIRING,
      search: async ({ query, companyId }) => {
        const q = query.replace(/[%_,()]/g, " ").trim();
        if (!q) return [];
        const { data, error } = await db
          .from("job_applications")
          .select("id, name, email, status, job:job_postings(title)")
          .eq("company_id", companyId)
          .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
          .order("created_at", { ascending: false })
          .limit(6);
        if (error || !data) return [];
        return (data as unknown as { id: string; name: string; email: string; job: { title: string } | null }[]).map((a) => ({
          id: a.id,
          title: a.name,
          subtitle: [a.job?.title, a.email].filter(Boolean).join(" · "),
          href: `/hiring/applicants?application=${a.id}`,
          icon: UserSearch,
        }));
      },
    },
    {
      id: "careers.jobs",
      label: "Jobs",
      roles: HIRING,
      search: async ({ query, companyId }) => {
        const q = query.replace(/[%_,()]/g, " ").trim();
        if (!q) return [];
        const { data, error } = await db
          .from("job_postings")
          .select("id, title, status, location")
          .eq("company_id", companyId)
          .ilike("title", `%${q}%`)
          .limit(5);
        if (error || !data) return [];
        return (data as { id: string; title: string; status: string; location: string }[]).map((j) => ({
          id: j.id,
          title: j.title,
          subtitle: [j.status === "open" ? "Open" : "Closed", j.location].filter(Boolean).join(" · "),
          href: `/hiring/applicants?job=${j.id}`,
          icon: Briefcase,
        }));
      },
    },
  ],
  commands: [
    { id: "careers.post-job", label: "Post a job", href: "/hiring/jobs/new", icon: Plus, roles: HIRING, keywords: ["hire", "role", "vacancy", "opening"] },
    { id: "careers.pipeline", label: "Open hiring pipeline", href: "/hiring/applicants?view=board", icon: Users, roles: HIRING, keywords: ["applicants", "candidates", "kanban"] },
  ],
};

export default manifest;
