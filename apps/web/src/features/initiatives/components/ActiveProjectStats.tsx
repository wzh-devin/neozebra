import type { ActiveProjectStat } from '@/features/initiatives/types'

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
  if (stats.length === 0) {
    return <span className="muted-dash">—</span>
  }

  return (
    <div className="project-stats" aria-label="Active project counts">
      {stats.map((stat) => (
        <span className="project-stat" key={`${stat.tone}-${stat.value}`}>
          <span
            aria-hidden="true"
            className={`project-dot project-dot-${stat.tone}`}
          />
          {stat.value}
        </span>
      ))}
    </div>
  )
}

export { ActiveProjectStats }
