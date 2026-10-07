import {
  Activity,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { HealthStatus } from '@/features/initiatives/types'

import styles from '@/features/initiatives/styles/InitiativeShared.module.css'

const healthDetailsRecord: Record<
  HealthStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  onTrack: {
    label: 'On track',
    icon: TrendingUp,
    className: 'health-on-track',
  },
  atRisk: { label: 'At risk', icon: Activity, className: 'health-at-risk' },
  offTrack: {
    label: 'Off track',
    icon: TrendingDown,
    className: 'health-off-track',
  },
}

type HealthBadgeProps = {
  status: HealthStatus
}

/**
 * 渲染 initiative 的健康状态标签。
 *
 * @param props - 健康状态
 * @returns 健康状态 Badge JSX
 */
const HealthBadge = ({ status }: HealthBadgeProps) => {
  const health = healthDetailsRecord[status]
  const Icon = health.icon

  return (
    <Badge
      className={`${styles['health-badge']} ${styles[health.className]}`}
      variant="outline"
    >
      <Icon aria-hidden="true" />
      {health.label}
    </Badge>
  )
}

export { HealthBadge }
