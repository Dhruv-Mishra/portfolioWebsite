import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowDirectory = path.join(process.cwd(), '..', '.github', 'workflows');
const actionDirectory = path.join(process.cwd(), '..', '.github', 'actions');

function yamlFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => path.join(directory, name));
}

describe('workflow supply-chain hardening', () => {
  it('pins every third-party action to a full commit SHA', () => {
    for (const file of [...yamlFiles(workflowDirectory), ...yamlFiles(actionDirectory)]) {
      const source = fs.readFileSync(file, 'utf8');
      for (const [, reference] of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
        if (reference.startsWith('./')) continue;
        expect(reference.split('@')[1], `${path.basename(file)}: ${reference}`).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });
});
