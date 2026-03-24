import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeStreamText, upsertToolStep } from './streaming.js';

test('mergeStreamText appends incremental tokens', () => {
  assert.equal(mergeStreamText('你好', '，世界'), '你好，世界');
});

test('mergeStreamText prefers full snapshot over duplicated append', () => {
  assert.equal(mergeStreamText('我来帮您', '我来帮您探索数据库结构'), '我来帮您探索数据库结构');
});

test('upsertToolStep updates existing tool step instead of duplicating', () => {
  const initial = [{ id: '1', name: 'list_tables_tool', status: 'running' }];
  const next = upsertToolStep(initial, { id: '1', output: 'done', status: 'done' });

  assert.equal(next.length, 1);
  assert.equal(next[0].name, 'list_tables_tool');
  assert.equal(next[0].output, 'done');
  assert.equal(next[0].status, 'done');
});
