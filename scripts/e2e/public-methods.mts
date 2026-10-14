/**
 * Public `resource.method` names of an SDK, read from its API lock
 * (`etc/<sdk>-client.d.ts.snapshot`): the client interface's resources, then
 * each resource class's non-private methods. Same parsing as the request
 * check (`scripts/probe/requests/run.mts`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function publicMethods(snapshotFile: string, clientInterface: string): string[] {
  const lines = readFileSync(join(ROOT, snapshotFile), 'utf8').split(/\r?\n/);
  const block = (header: RegExp): string[] => {
    const start = lines.findIndex((l) => header.test(l));
    if (start < 0) return [];
    const end = lines.findIndex((l, i) => i > start && l === '}');
    return lines.slice(start + 1, end);
  };
  const out: string[] = [];
  for (const line of block(new RegExp(`^interface ${clientInterface} \\{`))) {
    const m = /^ {4}(\w+): (\w+);/.exec(line);
    if (!m) continue;
    for (const member of block(new RegExp(`^declare class ${m[2]} \\{`))) {
      const method = /^ {4}(?!private |constructor|static |readonly )(\w+)(?:<[^(]*>)?\(/.exec(
        member,
      );
      if (method) out.push(`${m[1]}.${method[1]}`);
    }
  }
  return [...new Set(out)].sort();
}
