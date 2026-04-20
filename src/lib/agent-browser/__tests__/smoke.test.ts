import { describe, it, expect } from 'vitest';
import { openUrl, waitLoad, snapshot, closeBrowser, resetBrowserState } from '../exec';

// Integration smoke test — requires agent-browser installed and a display.
// Run manually: npx vitest run src/lib/agent-browser/__tests__/smoke.test.ts
describe.skip('agent-browser smoke test', () => {
  it('opens a URL, takes snapshot, parses correctly', async () => {
    resetBrowserState();
    try {
      await openUrl('https://example.com');
      await waitLoad();
      const result = await snapshot({ interactive: true });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    } finally {
      await closeBrowser();
    }
  });
});
