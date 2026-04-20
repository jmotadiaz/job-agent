export interface SearchConfig {
  query: string;
  location?: string;
  remote?: boolean;
  experience_level?: string;
  job_type?: string;
}

export interface ParsedProfile {
  search: SearchConfig;
  rawContent: string;
}

export function parseProfile(content: string): ParsedProfile {
  const searchMatch = content.match(/## search\s+([\s\S]*?)(?=\n##|\n*$)/i);
  if (!searchMatch) {
    throw new Error('profile.md must contain a ## search section with at least a "query:" field');
  }

  const section = searchMatch[1];
  const get = (key: string): string | undefined => {
    const m = section.match(new RegExp(`^${key}:\\s*["']?([^"'\n]+)["']?`, 'm'));
    return m?.[1]?.trim();
  };

  const query = get('query');
  if (!query) throw new Error('## search section must define a "query:" field');

  const remoteRaw = get('remote');

  return {
    search: {
      query,
      location: get('location'),
      remote: remoteRaw === 'true' ? true : remoteRaw === 'false' ? false : undefined,
      experience_level: get('experience_level'),
      job_type: get('job_type'),
    },
    rawContent: content,
  };
}
