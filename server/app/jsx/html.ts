import type { Context, StaticContext } from '../context'
import debug from 'debug'
import type {
  html,
  Node,
  Raw,
  Fragment,
  NodeList,
  JSXFragment,
  Component,
  Element,
} from './types'
import { HTMLStream, noop } from './stream.js'
import { Flush } from '../components/flush.js'
import { renderError, renderErrorNode, showError } from '../components/error.js'
import { EarlyTerminate, ErrorNode, MessageException } from '../../exception.js'
import { evalLocale } from '../components/locale.js'

const log = debug('html.ts')
log.enabled = true

/**
 * only use for textContent, not attribute values
 */
export function escapeHTMLTextContent(str: string): string {
  str = str.replace(/&/g, '&amp;')
  str = str.replace(/</g, '&lt;')
  str = str.replace(/>/g, '&gt;')
  // str = str.replace(/"/g, '&quot;')
  // str = str.replace(/'/g, '&#39;')
  return str
}

export function escapeHTMLAttributeValue(
  value: string | number | boolean,
): string {
  if (typeof value === 'string' && value.includes('"')) {
    return '"' + value.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"'
  }
  return JSON.stringify(value).replaceAll('\\\\', '\\')
}

// to be used in template that has already wrapped the attribute value in double quotes
export function unquote(str: string): string {
  return str.slice(1, str.length - 1)
}

export function nodeToHTML(node: Node, context: Context): html {
  let html = ''
  let stream = {
    write: (chunk: html) => (html += chunk),
    flush: noop,
  }
  writeNode(stream, node, context)
  return html
}

export function nodeListToHTML(nodeList: NodeList, context: Context): html {
  let html = ''
  let stream = {
    write: (chunk: html) => (html += chunk),
    flush: noop,
  }
  nodeList.forEach(node => writeNode(stream, node, context))
  return html
}

export function prerender(
  node: Node,
  context: Context | Omit<StaticContext, 'type'> = {
    type: 'static',
    language: 'en',
  },
): Raw {
  if (!('type' in context)) {
    context = { type: 'static', ...context }
  }
  let html = nodeToHTML(node, context)
  return ['raw', html]
}

export function writeNode(
  stream: HTMLStream,
  node: Node,
  context: Context,
): void {
  switch (node) {
    case null:
    case undefined:
    case false:
    case true:
      return
  }
  switch (typeof node) {
    case 'string':
      return stream.write(escapeHTMLTextContent(node))
    case 'number':
      return stream.write(String(node))
  }
  if (node[0] === 'raw') {
    return stream.write((node as Raw)[1])
  }
  if (Array.isArray(node[0])) {
    return writeNodeList(stream, (node as Fragment)[0], context)
  }

  node = node as JSXFragment
  if (!node[0] && !node[1]) {
    return writeNodeList(stream, node[2], context)
  }

  if (typeof node[0] === 'function') {
    node = node as Component
    let componentFn = node[0]
    if (componentFn === Flush) {
      stream.flush()
      return
    }
    let attrs = node[1] || {}
    let children = node[2]
    if (children) {
      Object.assign(attrs, { children })
    }
    try {
      node = componentFn(attrs, context)
      writeNode(stream, node, context)
    } catch (error) {
      if (error === EarlyTerminate || error instanceof MessageException)
        throw error
      if (error instanceof ErrorNode) {
        writeNode(stream, renderErrorNode(error, context), context)
      } else {
        console.error('Caught error from componentFn:', error)
        if (context.type == 'ws') {
          context.ws.send(showError(error))
          throw EarlyTerminate
        }
        writeNode(stream, renderError(error, context), context)
      }
    }
    return
  }

  return writeElement(stream, node, context)
}

function writeNodeList(
  stream: HTMLStream,
  nodeList: NodeList,
  context: Context,
): void {
  nodeList.forEach(node => writeNode(stream, node, context))
}

const tagNameRegex = /([\w-]+)/
const idRegex = /#([\w-]+)/
const attrListRegex = /\[(.*?)\]/g
const classListRegex = /\.([\w-]+)/g

function writeElement(
  stream: HTMLStream,
  [selector, attrs, children]: Element,
  context: Context,
): void {
  let tagNameMatch = selector.match(tagNameRegex)
  if (!tagNameMatch) {
    throw new TypeError('failed to parse tag name, selector: ' + selector)
  }
  let tagName: string = tagNameMatch[1]
  let html = `<${tagName}`
  let idMatch = selector.match(idRegex)
  if (idMatch) {
    selector = selector.replace(idMatch[0], '')
    html += ` id="${idMatch[1]}"`
  }
  for (let attrMatch of selector.matchAll(attrListRegex)) {
    selector = selector.replace(attrMatch[0], '')
    html += ` ${attrMatch[1]}`
  }
  let classList: string[] = []
  for (let classMatch of selector.matchAll(classListRegex)) {
    classList.push(classMatch[1])
  }
  if (classList.length > 0) {
    html += ` class="${classList.join(' ')}"`
  }
  if (attrs) {
    Object.entries(attrs).forEach(([name, value]) => {
      value = evalLocale(value, context)
      if (value === undefined || value === null || value === false) return
      if (value === '' || value === true) {
        html += ` ${name}`
      } else {
        value = escapeHTMLAttributeValue(value)
        html += ` ${name}=${value}`
      }
    })
  }
  html += '>'
  stream.write(html)
  switch (tagName) {
    case 'img':
    case 'input':
    case 'br':
    case 'hr':
    case 'meta':
    case 'link':
    case 'base':
    case 'source':
    case 'track':
    case 'col':
    case 'param':
    case 'area':
      return
  }
  if (children) {
    writeNodeList(stream, children, context)
  }
  stream.write(`</${tagName}>`)
}

export function flagsToClassName(flags: Record<string, boolean>): string {
  let classes: string[] = []
  Object.entries(flags).forEach(([name, value]) => {
    if (value) {
      classes.push(name)
    }
  })
  return classes.join(' ')
}

export function concatClassNames(
  ...classNames: (string | null | undefined)[]
): string | undefined {
  let className = ''
  for (let name of classNames) {
    if (name) {
      className += ' ' + name
    }
  }
  className = className.trim()
  return className || undefined
}

// omit style-name conversion, use it as-is
export function inlineStyle(styles: Record<string, string | number>): string {
  return Object.entries(styles)
    .map(([name, value]) => name + ':' + value)
    .join(';')
}

// compatible with React-style camelCase object
export function inlineCamelCaseStyle(
  styles: Record<string, string | number>,
): string {
  return Object.entries(styles)
    .map(([name, value]) => toStyleName(name) + ':' + value)
    .join(';')
}

function toStyleName(name: string): string {
  name.match(/[A-Z]/g)?.forEach(char => {
    name = name.replace(char, '-' + char.toLowerCase())
  })
  return name
}
