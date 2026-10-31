import { describe, expect, it } from 'vitest';
import { Store } from '../server/db';
import type { Source } from '../shared/types';

const src = (id: string, ws: string): Source => ({ id, workspaceId: ws, url: `https://x/${id}`, title: id, kind: 'web', provider: 'fetch', snippet: '', content: '', fetchedAt: '' });

describe('Store', () => {
  it('keeps insertion order across updates, scopes by workspace and cascades deletes', () => {
    const s = new Store(':memory:');
    s.put('source', 'w1', 'a', src('a', 'w1'));
    s.put('source', 'w1', 'b', src('b', 'w1'));
    s.put('source', 'w2', 'c', src('c', 'w2'));
    s.put('source', 'w1', 'a', { ...src('a', 'w1'), title: 'changed' });
    expect(s.list('source', 'w1').map((x) => x.id)).toEqual(['a', 'b']);
    expect(s.get('source', 'a')!.title).toBe('changed');
    expect(s.count('source', 'w1')).toBe(2);
    s.deleteWorkspace('w1');
    expect(s.list('source', 'w1')).toEqual([]);
    expect(s.list('source', 'w2')).toHaveLength(1);
    s.close();
  });
});
