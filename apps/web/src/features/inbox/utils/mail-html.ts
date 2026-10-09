import DOMPurify from 'dompurify'

/**
 * 清理邮件 HTML，并为隔离 iframe 加入只允许排版与自动加载图片的 CSP。
 *
 * @param body - 不可信的上游邮件 HTML
 * @returns 无脚本、表单或嵌入内容的独立 HTML 文档
 */
const buildMailHtmlDocument = (body: string): string => {
  const clean = DOMPurify.sanitize(body, {
    WHOLE_DOCUMENT: true,
    USE_PROFILES: { html: true },
    SANITIZE_NAMED_PROPS: true,
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'video',
      'audio',
      'base',
      'link',
      'meta',
    ],
    FORBID_ATTR: ['srcdoc'],
    ADD_ATTR: ['target'],
  })
  const document = new DOMParser().parseFromString(clean, 'text/html')
  for (const link of document.querySelectorAll('a')) {
    const href = link.getAttribute('href') ?? ''
    if (!/^(https?:|mailto:)/i.test(href)) link.removeAttribute('href')
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
  const policy = document.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; base-uri 'none'; form-action 'none'`
  document.head.prepend(policy)
  const referrer = document.createElement('meta')
  referrer.name = 'referrer'
  referrer.content = 'no-referrer'
  document.head.append(referrer)
  const style = document.createElement('style')
  style.textContent =
    'html{color-scheme:light}body{margin:0;font:14px/1.6 Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{overflow-wrap:anywhere}'
  document.head.append(style)
  return `<!doctype html>${document.documentElement.outerHTML}`
}

export { buildMailHtmlDocument }
