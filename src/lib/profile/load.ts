import fs from 'node:fs';
import path from 'node:path';
import { PROFILE_PATH } from '@/lib/runtime/paths';

export function loadProfile(): string {
  if (!fs.existsSync(PROFILE_PATH)) {
    throw new Error(`profile.md not found at ${PROFILE_PATH}. Copy profile.md.example to profile.md and fill it in.`);
  }
  return fs.readFileSync(PROFILE_PATH, 'utf-8');
}

export { PROFILE_PATH };
