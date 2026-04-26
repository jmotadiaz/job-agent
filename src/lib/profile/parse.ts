import matter from "gray-matter";

export interface SearchConfig {
  queries: string[];
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
    throw new Error('profile.md must contain a frontmatter "search" key with at least a "queries" field');
  }

  let queries: string[];
  if (Array.isArray(s.queries) && s.queries.length > 0) {
    queries = (s.queries as unknown[]).filter((q): q is string => typeof q === "string" && q.trim() !== "");
    if (queries.length === 0) {
      throw new Error('frontmatter "search.queries" must contain at least one non-empty string');
    }
  } else if (s.query && typeof s.query === "string") {
    queries = [s.query];
  } else {
    throw new Error('frontmatter "search" must contain a non-empty "queries" list');
  }

  return {
    search: {
      queries,
      location: s.location ?? undefined,
      remote: typeof s.remote === "boolean" ? s.remote : undefined,
      experience_level: s.experience_level ?? undefined,
      job_type: s.job_type ?? undefined,
    },
    linkedinProfile: typeof data.linkedinProfile === "string" ? data.linkedinProfile : undefined,
    rawContent: body.trim(),
  };
}
