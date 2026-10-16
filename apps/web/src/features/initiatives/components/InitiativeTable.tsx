import { useI18n } from '@/lib/i18n'
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

import styles from '@/features/initiatives/components/InitiativeTable.module.css'

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
}: InitiativeTableProps) => {
  const { t } = useI18n()
  return (
    <div className={styles['table-scroll-shell']}>
      <Table className={styles['initiative-table']}>
        <TableHeader>
          <TableRow>
            <TableHead className={styles['name-head']}>{t('Name')}</TableHead>
            <TableHead className={styles['target-head']}>
              {t('Target')}
            </TableHead>
            <TableHead className={styles['health-head']}>
              {t('Health')}
            </TableHead>
            <TableHead className={styles['projects-head']}>
              {t('Projects')}
            </TableHead>
            <TableHead className={styles['active-head']}>
              {t('Active projects')}
            </TableHead>
            <TableHead className={styles['activity-head']}>
              {t('Activity')}
            </TableHead>
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
              <TableCell colSpan={6} className={styles['empty-cell']}>
                <Archive aria-hidden="true" />
                {t('No initiatives in this view')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export { InitiativeTable }
