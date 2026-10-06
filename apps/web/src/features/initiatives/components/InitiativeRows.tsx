import type { ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'

import { Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible'
import { TableCell, TableRow } from '@/components/ui/table'
import { ActiveProjectStats } from '@/features/initiatives/components/ActiveProjectStats'
import { HealthBadge } from '@/features/initiatives/components/HealthBadge'
import type { InitiativeRow as InitiativeRowType } from '@/features/initiatives/types'

const iconToneClassMap: Record<string, string> = {
  cyan: 'row-icon-cyan',
  red: 'row-icon-red',
  purple: 'row-icon-purple',
}

type InitiativeRowsProps = {
  rows: InitiativeRowType[]
  depth?: number
  expandedSet: Set<string>
  onExpandedChange: (id: string, open: boolean) => void
}

/**
 * 创建单行展开状态回调，供 Radix Collapsible 使用。
 *
 * @param id - initiative 唯一标识
 * @param onExpandedChange - 更新展开状态的回调
 * @returns 接收展开状态的事件处理函数
 */
const createExpandedChangeHandler =
  (id: string, onExpandedChange: (id: string, open: boolean) => void) =>
  (open: boolean): void =>
    onExpandedChange(id, open)

/**
 * 递归渲染 initiative 表格行和树形连接线。
 *
 * @param props - 行数据、层级及展开状态
 * @returns 表格行 JSX 节点列表
 */
const InitiativeRows = ({
  rows,
  depth = 0,
  expandedSet,
  onExpandedChange,
}: InitiativeRowsProps): ReactNode[] =>
  rows.flatMap((row) => {
    const hasChildren = Boolean(row.children?.length)
    const isExpanded = expandedSet.has(row.id)
    const Icon = row.icon

    const currentRow = (
      <Collapsible
        key={row.id}
        open={isExpanded}
        onOpenChange={createExpandedChangeHandler(row.id, onExpandedChange)}
      >
        <TableRow
          className={`initiative-row ${depth === 0 ? 'initiative-row-parent' : ''}`}
        >
          <TableCell className="name-cell">
            <div
              className="name-tree"
              style={{ paddingLeft: `${depth * 34 + 12}px` }}
            >
              {Array.from({ length: depth }).map((_, index) => (
                <span
                  aria-hidden="true"
                  className="tree-guide"
                  key={`${row.id}-guide-${index}`}
                  style={{ left: `${index * 34 + 25}px` }}
                />
              ))}
              {hasChildren ? (
                <CollapsibleTrigger asChild>
                  <button
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${row.name}`}
                    className="row-toggle"
                    type="button"
                  >
                    {isExpanded ? (
                      <ChevronDown aria-hidden="true" />
                    ) : (
                      <ChevronRight aria-hidden="true" />
                    )}
                  </button>
                </CollapsibleTrigger>
              ) : (
                <span className="row-toggle-spacer" aria-hidden="true" />
              )}
              <span className={`row-icon ${iconToneClassMap[row.iconTone]}`}>
                <Icon aria-hidden="true" />
              </span>
              <span className="name-copy">
                <span className="name-title">{row.name}</span>
                {row.description ? (
                  <span className="name-description">{row.description}</span>
                ) : null}
              </span>
            </div>
          </TableCell>
          <TableCell className="target-cell">{row.target}</TableCell>
          <TableCell className="health-cell">
            <HealthBadge status={row.health} />
          </TableCell>
          <TableCell className="projects-cell">
            <span className="project-count-icon">
              <ShieldCheck aria-hidden="true" />
            </span>
            <span>{row.projects}</span>
          </TableCell>
          <TableCell className="active-projects-cell">
            <ActiveProjectStats stats={row.activeProjects} />
          </TableCell>
          <TableCell className="activity-cell">
            {row.activity === 'up' ? (
              <TrendingUp
                aria-label="Improving activity"
                className="activity-up"
              />
            ) : (
              <span className="activity-flat">—</span>
            )}
          </TableCell>
        </TableRow>
        {hasChildren && isExpanded ? (
          <InitiativeRows
            rows={row.children ?? []}
            depth={depth + 1}
            expandedSet={expandedSet}
            onExpandedChange={onExpandedChange}
          />
        ) : null}
      </Collapsible>
    )

    return [currentRow]
  })

export { InitiativeRows }
