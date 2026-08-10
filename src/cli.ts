import { spawn } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { hostname, platform } from "node:os"
import { TechLeads, TechLeadsError } from "./client.js"
import {
  clearApiKey,
  configPath,
  defaultSiteUrl,
  resolveApiKey,
  saveConfig,
} from "./config.js"
import {
  HELP_TEXT,
  formatAccountText,
  formatLookup,
  lookupErrorMessage,
  rowsFromBatch,
  type OutputFormat,
} from "./format.js"

/** Exit codes: 0 ok, 1 generic, 2 auth, 5 API/lookup error, 7 bad input */
export const EXIT = {
  OK: 0,
  ERROR: 1,
  AUTH: 2,
  API: 5,
  USAGE: 7,
} as const

function parseArgs(argv: string[]) {
  const flags = {
    help: false,
    json: false,
    names: false,
    account: false,
    domains: "" as string,
    input: "" as string,
    output: "" as string,
    key: "" as string,
    format: "text" as OutputFormat,
    cmd: "" as string,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === "-h" || a === "--help" || a === "help") flags.help = true
    else if (a === "--json") {
      flags.json = true
      flags.format = "json"
    } else if (a === "--names") flags.names = true
    else if (a === "-u" || a === "whoami") flags.account = true
    else if (a === "-d" || a === "--domains") flags.domains = argv[++i] || ""
    else if (a === "-i" || a === "--input") flags.input = argv[++i] || ""
    else if (a === "-o" || a === "--output") flags.output = argv[++i] || ""
    else if (a === "--key") flags.key = argv[++i] || ""
    else if (a === "--format") {
      const v = (argv[++i] || "").toLowerCase()
      if (v !== "text" && v !== "table" && v !== "csv" && v !== "json") {
        throw Object.assign(new Error(`Invalid --format: ${v}\n\n${HELP_TEXT}`), {
          exitCode: EXIT.USAGE,
        })
      }
      flags.format = v
      if (v === "json") flags.json = true
    } else if (a === "login" || a === "logout" || a === "whoami") flags.cmd = a
    else if (!a.startsWith("-") && !flags.cmd && !flags.domains && !flags.input) {
      if (!flags.domains) flags.domains = a
    } else if (a.startsWith("-")) {
      throw Object.assign(new Error(`Unknown flag: ${a}\n\n${HELP_TEXT}`), {
        exitCode: EXIT.USAGE,
      })
    }
  }
  return flags
}

