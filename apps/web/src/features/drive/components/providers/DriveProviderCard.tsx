import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { DriveProvider } from '@/features/drive/types'
import { DriveProviderIcon } from '@/features/drive/components/DriveProviderIcon'
import { DriveConnectionDialog } from '@/features/drive/components/providers/DriveConnectionDialog'

import styles from '@/features/drive/components/providers/DriveProviderCard.module.css'

type DriveProviderCardProps = { provider: DriveProvider }

/**
 * 展示可直接进入文件工作区的存储卡片。
 *
 * @param props - 本地 mock Provider 数据
 * @returns Provider 卡片 JSX
 */
const DriveProviderCard = ({ provider }: DriveProviderCardProps) => (
  <Card className={styles.card}>
    <Link
      className={styles.link}
      aria-label={`Open ${provider.name} files`}
      to={`/assets/drive/${provider.id}`}
    >
      <DriveProviderIcon
        providerId={provider.providerId}
        className={styles.mark}
      />
      <CardHeader className={styles.heading}>
        <CardTitle>
          <h3>
            {provider.name}
            <ArrowUpRight aria-hidden="true" className={styles.arrow} />
          </h3>
        </CardTitle>
        <CardDescription className={styles.description}>
          {provider.description}
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.meta}>
        <span className={styles.status} data-status={provider.status}>
          <span aria-hidden="true" />
          {provider.status === 'connected' ? 'Connected' : 'Configured'}
        </span>
        <span>
          {provider.status === 'connected'
            ? `Synced ${provider.lastSyncedAt}`
            : 'Not synced'}
        </span>
      </CardContent>
    </Link>
    <DriveConnectionDialog connection={provider} />
  </Card>
)

export { DriveProviderCard }
