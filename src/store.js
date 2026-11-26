import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function dataPath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

export function readStore(name, fallback) {
  ensureDataDir();
  const file = dataPath(name);
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8');
      return structuredClone(fallback);
    }
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8');
      return structuredClone(fallback);
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[alln-utils] lecture ${name}.json échouée: ${err.message}`);
    return structuredClone(fallback);
  }
}

export function writeStore(name, value) {
  ensureDataDir();
  const file = dataPath(name);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return value;
}

export function updateStore(name, fallback, mutator) {
  const current = readStore(name, fallback);
  const next = mutator(current) ?? current;
  writeStore(name, next);
  return next;
}

export { DATA_DIR };
