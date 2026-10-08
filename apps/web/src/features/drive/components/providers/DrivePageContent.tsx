import { CheckCircle2, Cloud, MoreHorizontal, Plus, Server } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageFrame } from '@/components/shared/page-frame'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { driveProviderList } from '@/features/drive/data/mockDrive'

import styles from '@/features/drive/components/providers/DrivePageContent.module.css'

const providerIconMap = {
  baidu: Cloud,
  aliyun: Cloud,
  minio: Server,
}

/**
 * 渲染 Provider 连接配置抽屉。
 *
 * @param 无参数
 * @returns Provider 连接表单 JSX
 */
const DriveConnectionSheet = () => {
  const [open, setOpen] = useState(false)

  /**
   * 提交 Provider 连接表单。
   *
   * @param event - 表单提交事件
   * @returns 无返回值；触发本地连接反馈并关闭抽屉
   */
  const connectProviderHandler = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setOpen(false)
    toast('Provider connection saved for the local workspace')
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Connect provider
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Connect a provider</SheetTitle>
          <SheetDescription>
            Configure a local connection for the Drive workspace.
          </SheetDescription>
        </SheetHeader>
        <form
          className={styles['connection-form']}
          onSubmit={connectProviderHandler}
        >
          <div className={styles['form-field']}>
            <Label htmlFor="drive-provider">Provider</Label>
            <Select defaultValue="baidu">
              <SelectTrigger id="drive-provider">
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="baidu">Baidu Drive</SelectItem>
                <SelectItem value="aliyun">Aliyun Drive</SelectItem>
                <SelectItem value="minio">MinIO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={styles['form-field']}>
            <Label htmlFor="drive-endpoint">Endpoint</Label>
            <Input
              id="drive-endpoint"
              placeholder="https://storage.example.com"
            />
          </div>
          <div className={styles['form-field']}>
            <Label htmlFor="drive-access-key">Access key</Label>
            <Input id="drive-access-key" placeholder="Enter access key" />
          </div>
          <SheetFooter>
            <Button type="submit">Save connection</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/**
 * 渲染 Drive Provider 管理总览。
 *
 * @param 无参数
 * @returns Drive Provider 页面 JSX
 */
const DrivePageContent = () => (
  <PageFrame
    title="Drive"
    description="Manage connected storage providers"
    actions={<DriveConnectionSheet />}
  >
    <div className={styles['provider-grid']}>
      {driveProviderList.map((provider) => {
        const ProviderIcon = providerIconMap[provider.id]

        return (
          <Card key={provider.id} className={styles['provider-card']}>
            <CardHeader>
              <div className={styles['provider-heading']}>
                <span className={styles['provider-icon']}>
                  <ProviderIcon aria-hidden="true" />
                </span>
                <div>
                  <CardTitle>{provider.name}</CardTitle>
                  <CardDescription>{provider.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className={styles['provider-content']}>
              <div className={styles['provider-status']}>
                <Badge variant="secondary">
                  <CheckCircle2 aria-hidden="true" />
                  Connected
                </Badge>
                <span>Synced {provider.lastSyncedAt}</span>
              </div>
              <Button asChild variant="outline">
                <Link to={`/assets/drive/${provider.id}`}>
                  Open files
                  <MoreHorizontal aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  </PageFrame>
)

export { DrivePageContent }
