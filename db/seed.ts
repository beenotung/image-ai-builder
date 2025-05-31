import { seedRow } from 'better-sqlite3-proxy'
import { proxy } from './proxy'

// This file serve like the knex seed file.
//
// You can setup the database with initial config and sample data via the db proxy.

seedRow(proxy.method, { method: 'GET' })
seedRow(proxy.method, { method: 'POST' })
seedRow(proxy.method, { method: 'ws' })

proxy.label[1] = {
  title: '🦞',
  dependency_id: null,
}
proxy.label[2] = {
  title: '🍜',
  dependency_id: null,
}
proxy.label[3] = {
  title: '💩',
  dependency_id: null,
}
proxy.label[4] = {
  title: '開尾',
  dependency_id: 1,
}
proxy.label[5] = {
  title: '舉鉗',
  dependency_id: 1,
}
