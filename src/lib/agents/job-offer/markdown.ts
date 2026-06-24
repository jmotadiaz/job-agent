import type { JobDetails } from "../scout/types";

export function detailsToMd(d: JobDetails): string {
  return [
    `- **Role:** ${d.role}`,
    `- **Company:** ${d.company}`,
    `- **Location:** ${d.location}`,
    `- **Remote:** ${d.remote}`,
    `- **Contract:** ${d.contract}`,
    `- **Experience required:** ${d.experience_required}`,
    `- **Role type:** ${d.role_type}`,
    `- **Primary tech (required):** ${d.primary_tech.join(", ") || "Not specified"}`,
    `- **Secondary tech (nice-to-have):** ${d.secondary_tech.join(", ") || "Not specified"}`,
    `- **Key responsibilities:** ${d.key_responsibilities.join("; ") || "Not specified"}`,
    `- **Salary:** ${d.salary}`,
    `- **Hard blockers:** ${d.hard_blockers.join("; ") || "None"}`,
  ].join("\n");
}
