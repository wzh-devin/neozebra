import { Archive } from 'lucide-react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InitiativeRows } from '@/features/initiatives/components/InitiativeRows'
import type { InitiativeRow } from '@/features/initiatives/types'

type InitiativeTableProps = {
  initiativeList: InitiativeRow[]
  expandedSet: Set<string>
  onExpandedChange: (id: string, open: boolean) => void
}

/**
 * 渲染 initiatives 的表头、层级数据和空状态。
 *
 * @param props - 可展示的 initiative 列表和展开状态
 * @returns initiatives 表格 JSX
 */
const InitiativeTable = ({
  initiativeList,
  expandedSet,
  onExpandedChange,
}: InitiativeTableProps) => (
  <div className="table-scroll-shell">
    <Table className="initiative-table">
      <TableHeader>
        <TableRow className="table-head-row">
          <TableHead className="name-head">Name</TableHead>
          <TableHead className="target-head">Target</TableHead>
          <TableHead className="health-head">Health</TableHead>
          <TableHead className="projects-head">Projects</TableHead>
          <TableHead className="active-head">Active projects</TableHead>
          <TableHead className="activity-head">Activity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {initiativeList.length > 0 ? (
          <InitiativeRows
            rows={initiativeList}
            expandedSet={expandedSet}
            onExpandedChange={onExpandedChange}
          />
        ) : (
          <TableRow>
            <TableCell colSpan={6} className="empty-cell">
              <Archive aria-hidden="true" />
              No initiatives in this view
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </div>
)

export { InitiativeTable }
