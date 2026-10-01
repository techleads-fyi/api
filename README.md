# @techleads.fyi/api

TechLeads technology lookup — SDK + CLI (`tlf` / `techleads`).

<div align="center">
  <a href="https://www.youtube.com/watch?v=AwCPIHtWDMw" target="_blank">
    <img src="https://youtube.com" alt="How to Build GTM Workflow with Technographics Using the TechLeads API" width="600" style="border-radius: 8px;" />
  </a>
  <p><em>🎥 Click above to watch the full TechLeads workflow tutorial!</em></p>
</div>

## Install

```bash
npm i @techleads.fyi/api
# global CLI
npm i -g @techleads.fyi/api
# or one-off
npx tlf -d example.com
```

## SDK

```ts
import { TechLeads } from '@techleads.fyi/api'

const tl = new TechLeads({ apiKey: process.env.TECHLEADS_API_KEY })
const r = await tl.lookup('example.com')
console.log(r.technologies)

const batch = await tl.lookupBatch(['shopify.com', 'stripe.com'])
const account = await tl.account()
```

## CLI

```bash
tlf login
tlf -d example.com
tlf -d example.com,x.com --format table
tlf -i domains.txt -o out.csv --format csv
tlf -d example.com --json
tlf -d example.com --names
tlf -u
tlf -h
```

Default text output: domain, then `category` + tech name (no confidence/version), plus spend when available.

| Flag | Meaning |
|------|---------|
| `-d` / `--domains` | Comma-separated domains |
| `-i` / `--input` | File, one domain per line |
| `-o` / `--output` | Write to file |
| `--format text\|table\|csv\|json` | Output format (default `text`) |
| `--json` | Same as `--format json` |
| `--names` | Names only |
| `--key` | API key override |
| `-u` / `whoami` | Account + credits |

Config: `~/.config/techleads/config.json` or `TECHLEADS_API_KEY`.

Docs: https://techleads.fyi/developers?tab=npm

## Development

```bash
git clone git@github.com:techleads-fyi/api.git
cd api
npm i
npm run build
node bin/tlf.js -h
```

Publish (maintainers): `npm publish --access public` (runs `prepublishOnly` → `tsc`).
