import { QA_CHECKS, QA_TABS } from './qaCatalog'
import { runQaCheck } from './qaSuite'

export const QA_STATUS = ['pass', 'fail', 'warn', 'manual', 'skip']

export function emptyCounts() {
  return { pass: 0, fail: 0, warn: 0, manual: 0, skip: 0, total: 0 }
}

export function countResults(results) {
  const counts = emptyCounts()
  for (const row of results || []) {
    const status = QA_STATUS.includes(row.status) ? row.status : 'manual'
    counts[status] += 1
    counts.total += 1
  }
  return counts
}

export function scorePercent(counts) {
  if (!counts?.total) return 0
  const scored = counts.pass + counts.fail + counts.warn
  if (!scored) return 0
  return Math.round((counts.pass / scored) * 100)
}

export function productionGate(results) {
  const rows = results || []
  const criticalFails = rows.filter((row) => row.severity === 'critical' && row.status === 'fail')
  const anyFail = rows.filter((row) => row.status === 'fail')
  const criticalWarn = rows.filter((row) => row.severity === 'critical' && row.status === 'warn')
  const coreManual = rows.filter((row) => (
    row.status === 'manual'
    && row.severity === 'critical'
    && (row.tab === 'security' || row.tab === 'integrity' || row.tab === 'financial' || row.tab === 'deployment')
  ))
  if (criticalFails.length) {
    return {
      id: 'not-ready',
      label: 'Not Ready',
      detail: `${criticalFails.length} critical check${criticalFails.length === 1 ? '' : 's'} failed.`,
    }
  }
  if (anyFail.length || criticalWarn.length || coreManual.length) {
    const bits = []
    if (anyFail.length) bits.push(`${anyFail.length} failed`)
    if (criticalWarn.length) bits.push(`${criticalWarn.length} critical warning${criticalWarn.length === 1 ? '' : 's'}`)
    if (coreManual.length) bits.push(`${coreManual.length} core check${coreManual.length === 1 ? '' : 's'} need manual verification`)
    return {
      id: 'warnings',
      label: 'Ready with Warnings',
      detail: bits.join('. ') + '.',
    }
  }
  const manuals = rows.filter((row) => row.status === 'manual')
  if (manuals.length) {
    return {
      id: 'warnings',
      label: 'Ready with Warnings',
      detail: `${manuals.length} check${manuals.length === 1 ? '' : 's'} still need manual verification.`,
    }
  }
  return {
    id: 'ready',
    label: 'Ready',
    detail: 'Critical security, integrity, and live checks passed.',
  }
}

export function summarizeQa(results) {
  const counts = countResults(results)
  const byTab = Object.fromEntries(QA_TABS.map((tab) => {
    const rows = (results || []).filter((row) => row.tab === tab.id)
    return [tab.id, { ...countResults(rows), score: scorePercent(countResults(rows)) }]
  }))
  return {
    counts,
    score: scorePercent(counts),
    gate: productionGate(results),
    byTab,
    ranAt: new Date().toISOString(),
  }
}

export async function runQaSuite({ restaurant, user, checks = QA_CHECKS, onProgress } = {}) {
  const started = Date.now()
  const results = []
  const ctx = { restaurant, user, cache: {}, timings: {} }
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index]
    let result
    try {
      result = await runQaCheck(check, ctx)
    } catch (error) {
      result = {
        status: 'fail',
        message: error?.message || 'Check threw an unexpected error.',
      }
    }
    const row = {
      id: check.id,
      tab: check.tab,
      title: check.title,
      detail: check.detail,
      severity: check.severity,
      kind: check.kind,
      status: result?.status || 'manual',
      message: result?.message || (result?.status === 'manual' ? 'Manual verification required' : ''),
      evidence: result?.evidence || '',
    }
    if (row.status === 'pass' && !row.message) row.message = 'Passed'
    if ((row.status === 'manual' || row.status === 'skip') && !row.message) {
      row.message = 'Manual verification required'
    }
    results.push(row)
    if (onProgress) onProgress(row, index + 1, checks.length)
  }
  const summary = summarizeQa(results)
  summary.durationMs = Date.now() - started
  return { results, summary }
}
