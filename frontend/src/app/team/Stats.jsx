import { useCallback, useEffect, useState } from 'react'
import { api, friendlyError } from '../api.js'
import { Notice, Spinner, useToast } from '../ui.jsx'
import { ActivityList } from './shared.jsx'

function lastDays(series, count = 14) {
  const byDay = new Map(series.map((row) => [row.day, row.visits]))
  const days = []
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 86_400_000)
    const key = date.toISOString().slice(0, 10)
    days.push({ key, label: date.toLocaleDateString('el-GR', { day: 'numeric', month: 'numeric' }), visits: byDay.get(key) || 0 })
  }
  return days
}

export default function Stats({ me }) {
  const { business, identity } = me
  const [stats, setStats] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [error, setError] = useState('')
  const [toast, toastNode] = useToast()

  const load = useCallback(async () => {
    try {
      const [statsData, activity] = await Promise.all([api(`b/${business.slug}/team/stats`), api(`b/${business.slug}/team/activity`)])
      setStats(statsData.stats)
      setTransactions(activity.transactions)
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [business.slug])

  useEffect(() => { load() }, [load])

  const undo = async (tx) => {
    try {
      await api(`b/${business.slug}/team/undo`, { method: 'POST', body: { transactionId: tx.id } })
      toast('Η κίνηση αναιρέθηκε')
      load()
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  if (!stats) return <div className="tab-content">{error ? <Notice kind="error">{error}</Notice> : <Spinner />}</div>

  const days = lastDays(stats.series)
  const peak = Math.max(1, ...days.map((day) => day.visits))
  const tiles = [
    ['Πελάτες', stats.total, `+${stats.new7} την εβδομάδα`],
    ['Επισκέψεις σήμερα', stats.visitsToday, `${stats.visits7} την εβδομάδα`],
    ['Επισκέψεις 30 ημερών', stats.visits30, `${stats.active30} διαφορετικοί πελάτες`],
    ['Δώρα 30 ημερών', stats.redeemed30, `${stats.points30} ${business.unitMany} δόθηκαν`],
  ]

  return (
    <div className="tab-content">
      <div className="tiles">
        {tiles.map(([label, value, hint]) => (
          <div className="tile" key={label}><small>{label}</small><strong>{value}</strong><span>{hint}</span></div>
        ))}
      </div>

      <section className="panel">
        <h2>Επισκέψεις τις τελευταίες 14 μέρες</h2>
        <div className="chart" role="img" aria-label="Επισκέψεις ανά ημέρα">
          {days.map((day) => (
            <div className="chart-col" key={day.key} title={`${day.label}: ${day.visits}`}>
              <span className="chart-value">{day.visits || ''}</span>
              <span className="chart-bar" style={{ height: `${(day.visits / peak) * 100}%` }} />
              <small>{day.label}</small>
            </div>
          ))}
        </div>
      </section>

      {stats.top.length ? (
        <section className="panel">
          <h2>Πιο πιστοί πελάτες</h2>
          <ol className="top-list">
            {stats.top.map((member) => (
              <li key={member.id}><strong>{member.name}</strong><span>{member.visits} επισκέψεις · {member.points} {business.unitMany}</span></li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="panel">
        <h2>Κινήσεις</h2>
        <ActivityList transactions={transactions} role={identity.role} onUndo={undo} />
      </section>
      {toastNode}
    </div>
  )
}
