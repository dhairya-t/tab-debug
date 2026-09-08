import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = join(homedir(), '.agent-browser/browsers');
  if (!existsSync(root)) return undefined;
  return readdirSync(root)
    .filter((p) => p.startsWith('chrome-'))
    .sort()
    .reverse()
    .map((p) =>
      join(
        root,
        p,
        'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      ),
    )
    .find(existsSync);
}
