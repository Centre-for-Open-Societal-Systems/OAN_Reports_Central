/**
 * Thin fetch wrapper for the Report Center backend.
 *
 * VITE_API_BASE_URL empty  -> same-origin requests (Vite proxies `/api` to the backend in dev).
 * VITE_API_BASE_URL set    -> prefixed onto every request, e.g. https://reports.example.org
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Resolve an app-relative path (`/api/...`) against the configured base URL. Absolute URLs pass through. */
export function resolveUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

function buildUrl(path, query) {
  const url = resolveUrl(path)
  if (!query) return url
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, String(item)))
    else qs.append(k, String(v))
  }
  const s = qs.toString()
  return s ? `${url}${url.includes('?') ? '&' : '?'}${s}` : url
}

function errorMessage(body, status, statusText) {
  const detail = body && typeof body === 'object' ? body.detail ?? body.message ?? body.error : body
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => (typeof d === 'string' ? d : [d.loc?.slice(1).join('.'), d.msg].filter(Boolean).join(': '))).join('; ')
  }
  return `Request failed (${status}${statusText ? ` ${statusText}` : ''})`
}

export async function request(method, path, { query, body, signal } = {}) {
  let res
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    throw new ApiError('Cannot reach the reporting API. Is the backend running?', { status: 0 })
  }

  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) throw new ApiError(errorMessage(data, res.status, res.statusText), { status: res.status, body: data })
  return data
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body: body ?? {} }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body: body ?? {} }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body: body ?? {} }),
  delete: (path, opts) => request('DELETE', path, opts),
}
