/** The view the hash names. `unknown` is any other hash; the page reports it instead of showing a view. */
export type Route = "dashboard" | "waiting" | "unknown";

export function readRoute(hash: string): Route {
  if (hash === "" || hash === "#/") return "dashboard";
  if (hash === "#/waiting") return "waiting";
  return "unknown";
}
