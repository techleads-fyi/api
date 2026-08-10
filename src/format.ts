import type {
  AccountInfo,
  BatchLookupResult,
  LookupResult,
  Technology,
} from "./types.js"

export type OutputFormat = "text" | "table" | "csv" | "json"

export type TechnologySpend = {
  monthly_usd?: number
  annual_usd?: number
  priced_technologies?: number
  total_technologies?: number
  disclaimer?: string
}

/** Normalize API `error` which may be a string or `{ message }`. */
export function lookupErrorMessage(row: LookupResult): string | null {
  const err = row.error
  if (err == null) return null
  if (typeof err === "string") {
    const s = err.trim()
    return s || null
  }
  if (typeof err === "object") {
    const msg = typeof err.message === "string" ? err.message.trim() : ""
    const code = typeof err.code === "string" ? err.code.trim() : ""
    if (msg && code) return `${code}: ${msg}`
    if (msg) return msg
    if (code) return code
  }
  return null
}

function domainOf(row: LookupResult, fallback = ""): string {
  const d = row.domain || row.url || fallback
  return String(d).replace(/^https?:\/\//, "").replace(/\/$/, "") || fallback
}

function techCategory(t: Technology): string {
  if (typeof t.tag === "string" && t.tag.trim()) return t.tag.trim()
  if (Array.isArray(t.categories) && t.categories.length) {
    const first = t.categories.find((c) => typeof c === "string" && c.trim())
    if (first) return String(first).trim()
  }
  return "-"
}

function techName(t: Technology): string {
  return typeof t?.name === "string" ? t.name.trim() : ""
}

function techsOf(row: LookupResult): Technology[] {
  return Array.isArray(row.technologies) ? row.technologies : []
}

function spendOf(row: LookupResult): TechnologySpend | null {
  const s = row.technology_spend
  if (!s || typeof s !== "object") return null
  return s as TechnologySpend
}

function money(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "-"
  return `$${Math.round(n).toLocaleString("en-US")}`
}

function spendLine(spend: TechnologySpend): string {
  const priced = spend.priced_technologies ?? 0
  const total = spend.total_technologies ?? 0
  return `Spend\t${money(spend.monthly_usd)}/mo · ${money(spend.annual_usd)}/yr (${priced}/${total} priced)`
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length)
}

/** Default text: domain, then category\\tname lines, then spend. */
export function formatLookupText(
  rows: LookupResult[],
  labels?: string[],
): string {
  const blocks: string[] = []
  rows.forEach((row, i) => {
    const label = labels?.[i] || domainOf(row, `item-${i + 1}`)
    const lines: string[] = [label]
    const err = lookupErrorMessage(row)
    if (err) {
      lines.push(`ERROR\t${err}`)
      blocks.push(lines.join("\n"))
      return
    }
    const techs = techsOf(row)
    if (!techs.length) {
      lines.push("(none)")
    } else {
      for (const t of techs) {
        const name = techName(t)
        if (!name) continue
        lines.push(`${techCategory(t)}\t${name}`)
      }
    }
    const spend = spendOf(row)
    if (spend) lines.push(spendLine(spend))
    blocks.push(lines.join("\n"))
  })
  return blocks.join("\n\n") + (blocks.length ? "\n" : "")
}

