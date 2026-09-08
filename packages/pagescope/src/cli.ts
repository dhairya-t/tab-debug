#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { parseIncident, generatePlaywright } from './replay.ts';

const [command, file, output] = process.argv.slice(2);
try {
  if (!file || !['inspect', 'test'].includes(command))
    throw new Error(
      'Usage: pagescope inspect incident.json | pagescope test incident.json regression.spec.ts',
    );
  if (statSync(file).size > 200_000) throw new Error('Incident exceeds 200KB');
  const incident = parseIncident(readFileSync(file, 'utf8'));
  if (command === 'inspect')
    console.log(
      JSON.stringify(
        {
          app: incident.appId,
          operations: incident.operations.length,
          completionOrder: incident.order,
          invariant: incident.rule.label,
        },
        null,
        2,
      ),
    );
  else {
    if (!output?.endsWith('.spec.ts'))
      throw new Error('Provide an output path ending in .spec.ts');
    writeFileSync(output, generatePlaywright(incident), { flag: 'wx' });
    console.log(
      `Wrote ${output}. This regression test should fail until the application is fixed.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
