// Τεστ του API από άκρη σε άκρη (router → βάση), χωρίς δίκτυο:  node --test tests/
import test from 'node:test'
import assert from 'node:assert/strict'
import { D1Shim } from './d1-shim.mjs'
import { onRequest } from '../functions/api/[[path]].js'

const ORIGIN = 'https://kerdiseto.test'
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const db = new D1Shim()
db.applyFile(new URL('../../migrations/0100_kerdiseto_reset.sql', import.meta.url))
const env = { DB: db, LOYALTY_SECRET: 'test-secret-test-secret-123456', PLATFORM_ADMIN_KEY: 'platform-key', LOYALTY_DEV_CODES: '1', SELF_SIGNUP: '1' }

// Ένας «browser» με δικό του cookie jar.
function browser() {
  const jar = new Map()
  async function call(method, path, body, headers = {}) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    const request = new Request(`${ORIGIN}/api/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const response = await onRequest({ request, env, params: { path: path.split('?')[0].split('/') }, waitUntil: () => {} })
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = line.split('; ')
      const [name, ...value] = pair.split('=')
      if (attrs.includes('Max-Age=0')) jar.delete(name)
      else jar.set(name, value.join('='))
    }
    const type = response.headers.get('Content-Type') || ''
    const data = type.includes('json') ? await response.json() : await response.arrayBuffer()
    return { status: response.status, data, headers: response.headers }
  }
  return {
    get: (path) => call('GET', path),
    post: (path, body = {}) => call('POST', path, body),
    put: (path, body = {}) => call('PUT', path, body),
    patch: (path, body = {}) => call('PATCH', path, body),
    del: (path, body = {}) => call('DELETE', path, body),
    raw: call,
    jar,
  }
}

const inviteToken = (url) => url.split('/invite/')[1]

async function newBusiness(platform, name, ownerEmail) {
  const created = await platform.post('platform/businesses', { name, ownerName: 'Ιδιοκτήτης' })
  assert.equal(created.status, 201)
  const owner = browser()
  const accept = await owner.post(`invite/${inviteToken(created.data.inviteUrl)}/accept`, { name: 'Νίκος Ιδιοκτήτης', email: ownerEmail, password: 'kodikos-1234' })
  assert.equal(accept.status, 200)
  return { slug: created.data.business.slug, id: created.data.business.id, owner }
}

const platform = browser()
let a
let b

test('πλατφόρμα: λάθος κλειδί απορρίπτεται, σωστό μπαίνει', async () => {
  assert.equal((await browser().post('platform/login', { key: 'lathos' })).status, 401)
  assert.equal((await browser().get('platform/businesses')).status, 401)
  assert.equal((await platform.post('platform/login', { key: 'platform-key' })).status, 200)
  assert.equal((await platform.get('platform/businesses')).status, 200)
})

test('δημιουργία επιχείρησης + πρόσκληση ιδιοκτήτη (μίας χρήσης)', async () => {
  const created = await platform.post('platform/businesses', { name: 'Καφέ Αθήνα', ownerName: 'Μαρία' })
  assert.equal(created.status, 201)
  assert.equal(created.data.business.slug, 'kafe-athina')
  const token = inviteToken(created.data.inviteUrl)

  const info = await browser().get(`invite/${token}`)
  assert.equal(info.status, 200)
  assert.equal(info.data.invitation.role, 'owner')
  assert.equal(info.data.business.name, 'Καφέ Αθήνα')

  const owner = browser()
  assert.equal((await owner.post(`invite/${token}/accept`, { name: 'Μ', email: 'x@y.gr', password: 'kodikos-1234' })).status, 400) // πολύ σύντομο όνομα
  assert.equal((await owner.post(`invite/${token}/accept`, { name: 'Μαρία', email: 'maria@kafe.gr', password: 'short' })).status, 400)
  assert.equal((await owner.post(`invite/${token}/accept`, { name: 'Μαρία', email: 'maria@kafe.gr', password: 'kodikos-1234' })).status, 200)

  // δεύτερη χρήση του ίδιου link
  assert.equal((await browser().post(`invite/${token}/accept`, { name: 'Άλλος', email: 'allos@kafe.gr', password: 'kodikos-1234' })).status, 404)
  assert.equal((await browser().get(`invite/${token}`)).status, 404)

  const me = await owner.get('b/kafe-athina/team/me')
  assert.equal(me.status, 200)
  assert.equal(me.data.identity.role, 'owner')
  a = { slug: 'kafe-athina', id: created.data.business.id, owner }

  b = await newBusiness(platform, 'Γυμναστήριο North', 'owner@north.gr')
  assert.equal(b.slug, 'gymnastirio-north')
})

test('ρυθμίσεις: branding, λογότυπο, δώρα, κανόνες (μόνο ιδιοκτήτης)', async () => {
  const bad = await a.owner.put('b/kafe-athina/team/settings', { color: 'red' })
  assert.equal(bad.status, 400)
  const svg = await a.owner.put('b/kafe-athina/team/settings', { logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
  assert.equal(svg.status, 400)
  const fake = await a.owner.put('b/kafe-athina/team/settings', { logo: 'data:image/png;base64,AAAAAAAA' })
  assert.equal(fake.status, 400)

  const ok = await a.owner.put('b/kafe-athina/team/settings', {
    name: 'Καφέ Αθήνα', tagline: 'Ο καφές της γειτονιάς', color: '#8b5a2b', icon: 'coffee', logo: PNG_1PX,
    pointsPerVisit: 1, maxPointsPerScan: 3, scanCooldownSeconds: 60, unitOne: 'σφραγίδα', unitMany: 'σφραγίδες', cardStyle: 'stamps', welcomePoints: 1,
  })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.business.color, '#8b5a2b')
  assert.equal(ok.data.business.hasLogo, true)

  assert.equal((await a.owner.post('b/kafe-athina/team/rewards', { name: 'Δωρεάν καφές', cost: 5, icon: 'coffee' })).status, 200)
  const second = await a.owner.post('b/kafe-athina/team/rewards', { name: 'Κέικ', cost: 8, icon: 'cake' })
  assert.equal(second.data.business.rewards.length, 2)
  assert.equal((await a.owner.post('b/kafe-athina/team/rewards', { name: 'x', cost: 0 })).status, 400)

  const pub = await browser().get('b/kafe-athina')
  assert.equal(pub.status, 200)
  assert.equal(pub.data.business.rewards.length, 2)
  assert.equal(pub.data.business.name, 'Καφέ Αθήνα')
  assert.equal(pub.data.business.unitMany, 'σφραγίδες')
  assert.equal(pub.data.business.signupMode, 'open')

  const logo = await browser().get('b/kafe-athina/logo')
  assert.equal(logo.status, 200)
  assert.equal(logo.headers.get('Content-Type'), 'image/png')
  const icon = await browser().get('b/gymnastirio-north/icon.png?size=192')
  assert.equal(icon.status, 200)
  assert.equal(new Uint8Array(icon.data)[1], 0x50) // PNG μαγικός αριθμός
  const manifest = await browser().get('b/kafe-athina/manifest')
  assert.equal(manifest.data.theme_color, '#8b5a2b')
  assert.equal(manifest.data.start_url, '/b/kafe-athina')
})

test('προσκλήσεις ταμία: PIN μοναδικό, ρόλοι, ανάκληση', async () => {
  const invite = await a.owner.post('b/kafe-athina/team/invitations', { role: 'staff', label: 'Γιώργος' })
  assert.equal(invite.status, 200)
  const token = inviteToken(invite.data.invitation.url)
  const staff = browser()
  assert.equal((await staff.post(`invite/${token}/accept`, { name: 'Γιώργος', pin: '12ab56' })).status, 400)
  assert.equal((await staff.post(`invite/${token}/accept`, { name: 'Γιώργος', pin: '123456' })).status, 200)

  const second = await a.owner.post('b/kafe-athina/team/invitations', { role: 'staff' })
  const duplicate = await browser().post(`invite/${inviteToken(second.data.invitation.url)}/accept`, { name: 'Ελένη', pin: '123456' })
  assert.equal(duplicate.status, 409)
  // η αποτυχημένη αποδοχή δεν «καίει» την πρόσκληση
  const retry = await browser().post(`invite/${inviteToken(second.data.invitation.url)}/accept`, { name: 'Ελένη', pin: '654321' })
  assert.equal(retry.status, 200)

  const revoked = await a.owner.post('b/kafe-athina/team/invitations', { role: 'manager' })
  await a.owner.del(`b/kafe-athina/team/invitations/${revoked.data.invitation.id}`)
  assert.equal((await browser().get(`invite/${inviteToken(revoked.data.invitation.url)}`)).status, 404)

  // σύνδεση ταμία με PIN
  const cashier = browser()
  assert.equal((await cashier.post('b/kafe-athina/team/login', { pin: '999999' })).status, 401)
  assert.equal((await cashier.post('b/kafe-athina/team/login', { pin: '123456' })).status, 200)
  assert.equal((await cashier.get('b/kafe-athina/team/me')).data.identity.role, 'staff')
  // το PIN δεν ισχύει σε άλλη επιχείρηση
  assert.equal((await browser().post('b/gymnastirio-north/team/login', { pin: '123456' })).status, 401)
  a.cashier = cashier
})

test('ρόλοι: το ταμείο δεν βλέπει πελάτες/ρυθμίσεις, ο υπεύθυνος δεν αλλάζει ρυθμίσεις', async () => {
  assert.equal((await a.cashier.get('b/kafe-athina/team/members')).status, 403)
  assert.equal((await a.cashier.get('b/kafe-athina/team/stats')).status, 403)
  assert.equal((await a.cashier.put('b/kafe-athina/team/settings', { name: 'Χακαρισμένο' })).status, 403)
  assert.equal((await a.cashier.post('b/kafe-athina/team/invitations', { role: 'staff' })).status, 403)
  assert.equal((await browser().get('b/kafe-athina/team/me')).status, 401)

  const invite = await a.owner.post('b/kafe-athina/team/invitations', { role: 'manager' })
  const manager = browser()
  assert.equal((await manager.post(`invite/${inviteToken(invite.data.invitation.url)}/accept`, { name: 'Υπεύθυνος', email: 'yp@kafe.gr', password: 'kodikos-1234' })).status, 200)
  assert.equal((await manager.get('b/kafe-athina/team/members')).status, 200)
  assert.equal((await manager.put('b/kafe-athina/team/settings', { name: 'Χ' })).status, 403)
  assert.equal((await manager.post('b/kafe-athina/team/invitations', { role: 'manager' })).status, 403)
  assert.equal((await manager.post('b/kafe-athina/team/invitations', { role: 'staff' })).status, 200)
  a.manager = manager

  const login = browser()
  assert.equal((await login.post('b/kafe-athina/team/login', { email: 'yp@kafe.gr', password: 'lathos-kodikos' })).status, 401)
  assert.equal((await login.post('b/kafe-athina/team/login', { email: 'yp@kafe.gr', password: 'kodikos-1234' })).status, 200)
})

test('πελάτης: εγγραφή από link, πόντοι καλωσορίσματος, διπλό email', async () => {
  const customer = browser()
  assert.equal((await customer.post('b/kafe-athina/join', { name: 'Άννα', email: 'anna@example.com', terms: false })).status, 400)
  const joined = await customer.post('b/kafe-athina/join', { name: 'Άννα', email: 'anna@example.com', terms: true })
  assert.equal(joined.status, 200)
  assert.equal(joined.data.member.points, 1) // welcomePoints = 1
  assert.equal((await browser().post('b/kafe-athina/join', { name: 'Άννα 2', email: 'ANNA@example.com', terms: true })).status, 409)
  assert.equal((await customer.get('b/kafe-athina/me')).data.member.name, 'Άννα')
  assert.equal((await customer.get('b/kafe-athina/qr')).status, 200)
  a.customer = customer

  // ο πελάτης της μίας επιχείρησης δεν είναι συνδεδεμένος στην άλλη, ακόμη και με το ίδιο email
  assert.equal((await customer.get('b/gymnastirio-north/me')).status, 401)
  assert.equal((await customer.post('b/gymnastirio-north/join', { name: 'Άννα', email: 'anna@example.com', terms: true })).status, 200)
})

test('τρόποι εγγραφής: code και closed', async () => {
  const settings = await a.owner.get('b/kafe-athina/team/me')
  const joinCode = settings.data.business.joinCode
  await a.owner.put('b/kafe-athina/team/settings', { signupMode: 'code' })
  assert.equal((await browser().post('b/kafe-athina/join', { name: 'Βασίλης', email: 'v@example.com', terms: true })).status, 403)
  assert.equal((await browser().post('b/kafe-athina/join', { name: 'Βασίλης', email: 'v@example.com', terms: true, code: 'lathos' })).status, 403)
  assert.equal((await browser().post('b/kafe-athina/join', { name: 'Βασίλης', email: 'v@example.com', terms: true, code: joinCode })).status, 200)

  const rotated = await a.owner.post('b/kafe-athina/team/join-code')
  assert.notEqual(rotated.data.business.joinCode, joinCode)
  assert.equal((await browser().post('b/kafe-athina/join', { name: 'Κώστας', email: 'k@example.com', terms: true, code: joinCode })).status, 403) // το παλιό link δεν δουλεύει

  await a.owner.put('b/kafe-athina/team/settings', { signupMode: 'closed' })
  assert.equal((await browser().post('b/kafe-athina/join', { name: 'Κώστας', email: 'k@example.com', terms: true, code: rotated.data.business.joinCode })).status, 403)
  await a.owner.put('b/kafe-athina/team/settings', { signupMode: 'open' })
})

test('ταμείο: σάρωση QR, πόντοι, cooldown, εξαργύρωση, αναίρεση', async () => {
  const qr = (await a.customer.get('b/kafe-athina/qr')).data.token
  const lookup = await a.cashier.post('b/kafe-athina/team/lookup', { code: qr })
  assert.equal(lookup.status, 200)
  assert.equal(lookup.data.member.points, 1)

  const earn = await a.cashier.post('b/kafe-athina/team/earn', { ticket: lookup.data.ticket, points: 2 })
  assert.equal(earn.status, 200)
  assert.equal(earn.data.member.points, 3)
  // το ίδιο εισιτήριο δεν δίνει πόντους δεύτερη φορά
  assert.equal((await a.cashier.post('b/kafe-athina/team/earn', { ticket: lookup.data.ticket, points: 1 })).status, 409)
  assert.equal((await a.cashier.post('b/kafe-athina/team/earn', { ticket: lookup.data.ticket + 'x', points: 1 })).status, 400)

  // νέα σάρωση αμέσως μετά: cooldown, εκτός αν επιβεβαιωθεί
  const again = await a.cashier.post('b/kafe-athina/team/lookup', { code: (await a.customer.get('b/kafe-athina/qr')).data.token })
  const blocked = await a.cashier.post('b/kafe-athina/team/earn', { ticket: again.data.ticket })
  assert.equal(blocked.status, 409)
  assert.equal(blocked.data.error, 'Recent earn')
  const forced = await a.cashier.post('b/kafe-athina/team/earn', { ticket: again.data.ticket, force: true, points: 3 })
  assert.equal(forced.data.member.points, 6)
  assert.equal((await a.cashier.post('b/kafe-athina/team/earn', { ticket: again.data.ticket, points: 99, force: true })).status, 400) // πάνω από το όριο

  // εξαργύρωση: 6 πόντοι, δώρο των 5
  const redeemLookup = await a.cashier.post('b/kafe-athina/team/lookup', { code: (await a.customer.get('b/kafe-athina/qr')).data.token })
  const rewards = redeemLookup.data.member.rewards
  const cake = rewards.find((reward) => reward.name === 'Κέικ')
  const coffee = rewards.find((reward) => reward.name === 'Δωρεάν καφές')
  assert.equal(cake.affordable, false)
  assert.equal((await a.cashier.post('b/kafe-athina/team/redeem', { ticket: redeemLookup.data.ticket, rewardId: cake.id })).status, 409)
  const redeemed = await a.cashier.post('b/kafe-athina/team/redeem', { ticket: redeemLookup.data.ticket, rewardId: coffee.id })
  assert.equal(redeemed.status, 200)
  assert.equal(redeemed.data.member.points, 1)

  // ο πελάτης βλέπει την κίνηση
  const card = await a.customer.get('b/kafe-athina/me')
  assert.equal(card.data.member.points, 1)
  assert.equal(card.data.member.rewardsRedeemed, 1)
  assert.ok(card.data.transactions.some((tx) => tx.kind === 'redeem' && tx.rewardName === 'Δωρεάν καφές'))

  // αναίρεση της εξαργύρωσης
  const undo = await a.cashier.post('b/kafe-athina/team/undo', { transactionId: redeemed.data.transactionId })
  assert.equal(undo.data.member.points, 6)
  assert.equal((await a.cashier.post('b/kafe-athina/team/undo', { transactionId: redeemed.data.transactionId })).status, 409)

  // χειροκίνητος αριθμός κάρτας
  const manual = await a.cashier.post('b/kafe-athina/team/lookup', { code: card.data.member.cardNumber.toLowerCase() })
  assert.equal(manual.status, 200)
  assert.equal(manual.data.source, 'manual')
})

test('απομόνωση επιχειρήσεων: ούτε QR, ούτε cookies, ούτε ticket περνούν σε άλλη επιχείρηση', async () => {
  const qr = (await a.customer.get('b/kafe-athina/qr')).data.token
  const cardNumber = (await a.customer.get('b/kafe-athina/me')).data.member.cardNumber

  // ταμίας/ιδιοκτήτης της Β σκανάρει κάρτα της Α
  assert.equal((await b.owner.post('b/gymnastirio-north/team/lookup', { code: qr })).status, 404)
  assert.equal((await b.owner.post('b/gymnastirio-north/team/lookup', { code: cardNumber })).status, 404)

  // cookie ομάδας της Α δεν ισχύει στη Β (ούτε αν αλλάξει το όνομα του cookie)
  const stolen = browser()
  stolen.jar.set('kt_gymnastirio-north', a.cashier.jar.get('kt_kafe-athina'))
  assert.equal((await stolen.get('b/gymnastirio-north/team/me')).status, 401)

  // εισιτήριο σάρωσης της Α δεν δουλεύει στη Β
  const lookup = await a.cashier.post('b/kafe-athina/team/lookup', { code: qr })
  assert.equal((await b.owner.post('b/gymnastirio-north/team/earn', { ticket: lookup.data.ticket })).status, 400)

  // η λίστα πελατών της Β δεν περιέχει πελάτες της Α
  const members = await b.owner.get('b/gymnastirio-north/team/members')
  assert.equal(members.data.members.length, 1)
  assert.equal(members.data.members[0].email, 'anna@example.com') // η δική της κάρτα στη Β
  assert.equal((await b.owner.get(`b/gymnastirio-north/team/members/${(await a.manager.get('b/kafe-athina/team/members')).data.members[0].id}`)).status, 404)
})

test('στατιστικά, ιστορικό, διόρθωση πόντων από υπεύθυνο', async () => {
  const stats = await a.manager.get('b/kafe-athina/team/stats')
  assert.equal(stats.status, 200)
  assert.ok(stats.data.stats.total >= 2)
  assert.ok(stats.data.stats.visits30 >= 2)

  const members = await a.manager.get('b/kafe-athina/team/members?q=anna')
  assert.equal(members.data.members.length, 1)
  const id = members.data.members[0].id
  const adjusted = await a.manager.post(`b/kafe-athina/team/members/${id}/adjust`, { delta: -100 })
  assert.equal(adjusted.status, 409) // δεν γίνεται αρνητικό υπόλοιπο
  const plus = await a.manager.post(`b/kafe-athina/team/members/${id}/adjust`, { delta: 4, note: 'ξέχασε την κάρτα' })
  assert.equal(plus.data.member.points, 10)
  const detail = await a.manager.get(`b/kafe-athina/team/members/${id}`)
  assert.ok(detail.data.transactions.length >= 5)
  const activity = await a.cashier.get('b/kafe-athina/team/activity')
  assert.ok(activity.data.transactions.length >= 5)
})

test('ανενεργός ταμίας αποσυνδέεται αμέσως, σύνδεση πελάτη με κωδικό email, διαγραφή λογαριασμού', async () => {
  const team = (await a.owner.get('b/kafe-athina/team/staff')).data.team
  const george = team.find((member) => member.name === 'Γιώργος')
  assert.equal((await a.owner.patch(`b/kafe-athina/team/staff/${george.id}`, { active: false })).status, 200)
  assert.equal((await a.cashier.get('b/kafe-athina/team/me')).status, 401)
  assert.equal((await browser().post('b/kafe-athina/team/login', { pin: '123456' })).status, 401)

  const device = browser()
  const requested = await device.post('b/kafe-athina/login/request', { email: 'anna@example.com' })
  assert.equal(requested.status, 200)
  assert.equal((await device.post('b/kafe-athina/login/verify', { email: 'anna@example.com', code: '000000' })).status, 400)
  const verified = await device.post('b/kafe-athina/login/verify', { email: 'anna@example.com', code: requested.data.devCode })
  assert.equal(verified.status, 200)
  assert.equal(verified.data.member.name, 'Άννα')

  assert.equal((await device.del('b/kafe-athina/me')).status, 200)
  assert.equal((await a.customer.get('b/kafe-athina/me')).status, 401)
  // το ίδιο email μπορεί να ξαναεγγραφεί
  assert.equal((await browser().post('b/kafe-athina/join', { name: 'Άννα', email: 'anna@example.com', terms: true })).status, 200)
})

test('προστασία CSRF και αναστολή επιχείρησης', async () => {
  const cross = await b.owner.raw('PUT', 'b/gymnastirio-north/team/settings', { name: 'Hack' }, { Origin: 'https://evil.example' })
  assert.equal(cross.status, 403)
  const crossSite = await b.owner.raw('POST', 'b/gymnastirio-north/team/logout', {}, { 'Sec-Fetch-Site': 'cross-site' })
  assert.equal(crossSite.status, 403)

  assert.equal((await platform.patch(`platform/businesses/${b.id}`, { status: 'suspended' })).status, 200)
  assert.equal((await browser().get('b/gymnastirio-north')).status, 404)
  assert.equal((await b.owner.get('b/gymnastirio-north/team/me')).status, 404)
  await platform.patch(`platform/businesses/${b.id}`, { status: 'active' })
  assert.equal((await b.owner.get('b/gymnastirio-north/team/me')).status, 200)
})

test('self-signup και διαγραφή επιχείρησης από την πλατφόρμα', async () => {
  const signup = browser()
  const created = await signup.post('signup', { businessName: 'Κομμωτήριο Νέα', ownerName: 'Ελένη', email: 'eleni@komotirio.gr', password: 'kodikos-1234' })
  assert.equal(created.status, 201)
  assert.equal((await signup.get(`b/${created.data.slug}/team/me`)).data.identity.role, 'owner')

  const list = await platform.get('platform/businesses')
  const target = list.data.businesses.find((business) => business.slug === created.data.slug)
  assert.equal((await platform.del(`platform/businesses/${target.id}`, { confirm: 'lathos' })).status, 400)
  assert.equal((await platform.del(`platform/businesses/${target.id}`, { confirm: target.slug })).status, 200)
  assert.equal((await browser().get(`b/${created.data.slug}`)).status, 404)

  // support: άνοιγμα ως ιδιοκτήτης
  const opened = browser()
  const open = await platform.post(`platform/businesses/${a.id}/open`)
  assert.equal(open.status, 200)
  assert.equal(open.data.slug, 'kafe-athina')
})
