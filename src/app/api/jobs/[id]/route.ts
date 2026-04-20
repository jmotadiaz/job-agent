import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getJobById, updateJobStatus } from '@/lib/db/jobs';
import { listGenerationsForJob } from '@/lib/db/generations';
import { log } from '@/lib/log';

const BodySchema = z.object({
  status: z.enum(['new', 'shortlisted', 'applied', 'discarded']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const start = Date.now();
  log.info('api/jobs/[id]', 'begin', { method: 'PATCH', id });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    log.warn('api/jobs/[id]', 'rejected: invalid json', { id });
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    log.warn('api/jobs/[id]', 'rejected: validation', { id, issues: parsed.error.issues });
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const job = getJobById(id);
  if (!job) {
    log.warn('api/jobs/[id]', 'not found', { id });
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  updateJobStatus(id, parsed.data.status);
  log.info('api/jobs/[id]', 'end', { id, status: parsed.data.status, duration: Date.now() - start });
  return NextResponse.json({ ok: true, id, status: parsed.data.status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = getJobById(id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  const generations = listGenerationsForJob(id);
  return NextResponse.json({ job, generations });
}
