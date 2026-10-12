import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { getDriveUploadDirectoryPathList } from '../../web/src/features/drive/data/drive-upload-path.ts'
import { driveUploadDraftDto } from '../../../packages/assets/src/dto/drive/drive-upload-dto.ts'

const getFile = (name: string, path: string) => {
  const file = new File([], name)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}
test('多文件直接上传到当前目录；文件夹选择保留选中根目录和全部子路径', () => {
  assert.deepEqual(getDriveUploadDirectoryPathList(getFile('a.txt', '')), [])
  assert.deepEqual(
    getDriveUploadDirectoryPathList(getFile('a.txt', '项目/资料/a.txt')),
    ['项目', '资料'],
  )
  assert.deepEqual(
    getDriveUploadDirectoryPathList(getFile('a.txt', '项目/另一目录/a.txt')),
    ['项目', '另一目录'],
  )
})
test('前端拒绝绝对路径、上级路径、非法分隔符及与文件不一致的相对路径', () => {
  for (const path of [
    '/root/a.txt',
    '../a.txt',
    'root/../a.txt',
    'root//a.txt',
    'root\\other/a.txt',
    'root/b.txt',
    'root/\u0000/a.txt',
    'root/\u0085/a.txt',
  ])
    assert.throws(
      () => getDriveUploadDirectoryPathList(getFile('a.txt', path)),
      /invalid upload path/,
    )
})
test('后端目录路径名称逐级校验，旧请求默认空路径且不限制整文件大小', () => {
  const draft = {
    id: randomUUID(),
    parent: 'root',
    name: 'a.txt',
    size: 3 * 1024 ** 4,
  }
  assert.deepEqual(driveUploadDraftDto.parse(draft).directoryPath, [])
  assert.deepEqual(
    driveUploadDraftDto.parse({ ...draft, directoryPath: ['项目', '资料'] })
      .directoryPath,
    ['项目', '资料'],
  )
  for (const name of ['..', '.', '', 'a/b', 'a\\b', '\0', 'x'.repeat(256)])
    assert.equal(
      driveUploadDraftDto.safeParse({ ...draft, directoryPath: [name] })
        .success,
      false,
    )
})
