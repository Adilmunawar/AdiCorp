import { lazy, Suspense, type ReactNode } from "react";
import { FilePlus2, FileSignature, Mail, PenSquare } from "lucide-react";
import { PageSkeleton } from "@/components/kit";
import { db } from "@/integrations/supabase/client";
import type { ModuleManifest, SearchResult } from "../types";
import { useOverdueLettersCount, usePoliciesUnsignedCount, usePortalPendingCount, usePortalUnacknowledgedCount } from "./lib/api";
import { letterLabel } from "./lib/letters";

/*
 * Policies & letters module: company policies with versioning and e-signatures,
 * and letters from HR (reference numbers, acknowledgement, one reply, withdraw).
 * HR and the owner manage both; employees read, sign, acknowledge and reply in the portal.
 */
const PoliciesPage = lazy(() => import("./pages/PoliciesPage"));
const PolicyDetailPage = lazy(() => import("./pages/PolicyDetailPage"));
const LettersPage = lazy(() => import("./pages/LettersPage"));
const LetterComposerPage = lazy(() => import("./pages/LetterComposerPage"));
const LetterDetailPage = lazy(() => import("./pages/LetterDetailPage"));
const PortalPoliciesPage = lazy(() => import("./portal/PortalPoliciesPage"));
const PortalSignPage = lazy(() => import("./portal/PortalSignPage"));
const PortalSignaturePage = lazy(() => import("./portal/PortalSignaturePage"));
const PortalLettersPage = lazy(() => import("./portal/PortalLettersPage"));
const PortalLetterPage = lazy(() => import("./portal/PortalLetterPage"));

const page = (node: ReactNode) => <Suspense fallback={<PageSkeleton />}>{node}</Suspense>;

const HR: ("owner" | "hr")[] = ["owner", "hr"];

const manifest: ModuleManifest = {
  id: "policies",
  routes: [
    { path: "/policies", element: page(<PoliciesPage />), roles: HR },
    { path: "/policies/:id", element: page(<PolicyDetailPage />), roles: HR },
    { path: "/letters", element: page(<LettersPage />), roles: HR },
    { path: "/letters/new", element: page(<LetterComposerPage />), roles: HR },
    { path: "/letters/:id", element: page(<LetterDetailPage />), roles: HR },
  ],
  nav: [
    {
      key: "policies.policies",
      label: "Policies",
      href: "/policies",
      icon: FileSignature,
      group: "People",
      roles: HR,
      order: 60,
      useBadge: usePoliciesUnsignedCount,
    },
    {
      key: "policies.letters",
      label: "Letters",
      href: "/letters",
      icon: Mail,
      group: "People",
      roles: HR,
      order: 65,
      useBadge: useOverdueLettersCount,
    },
  ],
  portalRoutes: [
    { path: "policies", element: page(<PortalPoliciesPage />) },
    { path: "policies/sign/:versionId", element: page(<PortalSignPage />) },
    { path: "policies/signatures/:id", element: page(<PortalSignaturePage />) },
    { path: "letters", element: page(<PortalLettersPage />) },
    { path: "letters/:id", element: page(<PortalLetterPage />) },
  ],
  portalNav: [
    { key: "policies.portal.policies", label: "Policies", href: "/portal/policies", icon: FileSignature, order: 70, useBadge: usePortalPendingCount },
    { key: "policies.portal.letters", label: "Letters from HR", href: "/portal/letters", icon: Mail, order: 75, useBadge: usePortalUnacknowledgedCount },
  ],
  commands: [
    { id: "policies.new-letter", label: "Write a letter", href: "/letters/new", icon: PenSquare, roles: HR, keywords: ["warning", "explanation", "appreciation", "notice"] },
    { id: "policies.new-policy", label: "New policy", href: "/policies", icon: FilePlus2, roles: HR, keywords: ["code of conduct", "sign"] },
  ],
  search: [
    {
      id: "policies.letters",
      label: "Letters",
      roles: HR,
      search: async ({ query, companyId }): Promise<SearchResult[]> => {
        const q = query.replace(/[%,()"\\]/g, " ").trim();
        if (!q) return [];
        const { data } = await db
          .from("hr_letters")
          .select("id, ref, kind, subject")
          .eq("company_id", companyId)
          .or(`ref.ilike.%${q}%,subject.ilike.%${q}%`)
          .order("issued_at", { ascending: false })
          .limit(6);
        return ((data ?? []) as { id: string; ref: string; kind: string; subject: string }[]).map((l) => ({
          id: `letter-${l.id}`,
          title: l.subject,
          subtitle: `${l.ref} · ${letterLabel(l.kind)}`,
          href: `/letters/${l.id}`,
          icon: Mail,
        }));
      },
    },
    {
      id: "policies.policies",
      label: "Policies",
      roles: HR,
      search: async ({ query, companyId }): Promise<SearchResult[]> => {
        const q = query.replace(/[%,()"\\]/g, " ").trim();
        if (!q) return [];
        const { data } = await db.from("policies").select("id, title, summary").eq("company_id", companyId).ilike("title", `%${q}%`).limit(5);
        return ((data ?? []) as { id: string; title: string; summary: string }[]).map((p) => ({
          id: `policy-${p.id}`,
          title: p.title,
          subtitle: p.summary || "Policy",
          href: `/policies/${p.id}`,
          icon: FileSignature,
        }));
      },
    },
  ],
};

export default manifest;
