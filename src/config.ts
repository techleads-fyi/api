import { homedir } from "node:os"
import { join } from "node:path"
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs"

export type TechLeadsConfig = {
  apiKey?: string
  baseUrl?: string
  siteUrl?: string
}

export function configDir(): string {
  return join(homedir(), ".config", "techleads")
}

export function configPath(): string {
  return join(configDir(), "config.json")
}

export function loadConfig(): TechLeadsConfig {
  const path = configPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, "utf8")) as TechLeadsConfig
  } catch {
    return {}
  }
}

export function saveConfig(cfg: TechLeadsConfig): void {
  mkdirSync(configDir(), { recursive: true })
  const next = { ...loadConfig(), ...cfg }
  writeFileSync(configPath(), JSON.stringify(next, null, 2) + "\n", { mode: 0o600 })
}

export function clearApiKey(): void {
  const cfg = loadConfig()
  delete cfg.apiKey
  mkdirSync(configDir(), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 })
}

export function resolveApiKey(explicit?: string): string | undefined {
  return (
    explicit?.trim() ||
    process.env.TECHLEADS_API_KEY?.trim() ||
    loadConfig().apiKey?.trim() ||
    undefined
  )
}

export function defaultBaseUrl(): string {
  return (
    process.env.TECHLEADS_API_BASE?.replace(/\/$/, "") ||
    loadConfig().baseUrl?.replace(/\/$/, "") ||
    "https://techleads.fyi/api/v3"
  )
}

export function defaultSiteUrl(): string {
  return (
    process.env.TECHLEADS_SITE_URL?.replace(/\/$/, "") ||
    loadConfig().siteUrl?.replace(/\/$/, "") ||
    "https://techleads.fyi"
  )
}

export function removeConfigFile(): void {
  const path = configPath()
  if (existsSync(path)) unlinkSync(path)
}
