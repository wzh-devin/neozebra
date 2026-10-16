import { useI18n } from '@/lib/i18n'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { VaultTreeNode } from './VaultTreeNode'
import type { TreeProps } from './VaultTreeNode'
import styles from './VaultTree.module.css'

/**
 * 组合原文件树组件、独立滚动区和固定底部回收站，保留方向键焦点导航。
 *
 * @param props - 路径、选择器模式和文件库操作回调
 * @returns 文件树及底部回收站 JSX
 */
const VaultTree = (props: TreeProps) => {
  const { t } = useI18n()

  // 导航时展开完整路径，当前目录也需要显示其子项。
  const pathKey = props.path.map((entry) => entry.id).join('/')
  const [treeState, setTreeState] = useState({
    pathKey,
    expandedSet: new Set<string>(['0', ...props.path.map((entry) => entry.id)]),
  })
  if (treeState.pathKey !== pathKey)
    setTreeState({
      pathKey,
      expandedSet: new Set([
        ...treeState.expandedSet,
        ...props.path.map((entry) => entry.id),
        '0',
      ]),
    })
  const expandedSet = treeState.expandedSet
  const [focusId, setFocusId] = useState('0')
  const toggleHandler = (id: string, expanded: boolean) =>
    setTreeState((current) => {
      const next = new Set(current.expandedSet)
      if (expanded) next.add(id)
      else next.delete(id)
      return { ...current, expandedSet: next }
    })
  const keyboardHandler = (event: KeyboardEvent<HTMLDivElement>) => {
    const node = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-tree-node]',
    )
    if (!node) return
    const nodes = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[data-tree-node]'),
    ]
    const index = nodes.indexOf(node)
    const id = node.dataset.treeNode!
    let target: HTMLElement | undefined
    if (event.key === 'ArrowDown') target = nodes[index + 1]
    else if (event.key === 'ArrowUp') target = nodes[index - 1]
    else if (event.key === 'Home') target = nodes[0]
    else if (event.key === 'End') target = nodes.at(-1)
    else if (event.key === 'ArrowRight' && node.dataset.kind === 'folder') {
      if (!expandedSet.has(id)) toggleHandler(id, true)
      else if (nodes[index + 1]?.dataset.parent === id)
        target = nodes[index + 1]
    } else if (event.key === 'ArrowLeft') {
      if (expandedSet.has(id)) toggleHandler(id, false)
      else
        target = nodes.find(
          (item) => item.dataset.treeNode === node.dataset.parent,
        )
    } else return
    event.preventDefault()
    if (target) {
      setFocusId(target.dataset.treeNode!)
      target.focus()
    }
  }
  return (
    <div className={styles.tree} onKeyDown={keyboardHandler}>
      <div className={styles.label}>{t('目录')}</div>
      <ScrollArea className={styles['tree-scroll']}>
        <div
          className={styles['tree-list']}
          role="tree"
          aria-label={
            props.foldersOnly ? t('选择目标文件夹') : t('文件与文件夹')
          }
        >
          <VaultTreeNode
            {...props}
            level={1}
            expandedSet={expandedSet}
            onToggle={toggleHandler}
            focusId={focusId}
            onFocus={setFocusId}
          />
        </div>
      </ScrollArea>
      {!props.foldersOnly ? (
        <div className={styles.footer}>
          <Button
            type="button"
            variant="ghost"
            className={styles.trash}
            aria-haspopup="dialog"
            data-vault-trash-trigger
            onClick={props.onTrash}
          >
            <Trash2 size={15} aria-hidden="true" />
            {t('回收站')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
export { VaultTree }
