import matter from "gray-matter";

export interface SearchConfig {
  queries: string[];
  locations: string[];
  remote?: boolean;
  experience_level?: string;
  job_type?: string;
}

export interface ProfileInfo {
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  website?: string | null;
}

export interface ParsedProfile {
  search: SearchConfig;
  profile: ProfileInfo;
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

  // Handle legacy linkedinProfile
  if (data.linkedinProfile && !data.profile?.linkedinUrl) {
    console.warn('WARNING: "linkedinProfile" at the root of frontmatter is deprecated. Move it to "profile.linkedinUrl".');
  }

  const p = data.profile;
  if (!p || typeof p !== "object") {
    throw new Error('profile.md must contain a frontmatter "profile" section with personal details');
  }

  const requiredFields: (keyof ProfileInfo)[] = ["name", "role", "email", "phone", "location", "linkedinUrl"];
  for (const field of requiredFields) {
    if (!p[field] && field === "linkedinUrl" && data.linkedinProfile) {
      p[field] = data.linkedinProfile; // Fallback for transition
    }
    if (!p[field]) {
      throw new Error(`frontmatter "profile" is missing required field: "${field}"`);
    }
  }

  let locations: string[] = [];
  if (Array.isArray(s.location)) {
    locations = (s.location as unknown[]).filter((l): l is string => typeof l === "string" && l.trim() !== "");
  } else if (typeof s.location === "string" && s.location.trim()) {
    locations = [s.location];
  }

  return {
    search: {
      queries,
      locations,
      remote: typeof s.remote === "boolean" ? s.remote : undefined,
      experience_level: s.experience_level ?? undefined,
      job_type: s.job_type ?? undefined,
    },
    profile: {
      name: p.name,
      role: p.role,
      email: p.email,
      phone: p.phone,
      location: p.location,
      linkedinUrl: p.linkedinUrl,
      website: p.website ?? null,
    },
    rawContent: body.trim(),
  };
}
