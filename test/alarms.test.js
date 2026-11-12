import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function alarmFunctions() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('    const ALARM_LEAD_MS')
  const end = source.indexOf('    /* ---------- page ---------- */')
  assert.ok(start > 0 && end > start, 'alarm block exists')
  const code = source.slice(start, end)
  const window = { localStorage: { getItem: () => null, setItem: () => {} } }
  return new Function('window', code + '\nreturn { parseAlarm, alarmStamp, defaultAlarmDraft }')(window)
}

test('parses a reminder from the first line', async () => {
  const { parseAlarm } = await alarmFunctions()
  const alarm = parseAlarm('!!2026-11-13 09:00 交周报\n正文')
  assert.ok(alarm)
  assert.equal(alarm.note, '交周报')
  assert.equal(alarm.at, new Date(2026, 10, 13, 9, 0, 0, 0).getTime())
})

test('rejects invalid dates and reminders outside the first line', async () => {
  const { parseAlarm } = await alarmFunctions()
  assert.equal(parseAlarm('!!2026-02-31 09:00 x'), null)
  assert.equal(parseAlarm('!!2026-13-01 09:00 x'), null)
  assert.equal(parseAlarm('!!2026-11-13 25:00 x'), null)
  assert.equal(parseAlarm('hello!!2026-11-13 09:00'), null)
  assert.equal(parseAlarm('!!'), null)
})

test('formats a reminder stamp', async () => {
  const { alarmStamp, defaultAlarmDraft } = await alarmFunctions()
  assert.equal(alarmStamp('2026-11-13', '09:00', ' 交周报 '), '!!2026-11-13 09:00 交周报')
  const draft = defaultAlarmDraft(Date.UTC(2026, 10, 12, 12, 0, 0))
  assert.match(draft.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(draft.time, /^\d{2}:\d{2}$/)
})
