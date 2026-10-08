/* TEMPORARY visual-QA mock. Remove before commit. Active only on the Vite dev server when sessionStorage["careers-mock"] === "1". */
import type { Application, ApplicationNote, JobWithCounts, PublicCareers, PublicCompany, PublicJobDetail } from "./model";

export const careersMock = (): boolean => {
  // import.meta.env.DEV alone is true in `vite build --mode development` (npm run build:dev), so a
  // deployed dev-mode build would honour the switch. import.meta.hot exists only on the dev server.
  if (!import.meta.env.DEV || !import.meta.hot) return false;
  try {
    return sessionStorage.getItem("careers-mock") === "1";
  } catch {
    return false;
  }
};

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const ahead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const base = { company_id: "c", updated_at: day(1) };
export const mockJobs: JobWithCounts[] = [
  { ...base, id: "j1", slug: "senior-frontend-engineer", title: "Senior Frontend Engineer", department_id: "d1", department: "Engineering", location: "Lahore", employment_type: "full_time", workplace: "hybrid", openings: 2, summary: "Own the product UI end to end with a small, senior team.", description: "You will build the HR product our customers use every day.\n\nYou work with design and backend on every feature.", requirements: "5+ years with React and TypeScript\nStrong CSS and accessibility\nClear written English", status: "open", closes_on: ahead(21), created_at: day(12), total: 9, fresh: 3, active: 7, hired: 1 },
  { ...base, id: "j2", slug: "hr-business-partner", title: "HR Business Partner", department_id: "d2", department: "People", location: "Karachi", employment_type: "full_time", workplace: "onsite", openings: 1, summary: "Partner with managers on hiring, performance and culture.", description: "A people-first generalist role.", requirements: "3+ years in HR\nKnowledge of Pakistani labour law", status: "open", closes_on: null, created_at: day(5), total: 4, fresh: 1, active: 4, hired: 0 },
  { ...base, id: "j3", slug: "finance-intern", title: "Finance Intern", department_id: "d3", department: "Finance", location: "Remote", employment_type: "internship", workplace: "remote", openings: 3, summary: "", description: "", requirements: "", status: "open", closes_on: ahead(-3), created_at: day(40), total: 2, fresh: 0, active: 1, hired: 0 },
  { ...base, id: "j4", slug: "office-administrator", title: "Office Administrator", department_id: null, department: null, location: "", employment_type: "contract", workplace: "onsite", openings: 1, summary: "", description: "", requirements: "", status: "closed", closes_on: null, created_at: day(90), total: 0, fresh: 0, active: 0, hired: 0 },
];

const people: [string, string, Application["status"], number | null, string][] = [
  ["Ayesha Khan", "j1", "new", null, "ayesha.khan@example.com"],
  ["Bilal Ahmed", "j1", "new", 3, "bilal.ahmed@example.com"],
  ["Sara Malik", "j1", "reviewed", 4, "sara.malik@example.com"],
  ["Hamza Raza", "j1", "shortlisted", 5, "hamza.raza.long.email.address@example.com"],
  ["Fatima Noor", "j1", "interview", 4, "fatima@example.com"],
  ["Usman Tariq", "j1", "offered", 5, "usman@example.com"],
  ["Zainab Ali", "j1", "hired", 5, "zainab@example.com"],
  ["Omar Farooq", "j1", "rejected", 2, "omar@example.com"],
  ["Hira Siddiqui", "j1", "new", null, "hira@example.com"],
  ["Ali Hassan", "j2", "new", null, "ali.hassan@example.com"],
  ["Mariam Javed", "j2", "interview", 4, "mariam@example.com"],
  ["Kashif Iqbal", "j2", "shortlisted", 3, "kashif@example.com"],
  ["Nadia Akhtar", "j2", "reviewed", null, "nadia@example.com"],
  ["Imran Sheikh", "j3", "reviewed", 3, "imran@example.com"],
  ["Rabia Yousaf", "j3", "rejected", 1, "rabia@example.com"],
];

export const mockApplications: Application[] = people.map(([name, jobId, status, rating, email], i) => {
  const job = mockJobs.find((j) => j.id === jobId)!;
  return {
    id: `a${i + 1}`,
    company_id: "c",
    job_id: jobId,
    name,
    email,
    phone: i % 4 === 0 ? "" : "+92 300 1234567",
    link: i % 3 === 0 ? "https://www.linkedin.com/in/someone-with-a-long-profile-handle" : "",
    cover_letter: i % 2 === 0 ? "I have shipped two design systems and would love to bring that to your team.\nAvailable in four weeks." : "",
    cv_path: i % 5 === 4 ? null : `c/${i}.pdf`,
    cv_name: i % 5 === 4 ? null : `${name.replace(/\s/g, "_")}_CV_2026.pdf`,
    cv_size: 245_000 + i * 9000,
    status,
    rating,
    employee_id: status === "hired" ? "e1" : null,
    status_changed_at: day(i % 6),
    created_at: day(i * 1.3 + 0.2),
    job: { id: job.id, title: job.title, slug: job.slug, department_id: job.department_id },
  };
});

export const mockNotes = (applicationId: string): ApplicationNote[] => [
  { id: "n1", application_id: applicationId, author_id: null, author_name: "Adil Munawar", kind: "note", body: "Strong portfolio. Ask about notice period.", created_at: day(0.3) },
  { id: "n2", application_id: applicationId, author_id: null, author_name: "Adil Munawar", kind: "status", body: "Moved from Reviewed to Shortlisted", created_at: day(1) },
];

const company: PublicCompany = { name: "Nexus Orbits", slug: "nexus-orbits", logo: null, website: "nexusorbits.com" };

export const mockPublicCareers = (): PublicCareers => ({
  ...company,
  jobs: mockJobs
    .filter((j) => j.status === "open")
    .map(({ id, slug, title, department, location, employment_type, workplace, openings, summary, closes_on, created_at }) => ({
      id, slug, title, department, location, employment_type, workplace, openings, summary, closes_on, created_at,
    })),
});

export const mockPublicJob = (jobSlug: string): { company: PublicCompany; job: PublicJobDetail } | null => {
  const j = mockJobs.find((x) => x.slug === jobSlug);
  if (!j) return null;
  return {
    company,
    job: {
      id: j.id, slug: j.slug, title: j.title, department: j.department, location: j.location, employment_type: j.employment_type,
      workplace: j.workplace, openings: j.openings, summary: j.summary, closes_on: j.closes_on, created_at: j.created_at,
      description: j.description, requirements: j.requirements, is_open: j.status === "open",
    },
  };
};
