import { Languages } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { useI18n } from '@/lib/i18n'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import styles from './LanguageSwitcher.module.css'

/**
 * 提供可键盘操作的应用语言选择，保留当前路由和编辑状态。
 *
 * @param 无参数
 * @returns 语言菜单 JSX；切换时保存偏好，保存失败时显示通知
 */
const LanguageSwitcher = () => {
  const { locale, t, setLocale } = useI18n()
  const localeChangeHandler = (value: string) => {
    if (value !== 'zh-CN' && value !== 'en-US') return
    if (!setLocale(value)) toast.error(t('语言已切换，但浏览器未能保存设置。'))
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          type="button"
          tooltip={t('切换语言')}
          aria-label={t('切换语言')}
          className={styles.trigger}
        >
          <Languages aria-hidden="true" />
          <span>{locale === 'zh-CN' ? '简体中文' : 'English'}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className={surfaceStyles.surface}
      >
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={localeChangeHandler}
        >
          <DropdownMenuRadioItem value="zh-CN" lang="zh-CN">
            简体中文
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en-US" lang="en-US">
            English
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
export { LanguageSwitcher }
