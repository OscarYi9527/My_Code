import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const DB_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DB_DIR, 'app.db');

let dbInstance: unknown = null;

export function getDb(): unknown {
  if (!dbInstance) {
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
    }
    // SQLite initialization deferred until better-sqlite3 is in VSCode's dependency tree
    // VSCode uses its own native modules; we use the shared node_modules
    dbInstance = { path: DB_PATH };
  }
  return dbInstance;
}
