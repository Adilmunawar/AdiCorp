import type { CelebrationKind, Occasion } from "./types";

export const KIND_EMOJI: Record<CelebrationKind, string> = { birthday: "🎂", anniversary: "🎉", welcome: "👋" };

/** How the occasion reads to colleagues: "Birthday", "3 years with us", "First day". */
export function occasionLabel(o: Pick<Occasion, "kind" | "years">): string {
  if (o.kind === "birthday") return "Birthday";
  if (o.kind === "anniversary") return `${o.years} ${o.years === 1 ? "year" : "years"} with us`;
  return "First day";
}

export function wishVerb(kind: CelebrationKind): string {
  return kind === "birthday" ? "Wish a happy birthday" : kind === "anniversary" ? "Congratulate" : "Say welcome";
}

/** "Today", "Tomorrow", "In 3 days". */
export function whenLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

/** The greeting for the person whose day it is. */
export function greeting(o: Pick<Occasion, "kind" | "years" | "name">, companyName: string | null | undefined): { title: string; body: string; emoji: string } {
  const first = (o.name ?? "").trim().split(/\s+/)[0] || "there";
  const company = companyName?.trim() || "the team";
  if (o.kind === "birthday") return { emoji: "🎂", title: `Happy birthday, ${first}!`, body: `Everyone at ${company} wishes you a wonderful year ahead.` };
  if (o.kind === "anniversary")
    return {
      emoji: "🎉",
      title: `Happy work anniversary, ${first}!`,
      body: `${o.years} ${o.years === 1 ? "year" : "years"} at ${company} today. Thank you for all you do.`,
    };
  return { emoji: "👋", title: `Welcome to ${company}, ${first}!`, body: "Today is your first day. We are glad you are here." };
}

/** Wish ideas offered as one-tap chips. */
export const WISH_SUGGESTIONS: Record<CelebrationKind, string[]> = {
  birthday: ["Happy birthday! Have a great day.", "Wishing you a wonderful year ahead!", "Many happy returns of the day!"],
  anniversary: ["Congratulations on the milestone!", "Thank you for everything you do!", "Here's to many more years together!"],
  welcome: ["Welcome aboard!", "Great to have you with us!", "Glad you joined the team!"],
};
