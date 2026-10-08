import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { Gift, Megaphone, MessageCircle, MessageSquareWarning, PartyPopper, Vote } from "lucide-react";
import type { ModuleManifest } from "../types";
import {
  usePendingComplaintsBadge,
  usePortalCelebrationsBadge,
  usePortalOpenPollsBadge,
  usePortalUnreadMessagesBadge,
  useUnreadMessagesBadge,
} from "./lib/badges";

/*
 * Engagement & notifications: announcements, polls, complaints, HR <-> employee messages,
 * celebrations, the staff notification centre and web push (public/sw.js + push-send).
 * HR and the owner run it; every staff role gets the notification centre.
 */
const AnnouncementsPage = lazy(() => import("./pages/AnnouncementsPage"));
const PollsPage = lazy(() => import("./pages/PollsPage"));
const ComplaintsPage = lazy(() => import("./pages/ComplaintsPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const CelebrationsPage = lazy(() => import("./pages/CelebrationsPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));

const PortalAnnouncementsPage = lazy(() => import("./pages/portal/PortalAnnouncementsPage"));
const PortalPollsPage = lazy(() => import("./pages/portal/PortalPollsPage"));
const PortalMessagesPage = lazy(() => import("./pages/portal/PortalMessagesPage"));
const PortalComplaintsPage = lazy(() => import("./pages/portal/PortalComplaintsPage"));
const PortalCelebrationsPage = lazy(() => import("./pages/portal/PortalCelebrationsPage"));
const PortalDevicesPage = lazy(() => import("./pages/portal/PortalDevicesPage"));

const manifest: ModuleManifest = {
  id: "engagement",
  routes: [
    { path: "/announcements", element: <AnnouncementsPage />, roles: ["owner", "hr"] },
    { path: "/polls", element: <PollsPage />, roles: ["owner", "hr"] },
    { path: "/complaints", element: <ComplaintsPage />, roles: ["owner", "hr"] },
    { path: "/messages", element: <MessagesPage />, roles: ["owner", "hr"] },
    { path: "/celebrations", element: <CelebrationsPage />, roles: ["owner", "hr"] },
    { path: "/notifications", element: <NotificationsPage />, roles: ["owner", "hr", "finance"] },
    // Old link to the single engagement page.
    { path: "/engagement", element: <Navigate to="/announcements" replace />, roles: ["owner", "hr"] },
  ],
  nav: [
    { key: "engagement.announcements", label: "Announcements", href: "/announcements", icon: Megaphone, group: "Engagement", roles: ["owner", "hr"], order: 10 },
    { key: "engagement.polls", label: "Polls", href: "/polls", icon: Vote, group: "Engagement", roles: ["owner", "hr"], order: 20 },
    {
      key: "engagement.messages",
      label: "Messages",
      href: "/messages",
      icon: MessageCircle,
      group: "Engagement",
      roles: ["owner", "hr"],
      order: 30,
      useBadge: useUnreadMessagesBadge,
    },
    {
      key: "engagement.complaints",
      label: "Complaints",
      href: "/complaints",
      icon: MessageSquareWarning,
      group: "Engagement",
      roles: ["owner", "hr"],
      order: 40,
      useBadge: usePendingComplaintsBadge,
    },
    { key: "engagement.celebrations", label: "Celebrations", href: "/celebrations", icon: PartyPopper, group: "Engagement", roles: ["owner", "hr"], order: 50 },
  ],
  portalRoutes: [
    { path: "announcements", element: <PortalAnnouncementsPage /> },
    { path: "polls", element: <PortalPollsPage /> },
    { path: "messages", element: <PortalMessagesPage /> },
    { path: "complaints", element: <PortalComplaintsPage /> },
    { path: "celebrations", element: <PortalCelebrationsPage /> },
    { path: "devices", element: <PortalDevicesPage /> },
    // Old link to the single "Connect" page.
    { path: "engagement", element: <Navigate to="/portal/messages" replace /> },
  ],
  portalNav: [
    { key: "engagement.portal.messages", label: "Messages", href: "/portal/messages", icon: MessageCircle, order: 15, useBadge: usePortalUnreadMessagesBadge },
    { key: "engagement.portal.announcements", label: "Announcements", href: "/portal/announcements", icon: Megaphone, order: 50 },
    { key: "engagement.portal.polls", label: "Polls", href: "/portal/polls", icon: Vote, order: 52, useBadge: usePortalOpenPollsBadge },
    { key: "engagement.portal.complaints", label: "Complaints", href: "/portal/complaints", icon: MessageSquareWarning, order: 55 },
    { key: "engagement.portal.celebrations", label: "Celebrations", href: "/portal/celebrations", icon: Gift, order: 57, useBadge: usePortalCelebrationsBadge },
  ],
  commands: [
    { id: "engagement.new-announcement", label: "New announcement", href: "/announcements?new=1", icon: Megaphone, roles: ["owner", "hr"], keywords: ["post", "news", "notice board"] },
    { id: "engagement.new-poll", label: "Start a poll", href: "/polls?new=1", icon: Vote, roles: ["owner", "hr"], keywords: ["vote", "survey"] },
    { id: "engagement.inbox", label: "Open the HR inbox", href: "/messages", icon: MessageCircle, roles: ["owner", "hr"], keywords: ["chat", "messages"] },
    { id: "engagement.complaints", label: "Review complaints", href: "/complaints?tab=pending", icon: MessageSquareWarning, roles: ["owner", "hr"], keywords: ["grievance"] },
    { id: "engagement.celebrations", label: "Birthdays and anniversaries", href: "/celebrations", icon: PartyPopper, roles: ["owner", "hr"], keywords: ["birthday", "anniversary", "wishes"] },
  ],
};

export default manifest;
