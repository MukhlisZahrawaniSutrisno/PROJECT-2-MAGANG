import type { Bootstrap } from "./types";

export function resolveMode(env: Record<string, string | undefined> = process.env): "demo" | "live" | "unconfigured" {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) return "live";
  if (url || key) return "unconfigured";
  if (env.DEMO_MODE === "true" || env.NODE_ENV === "development") return "demo";
  return "unconfigured";
}
export const EMPTY_BOOTSTRAP: Bootstrap = { mode: "live", user: null, data: null };
