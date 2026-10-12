import { ArrowUpRight, Trash2, Unplug } from 'lucide-react'
import type { MouseEvent } from 'react'
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
import { DriveUploadTasks } from '@/features/drive/components/uploads/DriveUploadTasks'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import styles from '@/features/drive/components/providers/DriveProviderCard.module.css'

type DriveProviderCardProps = {
  provider: DriveProvider
  onDelete: (connection: DriveProvider, trigger: HTMLButtonElement) => void
}

/**
 * 展示可直接进入文件工作区的存储卡片。
 *
 * @param props - 连接实例和删除请求操作
 * @returns Provider 卡片 JSX
 */
const DriveProviderCard = ({ provider, onDelete }: DriveProviderCardProps) => {
  const isCloudAccount = provider.providerId !== 'minio'
  const removeLabel = isCloudAccount
    ? 'Disconnect account'
    : 'Delete connection'
  const requestDeleteHandler = (event: MouseEvent<HTMLButtonElement>): void =>
    onDelete(provider, event.currentTarget)
  return (
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
              ? `Checked ${new Date(provider.lastSyncedAt).toLocaleString()}`
              : 'Not synced'}
          </span>
        </CardContent>
      </Link>
      <DriveConnectionDialog connection={provider} />
      <DriveUploadTasks
        connection={provider}
        compact
        className={styles['tasks-button']}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={styles['delete-button']}
            aria-label={`${removeLabel}: ${provider.name}`}
            aria-haspopup="dialog"
            onClick={requestDeleteHandler}
          >
            {isCloudAccount ? (
              <Unplug aria-hidden="true" />
            ) : (
              <Trash2 aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{removeLabel}</TooltipContent>
      </Tooltip>
    </Card>
  )
}

export { DriveProviderCard }
