import * as SQLite from 'expo-sqlite';
import type { Persistence } from '../../packages/core/store';
let database: Promise<SQLite.SQLiteDatabase> | undefined;
async function open() {
  return (database ??= (async () => {
    const db = await SQLite.openDatabaseAsync('training.db');
    await db.execAsync(
      'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (scope TEXT PRIMARY KEY, body TEXT NOT NULL)',
    );
    return db;
  })());
}
export const persistence: Persistence = {
  async load(scope) {
    const db = await open();
    const row = await db.getFirstAsync<{ body: string }>(
      'SELECT body FROM state WHERE scope=?',
      scope,
    );
    return row ? JSON.parse(row.body) : undefined;
  },
  async save(state) {
    const db = await open();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'INSERT INTO state(scope,body) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET body=excluded.body',
        state.scope,
        JSON.stringify(state),
      );
    });
  },
};