function collectDomains(flags: ReturnType<typeof parseArgs>): string[] {
  const out: string[] = []
  if (flags.domains) {
    out.push(
      ...flags.domains
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  }
  if (flags.input) {
    const text = readFileSync(flags.input, "utf8")
    out.push(
      ...text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("#")),
    )
  }
  const seen = new Set<string>()
  return out.filter((d) => {
    const k = d.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function writeOut(text: string, output?: string) {
  if (output) {
    writeFileSync(output, text)
    process.stderr.write(`Wrote ${output}\n`)
  } else {
    process.stdout.write(text)
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function openBrowser(url: string): boolean {
  try {
    const p = platform()
    if (p === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref()
      return true
    }
    if (p === "win32") {
      spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref()
      return true
    }
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref()
    return true
  } catch {
    return false
  }
}

async function deviceLogin(): Promise<void> {
  const site = defaultSiteUrl()
  const res = await fetch(`${site}/api/cli/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client: "tlf", host: hostname() }),
  })
  const data = (await res.json()) as {
    user_code?: string
    device_code?: string
    verification_uri?: string
    verification_uri_complete?: string
    interval?: number
    expires_in?: number
    error?: string
    message?: string
  }
  if (!res.ok || !data.device_code || !data.user_code) {
    throw Object.assign(
      new Error(data.message || data.error || "Failed to start login"),
      { exitCode: EXIT.ERROR },
    )
  }

  const verify =
    data.verification_uri_complete ||
    `${data.verification_uri || `${site}/cli/auth`}?session=${encodeURIComponent(data.device_code)}`

  process.stderr.write(`\nCode: ${data.user_code}\n`)
  const opened = openBrowser(verify)
  if (opened) {
    process.stderr.write(`Opened browser. If it did not open:\n  ${verify}\n`)
  } else {
    process.stderr.write(`Open: ${verify}\n`)
  }
  process.stderr.write("Enter the code in the browser, then approve.\nWaiting…\n")

  const intervalMs = Math.max(2, data.interval || 3) * 1000
  const deadline = Date.now() + (data.expires_in || 900) * 1000

  while (Date.now() < deadline) {
    await sleep(intervalMs)
    const poll = await fetch(
      `${site}/api/cli/device/token?device_code=${encodeURIComponent(data.device_code)}`,
      { headers: { Accept: "application/json" } },
    )
    const body = (await poll.json()) as {
      status?: string
      api_key?: string
      error?: string
      message?: string
      interval?: number
    }

    if (poll.status === 400 && body.error === "authorization_pending") continue
    if (poll.status === 400 && body.error === "slow_down") {
      await sleep(intervalMs)
      continue
    }
    if (poll.ok && body.api_key) {
      saveConfig({ apiKey: body.api_key, siteUrl: site })
      process.stderr.write(`Saved key → ${configPath()}\n`)
      return
    }
    if (body.error === "expired_token" || body.error === "access_denied") {
      throw Object.assign(new Error(body.message || body.error), {
        exitCode: EXIT.AUTH,
      })
    }
    if (!poll.ok && body.error !== "authorization_pending") {
      throw Object.assign(
        new Error(body.message || body.error || `Login failed (${poll.status})`),
        { exitCode: EXIT.ERROR },
      )
    }
  }
  throw Object.assign(new Error("Login timed out. Run tlf login again."), {
    exitCode: EXIT.AUTH,
  })
}

function formatPayload(
  flags: ReturnType<typeof parseArgs>,
  single: unknown | null,
  rows: import("./types.js").LookupResult[],
  batch: unknown | null,
  domains: string[],
): string {
  if (flags.format === "json" || flags.json) {
    const payload = single ?? batch ?? rows
    return JSON.stringify(payload, null, 2) + "\n"
  }
  return formatLookup(rows, flags.format, {
    namesOnly: flags.names,
    labels: domains,
  })
}

export async function runCli(argv: string[]): Promise<number> {
  let flags: ReturnType<typeof parseArgs>
  try {
    flags = parseArgs(argv)
  } catch (e) {
    const err = e as Error & { exitCode?: number }
    process.stderr.write((err.message || String(e)) + "\n")
    return err.exitCode ?? EXIT.USAGE
  }

  if (flags.help || (!argv.length && !flags.cmd)) {
    process.stdout.write(HELP_TEXT)
    return EXIT.OK
  }

  if (flags.cmd === "logout") {
    clearApiKey()
    process.stderr.write("Logged out.\n")
    return EXIT.OK
  }

  if (flags.cmd === "login") {
    await deviceLogin()
    return EXIT.OK
  }

  if (flags.cmd === "whoami") flags.account = true

  if (!resolveApiKey(flags.key || undefined)) {
    process.stderr.write("Not logged in. Run: tlf login\nOr set TECHLEADS_API_KEY / --key\n")
    return EXIT.AUTH
  }

  const client = new TechLeads({ apiKey: flags.key || undefined })

  if (flags.account) {
    const info = await client.account()
    writeOut(
      flags.json || flags.format === "json"
        ? JSON.stringify(info, null, 2) + "\n"
        : formatAccountText(info),
      flags.output || undefined,
    )
    return EXIT.OK
  }

  const domains = collectDomains(flags)
  if (!domains.length) {
    process.stderr.write(`No domains given.\n\n${HELP_TEXT}`)
    return EXIT.USAGE
  }

  if (domains.length === 1) {
    const result = await client.lookup(domains[0]!)
    writeOut(
      formatPayload(flags, result, [result], null, domains),
      flags.output || undefined,
    )
    return lookupErrorMessage(result) ? EXIT.API : EXIT.OK
  }

  const batch = await client.lookupBatch(domains)
  const rows = rowsFromBatch(batch, domains)
  writeOut(
    formatPayload(flags, null, rows, batch, domains),
    flags.output || undefined,
  )
  const anyErr =
    lookupErrorMessage(batch as import("./types.js").LookupResult) ||
    rows.some((r) => lookupErrorMessage(r))
  return anyErr ? EXIT.API : EXIT.OK
}

export { TechLeadsError }
