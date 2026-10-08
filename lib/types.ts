export type Role = "employee" | "admin";
export type Category = "IT & tools" | "Fasilitas" | "Keuangan" | "People Ops";
export const CATEGORIES: Category[] = ["IT & tools", "Fasilitas", "Keuangan", "People Ops"];
export interface Employee {
  id: string; name: string; department: string; email: string; chatUrl: string;
  color: string; isActive: boolean;
}
export interface ProblemLink { id: string; kind: "sop" | "form" | "ticket"; label: string; url: string }
export interface Problem {
  id: string; title: string; description: string; category: Category;
  keywords: string[]; primaryPicId: string; backupPicId: string;
  responseSlaMinutes: number; resolutionSlaMinutes: number;
  links: ProblemLink[]; isActive: boolean;
}
export interface Unavailability {
  id: string; employeeId: string; kind: "leave" | "unavailable";
  startsAt: string; endsAt: string; cancelledAt: string | null;
}
export interface SearchResult {
  problem: Problem; primaryPic: Employee; backupPic: Employee;
  effectivePic: Employee | null; primaryAvailable: boolean; backupAvailable: boolean;
  routingStatus: "primary" | "backup" | "unavailable";
  matchScore: number; matchMethod: "exact" | "phrase" | "fuzzy";
}
export interface SearchLog {
  id: string; query: string; normalizedQuery: string; searchedAt: string;
  outcome: "matched" | "unmatched" | "error"; durationMs: number;
  unmatchedQueryId: string | null; results: SearchResult[];
}
export interface UnmatchedQuery {
  id: string; normalizedQuery: string; status: "open" | "resolved" | "ignored";
  note: string; resolvedProblemId: string | null; createdAt: string; closedAt: string | null;
}
export interface AppData {
  schemaVersion: 1; employees: Employee[]; problems: Problem[];
  unavailability: Unavailability[]; searchLogs: SearchLog[]; unmatchedQueries: UnmatchedQuery[];
}
export type AdminCommand =
  | { type: "saveProblem"; problem: Problem }
  | { type: "saveEmployee"; employee: Employee }
  | { type: "saveAvailability"; availability: Unavailability }
  | { type: "saveUnmatched"; unmatched: UnmatchedQuery };
export interface CurrentUser { id: string; name: string; email: string; role: Role }
export interface Bootstrap { mode: "demo" | "live"; user: CurrentUser | null; data: AppData | null }
