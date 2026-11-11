import type { z } from "zod";

function describeIssue(issue: z.core.$ZodIssue): string {
  if (issue.path.length === 0) return issue.message;
  return `${issue.path.join(".")}: ${issue.message}`;
}

/** Each issue as `path: message`, or the message alone for the value itself, joined by `; `. */
export function issueMessage(issues: readonly z.core.$ZodIssue[]): string {
  return issues.map(describeIssue).join("; ");
}
