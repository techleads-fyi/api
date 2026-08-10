import { defaultBaseUrl, defaultSiteUrl, resolveApiKey } from "./config.js"
import type {
  AccountInfo,
  BatchLookupResult,
  LookupResult,
  TechLeadsOptions,
} from "./types.js"

export class TechLeadsError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = "TechLeadsError"
    this.status = status
    this.body = body
  }
}

export class TechLeads {
  readonly apiKey: string
  readonly baseUrl: string
  readonly siteUrl: string

  constructor(opts: TechLeadsOptions = {}) {
    const key = resolveApiKey(opts.apiKey)
    if (!key) {
      throw new TechLeadsError(
        "API key required. Pass apiKey, set TECHLEADS_API_KEY, or run: tlf login",
        401,
      )
    }
    this.apiKey = key
    this.baseUrl = (opts.baseUrl || defaultBaseUrl()).replace(/\/$/, "")
    this.siteUrl = (opts.siteUrl || defaultSiteUrl()).replace(/\/$/, "")
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`
    const res = await fetch(url, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers || {}) },
    })
    const text = await res.text()
    let data: unknown = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }
    if (!res.ok) {
      const err = data as { error?: { message?: string }; message?: string }
      const msg =
        err?.error?.message || err?.message || `Request failed (${res.status})`
      throw new TechLeadsError(msg, res.status, data)
    }
    return data as T
  }

  /** Single domain/URL lookup (1 credit). */
  async lookup(url: string): Promise<LookupResult> {
    const q = encodeURIComponent(url.trim())
    return this.request<LookupResult>(`/web/lookup?url=${q}`, { method: "GET" })
  }

  /** Batch lookup up to 1000 domains (1 credit each). */
  async lookupBatch(domains: string[]): Promise<BatchLookupResult> {
    const list = domains.map((d) => d.trim()).filter(Boolean)
    if (!list.length) throw new TechLeadsError("Provide at least one domain", 400)
    return this.request<BatchLookupResult>("/web/lookup/batch", {
      method: "POST",
      body: JSON.stringify({ domains: list }),
    })
  }

  /** Account credits + identity. */
  async account(): Promise<AccountInfo> {
    const res = await this.request<{ success?: boolean; data: AccountInfo }>(
      "/account/info",
      { method: "GET" },
    )
    return res.data
  }
}
