import { useEffect, useId, useRef, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import type { DriveOfficePreview as OfficePreview } from '@/services/drive-office'
import styles from './DriveOfficePreview.module.css'

type OfficeEditor = { destroyEditor: () => void }
type DocsApi = {
  DocEditor: new (
    id: string,
    config: OfficePreview['config'] & {
      events: {
        onDocumentReady: () => void
        onUserActionRequired: () => void
        onError: (event: { data: { errorCode: number } }) => void
      }
    },
  ) => OfficeEditor
}
let loadedApi: { url: string; promise: Promise<DocsApi> } | undefined

/**
 * 按需加载服务端指定的DocsAPI，复用同一引擎脚本并允许失败后重试。
 *
 * @param url - 应用配置的文档服务器脚本URL
 * @returns 官方DocsAPI
 */
const loadDocsApi = (url: string): Promise<DocsApi> => {
  if (loadedApi?.url === url) return loadedApi.promise
  const promise = new Promise<DocsApi>((resolve, reject) => {
    const script = document.createElement('script')
    const timer = setTimeout(() => failedHandler(), 30_000)
    const failedHandler = () => {
      clearTimeout(timer)
      script.remove()
      loadedApi = undefined
      reject(
        new Error('The Office preview service could not be reached. Retry.'),
      )
    }
    script.src = url
    script.referrerPolicy = 'no-referrer'
    script.onerror = failedHandler
    const scriptLoadHandler = () => {
      clearTimeout(timer)
      const api = (window as Window & { DocsAPI?: DocsApi }).DocsAPI
      if (api) resolve(api)
      else failedHandler()
    }
    script.onload = scriptLoadHandler
    document.head.append(script)
  })
  loadedApi = { url, promise }
  return promise
}

/**
 * 在居中弹窗内挂载Office只读查看器，卸载销毁iframe及引擎事件。
 *
 * @param props - 已鉴权签名的会话与文件名
 * @returns 预览、加载或安全错误状态JSX
 */
const DriveOfficePreview = ({
  preview,
  name,
}: {
  preview: OfficePreview
  name: string
}) => {
  const id = useId().replaceAll(':', '')
  const hostRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const retryHandler = () => {
    setError('')
    setIsLoading(true)
    setAttempt((value) => value + 1)
  }
  useEffect(() => {
    let active = true
    let editor: OfficeEditor | undefined
    const host = hostRef.current!
    const mount = document.createElement('div')
    mount.id = id
    host.append(mount)
    const timeoutHandler = () => {
      if (active)
        setError(
          'The Office file could not finish loading. It may be encrypted, damaged or exceed the document engine’s resources.',
        )
    }
    const timeout = setTimeout(timeoutHandler, 180_000)
    const readyHandler = () => {
      clearTimeout(timeout)
      if (active) setIsLoading(false)
    }
    const errorHandler = () => {
      clearTimeout(timeout)
      if (active)
        setError(
          'Could not render this Office file. Check the document service or try downloading the original file.',
        )
    }
    const mountEditor = async () => {
      try {
        const api = await loadDocsApi(preview.apiUrl)
        if (!active) return
        editor = new api.DocEditor(id, {
          ...preview.config,
          events: {
            onDocumentReady: readyHandler,
            onUserActionRequired: readyHandler,
            onError: errorHandler,
          },
        })
        const iframe = host.querySelector('iframe')
        if (iframe) iframe.title = 'Office preview of ' + name
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load Office preview.',
          )
      }
    }
    void mountEditor()
    return () => {
      active = false
      clearTimeout(timeout)
      editor?.destroyEditor()
      host.replaceChildren()
    }
  }, [preview, name, id, attempt])
  return (
    <div className={styles.container}>
      <div
        className={styles.editor}
        ref={hostRef}
        aria-label={'Office preview of ' + name}
      />
      {error ? (
        <div className={styles.state} role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={retryHandler}>
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <div className={styles.state} role="status">
          <Spinner />
          Loading document…
        </div>
      ) : null}
    </div>
  )
}
export { DriveOfficePreview }
