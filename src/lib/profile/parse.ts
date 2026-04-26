import matter from "gray-matter";

export interface SearchConfig {
  query: string;
  location?: string;
  remote?: boolean;
  experience_level?: string;
  job_type?: string;
}

export interface ParsedProfile {
  search: SearchConfig;
  linkedinProfile?: string;
  rawContent: string;
}

export function parseProfile(content: string): ParsedProfile {
  const { data, content: body } = matter(content);

  const s = data.search;
  if (!s || typeof s !== "object") {
    throw new Error('profile.md must contain a frontmatter "search" key with at least a "query" field');
  }
  if (!s.query || typeof s.query !== "string") {
    throw new Error('frontmatter "search.query" must be a non-empty string');
  }

  return {
    search: {
      query: s.query,
      location: s.location ?? undefined,
      remote: typeof s.remote === "boolean" ? s.remote : undefined,
      experience_level: s.experience_level ?? undefined,
      job_type: s.job_type ?? undefined,
    },
    linkedinProfile: typeof data.linkedinProfile === "string" ? data.linkedinProfile : undefined,
    rawContent: body.trim(),
  };
}
