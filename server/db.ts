import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentEvent, Blueprint, Claim, EvidenceItem, Idea, JudgeSession, Job, Opportunity, Source, SponsorProfile, Workspace,
} from '../shared/types';

export interface KindMap {
  workspace: Workspace;
  source: Source;
  sponsor: SponsorProfile;
  opportunity: Opportunity;
  idea: Idea;
  claim: Claim;
  evidence: EvidenceItem;
  event: AgentEvent;
  job: Job;
  judge: JudgeSession;
  blueprint: Blueprint;
}
export type Kind = keyof KindMap;

/**
 * Small document store on SQLite: one table, JSON payloads, insertion-ordered.
 * Entities are always scoped to a workspace so deletion cascades by a single query.
 */
export class Store {
  private db: Database.Database;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(kind, id)
      );
      CREATE INDEX IF NOT EXISTS idx_entities_ws ON entities(workspace_id, kind);
    `);
  }

  put<K extends Kind>(kind: K, workspaceId: string, id: string, value: KindMap[K]): KindMap[K] {
    this.db
      .prepare(
        `INSERT INTO entities (kind, id, workspace_id, data, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(kind, id, workspaceId, JSON.stringify(value), new Date().toISOString());
    return value;
  }

  get<K extends Kind>(kind: K, id: string): KindMap[K] | null {
    const row = this.db.prepare('SELECT data FROM entities WHERE kind = ? AND id = ?').get(kind, id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as KindMap[K]) : null;
  }

  list<K extends Kind>(kind: K, workspaceId: string, opts: { limit?: number; newestFirst?: boolean } = {}): KindMap[K][] {
    const order = opts.newestFirst ? 'DESC' : 'ASC';
    const limit = opts.limit ? `LIMIT ${Math.floor(opts.limit)}` : '';
    const rows = this.db
      .prepare(`SELECT data FROM entities WHERE kind = ? AND workspace_id = ? ORDER BY seq ${order} ${limit}`)
      .all(kind, workspaceId) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as KindMap[K]);
  }

  listAll<K extends Kind>(kind: K): KindMap[K][] {
    const rows = this.db.prepare('SELECT data FROM entities WHERE kind = ? ORDER BY seq DESC').all(kind) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as KindMap[K]);
  }

  count(kind: Kind, workspaceId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM entities WHERE kind = ? AND workspace_id = ?').get(kind, workspaceId) as { n: number };
    return row.n;
  }

  delete(kind: Kind, id: string): void {
    this.db.prepare('DELETE FROM entities WHERE kind = ? AND id = ?').run(kind, id);
  }

  deleteKind(kind: Kind, workspaceId: string): void {
    this.db.prepare('DELETE FROM entities WHERE kind = ? AND workspace_id = ?').run(kind, workspaceId);
  }

  deleteWorkspace(workspaceId: string): void {
    this.db.prepare('DELETE FROM entities WHERE workspace_id = ?').run(workspaceId);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}
