import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canMoveDriveEntry } from '../../web/src/features/drive/data/drive-directories.ts'
import type {
  DriveEntry,
  DriveTreeNode,
} from '../../web/src/features/drive/types.ts'

const entry: DriveEntry = {
  id: 'source',
  parentId: 'root',
  name: 'Synthetic folder',
  kind: 'folder',
  connectionId: 'synthetic-connection',
  size: '—',
  updatedAt: '—',
}
const root: DriveTreeNode = {
  id: 'root',
  name: 'Synthetic Drive',
  kind: 'folder',
  hasChildren: true,
  children: [
    {
      id: 'source',
      name: entry.name,
      kind: 'folder',
      hasChildren: true,
      children: [
        { id: 'child', name: 'Child', kind: 'folder', hasChildren: false },
      ],
    },
    { id: 'target', name: 'Target', kind: 'folder', hasChildren: false },
    { id: 'file', name: 'File', kind: 'file', hasChildren: false },
  ],
}

test('Drive 移动只接受同连接的其他目录，拒绝同目录、根移动、自身和子孙', () => {
  assert.equal(
    canMoveDriveEntry(entry, 'target', root, entry.connectionId!),
    true,
  )
  for (const parent of ['root', 'source', 'child', 'file', 'unknown'])
    assert.equal(
      canMoveDriveEntry(entry, parent, root, entry.connectionId!),
      false,
    )
  assert.equal(
    canMoveDriveEntry(entry, 'target', root, 'another-connection'),
    false,
  )
  assert.equal(
    canMoveDriveEntry(
      { ...entry, id: 'root' },
      'target',
      root,
      entry.connectionId!,
    ),
    false,
  )
  assert.equal(
    canMoveDriveEntry(
      { ...entry, kind: 'file', parentId: 'source' },
      'root',
      root,
      entry.connectionId!,
    ),
    true,
  )
})
