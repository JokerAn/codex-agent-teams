import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Print bounded diagnostics in retained CI logs; never turn a failed coverage job green.
const root = process.env.NODE_V8_COVERAGE;
if (!root || !existsSync(root)) {
  console.log('No V8 coverage directory was produced. Inspect the preceding coverage step exit and test counts.');
} else {
  const files = readdirSync(root).filter(file => file.endsWith('.json')).sort();
  let invalid = 0;
  for (const file of files) {
    const path = join(root, file), bytes = statSync(path).size;
    try { JSON.parse(readFileSync(path, 'utf8')); }
    catch (error) { invalid++; console.log(JSON.stringify({ file, bytes, error: error.message })); }
  }
  console.log(JSON.stringify({ files: files.length, invalid }));
}
