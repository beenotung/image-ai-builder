import { o } from '../jsx/jsx.js'
import { castDynamicContext, Context } from '../context.js'
import type { Node, NodeList } from '../jsx/types'
import { Router as UrlRouter } from 'url-router.ts'
import { EarlyTerminate } from '../../exception.js'
import { setSessionUrl } from '../session.js'
import { evalAttrsLocale } from './locale.js'

export type LinkAttrs = {
  'tagName'?: string
  'no-history'?: boolean
  'no-animation'?: boolean
  'is-back'?: boolean
  'href': string
  'onclick'?: never
  [name: string]: unknown
  'children'?: NodeList
  'hidden'?: boolean | undefined
  'rel'?: 'nofollow'
}

export function Link(attrs: LinkAttrs, context: Context) {
  evalAttrsLocale(attrs, 'title', context)
  const {
    'tagName': _tagName,
    'no-history': quiet,
    'no-animation': fast,
    'is-back': back,
    children,
    hidden,
    ...aAttrs
  } = attrs
  const tagName = _tagName || 'a'
  let flag = ''
  if (quiet) flag += 'q'
  if (fast) flag += 'f'
  if (back) flag += 'b'
  const onclick = flag ? `emitHref(event,'${flag}')` : `emitHref(event)`
  if (!children && tagName == 'a') {
    console.warn('Link attrs:', attrs)
    console.warn(new Error('Link with empty content'))
  }
  return [
    tagName,
    { onclick, hidden: hidden ? '' : undefined, ...aAttrs },
    children,
  ]
}

export function Redirect(
  attrs: { href: string; full?: boolean; status?: number },
  context: Context,
) {
  const href = attrs.href
  if (context.type === 'express') {
    const res = context.res
    if (res.headersSent) {
      res.end(renderRedirect(href))
    } else {
      const status = attrs.status || 303
      res.redirect(status, href)
    }
    throw EarlyTerminate
  }
  if (context.type === 'ws') {
    setSessionUrl(context.ws, attrs.href)
    context.ws.send(
      attrs.full ? ['redirect', attrs.href, 1] : ['redirect', attrs.href],
    )
    throw EarlyTerminate
  }
  return (
    <a href={href} data-live="redirect" data-full={attrs.full || undefined}>
      Redirect to {href}
    </a>
  )
}

export function renderRedirect(href: string): string {
  return /* html */ `
<p>Redirect to <a href="${href}">${href}</a></p>
<script>
  location.href = "${href}"
</script>
`
}

export function Switch(routes: Routes, defaultNode?: Node): Node {
  const router = new UrlRouter<Node>()
  Object.entries(routes).forEach(([url, node]) => {
    router.add(url, node)
  })
  return <Router router={router} defaultNode={defaultNode} />
}

export function Router(
  attrs: {
    router: UrlRouter<Node>
    defaultNode?: Node
  },
  _context: Context,
): Node {
  const context = castDynamicContext(_context)
  const match = attrs.router.route(context.url)
  if (!match) return attrs.defaultNode
  context.routerMatch = match
  return match.value
}

export type Routes = {
  [url: string]: Node
}
export type Route = [url: string, node: Node]
