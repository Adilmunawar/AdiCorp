/* Engagement module data shapes, as returned by the engagement_* and portal_* RPCs. */

export type AnnouncementAudience = "all" | "department";

export interface StaffAnnouncement {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  is_active: boolean;
  audience: AnnouncementAudience;
  department_id: string | null;
  department_name: string | null;
  created_at: string;
  updated_at: string | null;
  author_name: string | null;
  edited_by_name: string | null;
}

export interface AnnouncementInput {
  id?: string | null;
  title: string;
  content: string;
  pinned: boolean;
  audience: AnnouncementAudience;
  department_id: string | null;
}

export interface Department {
  id: string;
  name: string;
}

export type PollStatus = "open" | "closed";

export interface PollOption {
  id: string;
  text: string;
  position?: number;
  /** Staff only. */
  votes?: number | null;
  /** Null on the portal until results are visible. */
  percent: number | null;
}

export interface StaffPoll {
  id: string;
  question: string;
  description: string | null;
  status: PollStatus;
  expires_at: string | null;
  closed_at: string | null;
  created_at: string;
  author_name: string | null;
  total_votes: number;
  eligible: number;
  options: PollOption[];
}

export interface PollPerson {
  employee_id: string;
  name: string;
  rank: string | null;
  avatar_url: string | null;
}

export interface PollVoter extends PollPerson {
  option_id: string;
  option_text: string;
  voted_at: string;
}

export interface PollDetail {
  poll: StaffPoll;
  voters: PollVoter[];
  not_voted: PollPerson[];
}

export interface PollInput {
  question: string;
  description: string;
  options: string[];
  expires_at: string | null;
}

export type ComplaintStatus = "pending" | "investigating" | "resolved";

export interface StaffComplaint {
  id: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  is_anonymous: boolean;
  employee_id: string | null;
  employee_name: string | null;
  employee_rank: string | null;
  employee_avatar: string | null;
  response: string | null;
  responder_name: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Thread {
  employee_id: string;
  name: string;
  rank: string | null;
  avatar_url: string | null;
  status: string;
  department: string | null;
  last_content: string;
  last_from_staff: boolean;
  last_at: string;
  unread: number;
}

export type SenderKind = "staff" | "employee";

export interface ChatMessage {
  id: string;
  content: string;
  sender_kind: SenderKind;
  sender_name: string | null;
  mine: boolean | null;
  created_at: string;
  read_at: string | null;
  /** Client-only: still being sent. */
  pending?: boolean;
}

export interface ThreadEmployee {
  id: string;
  name: string;
  rank: string | null;
  avatar_url: string | null;
  status: string;
  department: string | null;
}

export interface ThreadDetail {
  employee: ThreadEmployee;
  messages: ChatMessage[];
}

export interface DirectoryEntry {
  employee_id: string;
  name: string;
  rank: string | null;
  avatar_url: string | null;
  department: string | null;
  has_thread: boolean;
}

export type CelebrationKind = "birthday" | "anniversary" | "welcome";

export interface Occasion {
  employee_id: string;
  name: string;
  rank: string | null;
  avatar_url: string | null;
  department: string | null;
  kind: CelebrationKind;
  years: number;
  date: string;
  days_until: number;
  wishes: number;
  wished: boolean;
  /** Portal only. */
  is_me?: boolean;
}

export interface WishRow {
  id: string;
  kind: CelebrationKind;
  date?: string;
  message: string | null;
  created_at: string;
  to_name?: string;
  from_name: string | null;
  from_avatar?: string | null;
  from_staff?: boolean;
}

export interface StaffCelebrations {
  today: string;
  occasions: Occasion[];
  recent_wishes: WishRow[];
}

export interface ComingUpItem {
  date: string;
  kind: CelebrationKind | "holiday" | "event";
  title: string;
  detail: string;
  href: string;
}

export interface ComingUpWaiting {
  label: string;
  n: number;
  href: string;
}

export interface ComingUp {
  from: string;
  to: string;
  items: ComingUpItem[];
  waiting: ComingUpWaiting[];
}

/* ---------------------------------------------------------------- portal */

export interface PortalAnnouncement {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string | null;
  author_name: string | null;
  department_name: string | null;
}

export interface PortalPoll {
  id: string;
  question: string;
  description: string | null;
  status: PollStatus;
  expires_at: string | null;
  created_at: string;
  my_option_id: string | null;
  show_results: boolean;
  options: PollOption[];
}

export interface PortalComplaint {
  id: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  response: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PortalThread {
  topic: string | null;
  messages: ChatMessage[];
}

export interface PortalCounts {
  unread_messages: number;
  open_polls: number;
  celebrations_today: number;
}

export interface PortalCelebrations {
  today: string;
  company_name: string | null;
  share_birthday: boolean;
  has_birthday: boolean;
  occasions: Occasion[];
  received: WishRow[];
}

export interface WishResult {
  ok?: boolean;
  already?: boolean;
  error?: string;
}
