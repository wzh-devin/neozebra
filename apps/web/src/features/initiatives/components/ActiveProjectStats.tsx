import { useI18n } from '@/lib/i18n'
import type { ActiveProjectStat } from '@/features/initiatives/types'

import styles from '@/features/initiatives/styles/InitiativeShared.module.css'

type ActiveProjectStatsProps = {
  stats: ActiveProjectStat[]
}

/**
 * 渲染 active projects 的彩色统计数字。
 *
 * @param props - active projects 统计数据
 * @returns 统计数字 JSX
 */
const ActiveProjectStats = ({ stats }: ActiveProjectStatsProps) => {
  const { t } = useI18n()

  if (stats.length === 0) {
    return <span className={styles['muted-dash']}>—</span>
  }

  return (
    <div
      className={styles['project-stats']}
      aria-label={t('Active project counts')}
    >
      {stats.map((stat) => (
        <span
          className={styles['project-stat']}
          key={`${stat.tone}-${stat.value}`}
        >
          <span
            aria-hidden="true"
            className={`${styles['project-dot']} ${styles[`project-dot-${stat.tone}`]}`}
          />
          {stat.value}
        </span>
      ))}
    </div>
  )
}

export { ActiveProjectStats }
