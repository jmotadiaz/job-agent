import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { getGenerationById } from '@/lib/db/generations';
import { log } from '@/lib/log';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  log.info('api/generations/cover', 'begin', { id });
  const generation = getGenerationById(id);
  if (!generation) {
    log.warn('api/generations/cover', 'not found', { id });
    return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
  }
  if (!fs.existsSync(generation.cover_path)) {
    log.warn('api/generations/cover', 'file missing on disk', { id, path: generation.cover_path });
    return NextResponse.json({ error: 'Cover letter file not found on disk' }, { status: 404 });
  }
  const buffer = fs.readFileSync(generation.cover_path);
  log.info('api/generations/cover', 'end', { id, bytes: buffer.length });
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="cover-${id}.pdf"`,
    },
  });
}
