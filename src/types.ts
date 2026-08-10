export type Technology = {
  name: string
  categories?: string[]
  tag?: string
  confidence?: number
  version?: string | null
  [key: string]: unknown
}

export type TechnologySpend = {
  monthly_usd?: number
  annual_usd?: number
  priced_technologies?: number
  total_technologies?: number
  disclaimer?: string
}

export type LookupError = string | { code?: string; message?: string }

export type LookupResult = {
  domain?: string
  url?: string
  technologies?: Technology[]
  technology_spend?: TechnologySpend | null
  success?: boolean
  /** API may return a string or `{ message }` object. */
  error?: LookupError | null
  meta?: {
    credits_used?: number
    credits_remaining?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type BatchLookupResult = {
  results?: LookupResult[]
  success?: boolean
  error?: LookupError | null
  meta?: {
    credits_used?: number
    credits_remaining?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type AccountInfo = {
  email?: string
  name?: string
  credits_used: number
  credits_remaining: number
  credits_limit: number
}

export type TechLeadsOptions = {
  apiKey?: string
  baseUrl?: string
  siteUrl?: string
}
