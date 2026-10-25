// One-off setup for kerdiseto.pages.dev. Run from the frontend folder:  node ../deploy-kerdiseto.mjs
// Migrates the shared DB, sets the two secrets (values never printed), builds and deploys.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PROJECT = 'kerdiseto'
const run = (command, { input, quiet = false } = {}) => {
  const result = spawnSync(command, { shell: true, input, encoding: 'utf8' })
  if (!quiet) process.stdout.write(result.stdout || '')
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '')
    console.error(`\nFAILED: ${command}`)
    process.exit(1)
  }
  return result.stdout || ''
}
const step = (text) => console.log(`\n=== ${text}`)

step('1/5 Migration 0014 on cafe-orders-db (production)')
const migration = run('npx wrangler d1 execute cafe-orders-db --remote --file ../worker/migrations/0014_tenants.sql', { quiet: true })
console.log(/commands executed successfully/.test(migration) ? 'OK' : migration.slice(-400))
console.log(run('npx wrangler d1 execute cafe-orders-db --remote --command "SELECT (SELECT COUNT(*) FROM tenants) AS tenants, (SELECT COUNT(*) FROM loyalty_members WHERE tenant_id = 1) AS members, (SELECT COUNT(*) FROM loyalty_transactions WHERE tenant_id = 1) AS transactions"', { quiet: true }).match(/"(tenants|members|transactions)": \d+/g)?.join('\n'))

step('2/5 Secrets')
const existing = run(`npx wrangler pages secret list --project-name=${PROJECT}`, { quiet: true })
if (!existing.includes('LOYALTY_SECRET')) {
  run(`npx wrangler pages secret put LOYALTY_SECRET --project-name=${PROJECT}`, { input: randomBytes(32).toString('base64url'), quiet: true })
  console.log('LOYALTY_SECRET created')
} else console.log('LOYALTY_SECRET already set, left alone')
const keyFile = join(homedir(), 'kerdiseto-platform-key.txt')
if (!existing.includes('ADMIN_ACCESS_KEY')) {
  const platformKey = randomBytes(18).toString('base64url')
  writeFileSync(keyFile, platformKey + '\n')
  run(`npx wrangler pages secret put ADMIN_ACCESS_KEY --project-name=${PROJECT}`, { input: platformKey, quiet: true })
  console.log(`ADMIN_ACCESS_KEY created. Your platform password is saved in: ${keyFile}`)
} else console.log(`ADMIN_ACCESS_KEY already set${existsSync(keyFile) ? ` (password in ${keyFile})` : ''}`)

step('3/5 Build')
run('npm run build', { quiet: true })
console.log('OK')

step('4/5 Deploy')
console.log(run(`npx wrangler pages deploy dist --project-name ${PROJECT} --branch master --commit-dirty=true`, { quiet: true }).split('\n').filter((line) => /https:|Success|Deployment/.test(line)).join('\n'))

step('5/5 Check')
await new Promise((resolve) => setTimeout(resolve, 8000))
for (const path of ['/api/loyalty/config?t=brun', '/brun', '/platform']) {
  const response = await fetch(`https://${PROJECT}.pages.dev${path}`).catch(() => null)
  console.log(`${response ? response.status : 'no response'}  ${path}`)
}
console.log('\nDone. Open https://kerdiseto.pages.dev/platform and sign in with the password from the file above.')
