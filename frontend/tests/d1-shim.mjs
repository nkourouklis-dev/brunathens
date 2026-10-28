// Μικρός προσομοιωτής του Cloudflare D1 πάνω στο node:sqlite, για τοπικά τεστ χωρίς wrangler.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

class Statement {
  constructor(db, sql, params = []) {
    this.db = db
    this.sql = sql
    this.params = params
  }

  bind(...params) {
    return new Statement(this.db, this.sql, params)
  }

  exec() {
    const statement = this.db.prepare(this.sql)
    if (statement.columns().length > 0) {
      const rows = statement.all(...this.params)
      const changes = this.db.prepare('SELECT changes() AS c').get().c
      return { results: rows, success: true, meta: { changes } }
    }
    const result = statement.run(...this.params)
    return { results: [], success: true, meta: { changes: Number(result.changes) } }
  }

  async first() {
    return this.exec().results[0] ?? null
  }

  async all() {
    return this.exec()
  }

  async run() {
    return this.exec()
  }
}

export class D1Shim {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:')
  }

  applyFile(path) {
    this.sqlite.exec(readFileSync(path, 'utf8'))
  }

  prepare(sql) {
    return new Statement(this.sqlite, sql)
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN')
    try {
      const results = statements.map((statement) => statement.exec())
      this.sqlite.exec('COMMIT')
      return results
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }
}