/** Aligned Name | Category table per domain. */
export function formatLookupTable(
  rows: LookupResult[],
  labels?: string[],
): string {
  const blocks: string[] = []
  rows.forEach((row, i) => {
    const label = labels?.[i] || domainOf(row, `item-${i + 1}`)
    const lines: string[] = [label]
    const err = lookupErrorMessage(row)
    if (err) {
      lines.push(`ERROR  ${err}`)
      blocks.push(lines.join("\n"))
      return
    }
    const techs = techsOf(row).filter((t) => techName(t))
    if (!techs.length) {
      lines.push("(none)")
    } else {
      const names = techs.map(techName)
      const cats = techs.map(techCategory)
      const nw = Math.max(4, ...names.map((n) => n.length))
      const cw = Math.max(8, ...cats.map((c) => c.length))
      lines.push(`${pad("Name", nw)}  ${pad("Category", cw)}`)
      lines.push(`${"-".repeat(nw)}  ${"-".repeat(cw)}`)
      techs.forEach((_t, j) => {
        lines.push(`${pad(names[j]!, nw)}  ${pad(cats[j]!, cw)}`)
      })
    }
    const spend = spendOf(row)
    if (spend) {
      const priced = spend.priced_technologies ?? 0
      const total = spend.total_technologies ?? 0
      lines.push(
        `Spend  ${money(spend.monthly_usd)}/mo  ${money(spend.annual_usd)}/yr  ${priced}/${total} priced`,
      )
    }
    blocks.push(lines.join("\n"))
  })
  return blocks.join("\n\n") + (blocks.length ? "\n" : "")
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/** CSV: domain,category,name,monthly_usd,annual_usd (spend repeated each row). */
export function formatLookupCsv(
  rows: LookupResult[],
  labels?: string[],
): string {
  const header = "domain,category,name,monthly_usd,annual_usd"
  const out: string[] = [header]
  rows.forEach((row, i) => {
    const domain = labels?.[i] || domainOf(row, `item-${i + 1}`)
    const spend = spendOf(row)
    const monthly = spend?.monthly_usd != null ? String(spend.monthly_usd) : ""
    const annual = spend?.annual_usd != null ? String(spend.annual_usd) : ""
    const err = lookupErrorMessage(row)
    if (err) {
      out.push(
        [domain, "ERROR", err, monthly, annual].map(csvEscape).join(","),
      )
      return
    }
    const techs = techsOf(row).filter((t) => techName(t))
    if (!techs.length) {
      out.push([domain, "", "(none)", monthly, annual].map(csvEscape).join(","))
      return
    }
    for (const t of techs) {
      out.push(
        [domain, techCategory(t), techName(t), monthly, annual]
          .map(csvEscape)
          .join(","),
      )
    }
  })
  return out.join("\n") + "\n"
}

/** Names-only (legacy simple list), good for grep. */
export function formatLookupNames(
  rows: LookupResult[],
  labels?: string[],
): string {
  const lines: string[] = []
  rows.forEach((row, i) => {
    const label = labels?.[i] || domainOf(row, `item-${i + 1}`)
    const err = lookupErrorMessage(row)
    if (err) {
      lines.push(`${label}`)
      lines.push(`ERROR\t${err}`)
      return
    }
    const names = techsOf(row)
      .map(techName)
      .filter(Boolean)
    if (!names.length) {
      lines.push(label)
      lines.push("(none)")
      return
    }
    lines.push(label)
    for (const n of names) lines.push(n)
  })
  return lines.join("\n") + (lines.length ? "\n" : "")
}

export function formatLookup(
  rows: LookupResult[],
  format: OutputFormat,
  opts?: { namesOnly?: boolean; labels?: string[] },
): string {
  if (opts?.namesOnly) return formatLookupNames(rows, opts.labels)
  switch (format) {
    case "table":
      return formatLookupTable(rows, opts?.labels)
    case "csv":
      return formatLookupCsv(rows, opts?.labels)
    case "text":
    default:
      return formatLookupText(rows, opts?.labels)
  }
}

export function formatAccountText(info: AccountInfo): string {
  return (
    [
      `Email: ${info.email || "(unknown)"}`,
      `Name: ${info.name || "(unknown)"}`,
      `Credits remaining: ${info.credits_remaining}`,
      `Credits used: ${info.credits_used}`,
      `Credits limit: ${info.credits_limit}`,
    ].join("\n") + "\n"
  )
}

export function rowsFromBatch(
  batch: BatchLookupResult,
  domains: string[],
): LookupResult[] {
  if (Array.isArray(batch.results) && batch.results.length) return batch.results
  if (Array.isArray(batch as unknown as LookupResult[])) {
    return batch as unknown as LookupResult[]
  }
  return domains.map((d) => ({ domain: d, technologies: [] }))
}

export const HELP_TEXT = `TechLeads CLI (tlf / techleads)

Install
  npm i -g @techleads.fyi/api
  npx tlf -d example.com

Quick start
  tlf login
  tlf -d example.com
  tlf -d example.com,x.com --format table
  tlf -i domains.txt -o out.csv --format csv
  tlf -d example.com --json
  tlf -u

Lookup
  -d, --domains <list>   Comma-separated domains
  -i, --input <file>     One domain per line (# comments ok)
  -o, --output <file>    Write result to file (else stdout)
  bare domain            tlf example.com

Formats
  --format text|table|csv|json   Default: text (category + name + spend)
  --json                         Same as --format json (full API payload)
  --names                        Names only (no categories/spend)

Auth & account
  login                  Open browser, enter 6-char code
  logout                 Remove saved API key
  -u, whoami             Email, name, credits
  --key <apiKey>         Use this key (overrides env/config)

Config
  ~/.config/techleads/config.json
  TECHLEADS_API_KEY      Env API key
  Docs: https://techleads.fyi/developers?tab=npm
` as const
