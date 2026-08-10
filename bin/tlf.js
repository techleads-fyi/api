#!/usr/bin/env node
import { runCli, TechLeadsError, EXIT } from "../dist/cli.js"

runCli(process.argv.slice(2))
  .then((code) => {
    process.exit(code)
  })
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(msg + "\n")
    if (err instanceof TechLeadsError && (err.status === 401 || err.status === 403)) {
      process.exit(EXIT.AUTH)
    }
    const code =
      err && typeof err === "object" && "exitCode" in err
        ? Number(err.exitCode)
        : EXIT.ERROR
    process.exit(Number.isFinite(code) ? code : EXIT.ERROR)
  })
