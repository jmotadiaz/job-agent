import { z } from 'zod';

export const JobCardSchema = z.object({
  external_id: z.string(),
  url: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  snippet: z.string(),
});

export const JobDetailsSchema = z.object({
  role: z.string(),
  company: z.string(),
  location: z.string(),
  remote: z.string(),
  contract: z.string(),
  experience_required: z.string(),
  role_type: z.string(),
  primary_tech: z.array(z.string()),
  secondary_tech: z.array(z.string()),
  key_responsibilities: z.array(z.string()),
  salary: z.string(),
  hard_blockers: z.array(z.string()),
});

export const JobSummarySchema = z.object({
  external_id: z.string(),
  url: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  details: JobDetailsSchema,
  raw_len: z.number(),
});

export const ScoutResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('match'),
    job: z.object({
      id: z.string(),
      external_id: z.string(),
      url: z.string(),
      title: z.string(),
      company: z.string(),
      location: z.string(),
      description_md: z.string(),
      match_score: z.number(),
      match_reason: z.string(),
      status: z.literal('shortlisted'),
      fetched_at: z.number(),
    }),
  }),
  z.object({
    kind: z.literal('no_match'),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal('error'),
    stage: z.string(),
    message: z.string(),
  }),
]);

export type JobCard = z.infer<typeof JobCardSchema>;
export type JobDetails = z.infer<typeof JobDetailsSchema>;
export type JobSummary = z.infer<typeof JobSummarySchema>;
export type ScoutResult = z.infer<typeof ScoutResultSchema>;

export interface ScoutRunContext {
  search: import("@/lib/profile/parse").SearchConfig;
  lastSummary: JobSummary | null;
  lastRawText: string | null;
  candidateCount: number;
  noMatchCalled: boolean;
  saveMatchCalled: boolean;
  matchResult: { score: number; reason: string } | null;
}
