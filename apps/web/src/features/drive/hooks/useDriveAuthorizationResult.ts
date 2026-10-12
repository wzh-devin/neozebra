import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

const resultMessageRecord: Record<string, string> = {
  success: 'Drive connected successfully',
  cancelled: 'Drive authorization was cancelled.',
  expired: 'Drive authorization expired. Connect again from Drive.',
  conflict: 'This Drive changed during authorization. Reload it and retry.',
  failed:
    'Could not authorize this Drive. Check the application permissions and callback configuration, then retry.',
}

/**
 * 用共享通知展示官方授权结果，并移除一次性结果参数。
 *
 * @param 无参数
 * @returns 无返回值；触发通知并清理当前地址，防止刷新重复提示
 */
const useDriveAuthorizationResult = (): void => {
  const [parameters, setParameters] = useSearchParams()
  const handledRef = useRef(false)
  useEffect(() => {
    const result = parameters.get('authorization')
    if (!result || handledRef.current) return
    handledRef.current = true
    const message = resultMessageRecord[result]
    if (message) {
      if (result === 'success') toast.success(message)
      else if (result === 'cancelled') toast(message)
      else toast.error(message)
    }
    const next = new URLSearchParams(parameters)
    next.delete('authorization')
    setParameters(next, { replace: true })
  }, [parameters, setParameters])
}
export { useDriveAuthorizationResult }
