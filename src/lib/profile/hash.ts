import crypto from 'node:crypto';

export function hashProfile(content: string): string {
  return crypto.createHash('sha1').update(content, 'utf-8').digest('hex');
}
