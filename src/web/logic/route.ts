/** The view the hash names. `unknown` covers every other hash, which the page names rather than mapping to a view. */
export type Route = "dashboard" | "waiting" | "unknown";

export function readRoute(hash: string): Route {
  if (hash === "" || hash === "#/") return "dashboard";
  if (hash === "#/waiting") return "waiting";
  return "unknown";
}
