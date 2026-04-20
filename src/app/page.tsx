import { listJobs } from '@/lib/db/jobs';
import { hashProfile } from '@/lib/profile/hash';
import { PROFILE_PATH } from '@/lib/profile/load';
import fs from 'node:fs';
import { Dashboard } from './Dashboard';

export const dynamic = 'force-dynamic';

export default function Home() {
  const jobs = listJobs();

  let currentProfileHash: string | null = null;
  if (fs.existsSync(PROFILE_PATH)) {
    const content = fs.readFileSync(PROFILE_PATH, 'utf-8');
    currentProfileHash = hashProfile(content);
  }

  return <Dashboard initialJobs={jobs} currentProfileHash={currentProfileHash} />;
}
