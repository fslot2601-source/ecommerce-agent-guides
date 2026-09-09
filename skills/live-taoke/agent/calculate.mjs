import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { calculate, sensitivity } from '../src/engine.ts'
import { structuralSettings, dependencies } from './availability.mjs'

const DEFAULT_PRODUCT_NAME = '待命名活动单品'
const ALLOWED_ROOT_KEYS = new Set(['productName', 'settings', 'scenarios'])
const ALLOWED_SETTINGS_KEYS = new Set([
  'scenario',
  'productName',
  'listPrice',
  'coupon',
  'units',
  'expectedUnits',
  'bomCost',
  'packagingCost',
  'shippingCost',
  'returnRate',
  'platformFeeRate',
  'taxMode',
  'taxRate',
  'paidTrafficShare',
  'roi',
  'commissionRate',
  'leaderFeeRate',
  'slotFee',
  'sampleCost',
])

function fail(message) {
  throw new Error(message)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 18)) fail('需要 Node.js 22.18 或更高版本。')
}

function assertNumber(value, location, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${location} 必须是有限数字。`)
  if (exclusiveMin ? value <= min : value < min) fail(`${location} 必须${exclusiveMin ? '大于' : '不小于'} ${min}。`)
  if (value > max) fail(`${location} 必须不大于 ${max}。`)
}

function assertOneOf(value, location, values) {
  if (!values.includes(value)) fail(`${location} 必须是 ${values.join('、')} 之一。`)
}

function validateSettings(settings, location = 'settings') {
  if (!isPlainObject(settings)) fail(`${location} 必须是对象。`)
  for (const key of Object.keys(settings)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) fail(`${location}.${key} 不是支持的设置项。`)
  }

  if (settings.scenario !== undefined) {
    assertOneOf(settings.scenario, `${location}.scenario`, ['selfPaid', 'influencerCommission', 'influencerSlot', 'taoke'])
  }
  if (settings.productName !== undefined) {
    if (typeof settings.productName !== 'string' || settings.productName.trim() === '') {
      fail(`${location}.productName 必须是非空字符串。`)
    }
  }

  if (settings.listPrice !== undefined) {
    assertNumber(settings.listPrice, `${location}.listPrice`, { min: 0, exclusiveMin: true })
  }
  if (settings.coupon !== undefined) {
    assertNumber(settings.coupon, `${location}.coupon`, { min: 0 })
    if (settings.listPrice !== undefined && settings.coupon > settings.listPrice) {
      fail(`${location}.coupon 必须不大于 ${location}.listPrice。`)
    }
  }

  if (settings.units !== undefined) {
    assertNumber(settings.units, `${location}.units`, { min: 0 })
    if (!Number.isInteger(settings.units)) fail(`${location}.units 必须是整数。`)
  }
  if (settings.expectedUnits !== undefined) {
    assertNumber(settings.expectedUnits, `${location}.expectedUnits`, { min: 1 })
    if (!Number.isInteger(settings.expectedUnits)) fail(`${location}.expectedUnits 必须是整数。`)
  }

  if (settings.bomCost !== undefined) assertNumber(settings.bomCost, `${location}.bomCost`, { min: 0 })
  if (settings.packagingCost !== undefined) assertNumber(settings.packagingCost, `${location}.packagingCost`, { min: 0 })
  if (settings.shippingCost !== undefined) assertNumber(settings.shippingCost, `${location}.shippingCost`, { min: 0 })

  if (settings.returnRate !== undefined) assertNumber(settings.returnRate, `${location}.returnRate`, { min: 0, max: 1 })
  if (settings.platformFeeRate !== undefined) assertNumber(settings.platformFeeRate, `${location}.platformFeeRate`, { min: 0, max: 1 })

  if (settings.taxMode !== undefined) assertOneOf(settings.taxMode, `${location}.taxMode`, ['inclusive', 'exclusive'])
  if (settings.taxRate !== undefined) assertNumber(settings.taxRate, `${location}.taxRate`, { min: 0, max: 1 })

  if (settings.paidTrafficShare !== undefined) {
    assertNumber(settings.paidTrafficShare, `${location}.paidTrafficShare`, { min: 0, max: 1 })
  }
  if (settings.roi !== undefined) {
    assertNumber(settings.roi, `${location}.roi`, { min: 0 })
  }

  // Prevent silent degenerate behavior where engine assumed ROI=1 if roi=0 and paidTrafficShare > 0
  const paidTrafficShare = settings.paidTrafficShare ?? 0
  if (paidTrafficShare > 0) {
    if (settings.roi === undefined) {
      // roi missing will be tracked by availability gate
    } else if (settings.roi <= 0.000001) {
      fail(`${location}.paidTrafficShare 大于 0 时，${location}.roi 必须大于 0.000001；原引擎在该数值阈值内退化为假定 ROI=1 或不计投流，不得静默沿用。`)
    }
  }

  if (settings.commissionRate !== undefined) assertNumber(settings.commissionRate, `${location}.commissionRate`, { min: 0, max: 1 })
  if (settings.leaderFeeRate !== undefined) assertNumber(settings.leaderFeeRate, `${location}.leaderFeeRate`, { min: 0, max: 1 })
  if (settings.slotFee !== undefined) assertNumber(settings.slotFee, `${location}.slotFee`, { min: 0 })
  if (settings.sampleCost !== undefined) assertNumber(settings.sampleCost, `${location}.sampleCost`, { min: 0 })
}

function parseScenarios(raw) {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) fail('scenarios 必须是数组。')

  return raw.map((scenario, index) => {
    const loc = `scenarios[${index}]`
    if (!isPlainObject(scenario)) fail(`${loc} 必须是对象。`)
    for (const key of Object.keys(scenario)) {
      if (key !== 'name' && key !== 'settings') fail(`${loc}.${key} 不是支持的字段。`)
    }
    const name = typeof scenario.name === 'string' && scenario.name.trim() !== '' ? scenario.name.trim() : `方案 ${index + 1}`
    const settings = scenario.settings === undefined ? {} : scenario.settings
    validateSettings(settings, `${loc}.settings`)
    return { name, settings }
  })
}

function parseInput(raw) {
  if (!isPlainObject(raw)) fail('输入 JSON 顶层必须是对象。')
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_ROOT_KEYS.has(key)) fail(`${key} 不是支持的输入字段。`)
  }

  let productName = DEFAULT_PRODUCT_NAME
  if (raw.productName !== undefined) {
    if (typeof raw.productName !== 'string' || raw.productName.trim() === '') fail('productName 必须是非空字符串。')
    productName = raw.productName.trim()
  }

  const settings = raw.settings === undefined ? {} : raw.settings
  validateSettings(settings, 'settings')

  const scenarios = parseScenarios(raw.scenarios)

  return { productName, settings, scenarios }
}

function replaceNonFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(replaceNonFinite)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceNonFinite(entry)]))
  }
  return value
}

function formatAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `¥${value.toFixed(2)}` : '不适用/不可达'
}

function formatPercent(value, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '不适用/不可达'
}

function formatUnits(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.ceil(value)} 件 (${value.toFixed(1)} 件)` : '不适用/不可达'
}

function tableText(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function buildAssumptions() {
  return [
    '销售收入以券后实付金额（listPrice - coupon）为基准；退款回吐按预计退货率计提准备。',
    '平台技术服务费、达人带货佣金、团长招商服务费与税金及附加均按券后实付金额全额计提；退款发生时，上述费用不作冲减回退。',
    'expectedUnits 仅用于固定投入（坑位费与样品成本）的单件分摊；units 用于整场实际成交件数、GMV、整场投流与整场总净利计算。',
    '整场总净利始终一次性扣除全部固定成本（slotFee + sampleCost）；当整场实际成交件数为零时，如实反映固定投入全额亏损。',
    '原引擎在 roi ≤ 0.000001 时存在假定 ROI = 1 或不计投流的退化行为；当付费流量占比大于 0 时，Skill 拒绝该区间的 ROI，不静默采用退化结果。',
    '缺失金额、比例、税率与销量不使用预设场景或示例值补齐，未明确的字段保持缺失，不影响无关指标的计算。',
    '仅在本地读取文件并完成测算，不上传数据，不修改原始输入，不执行外部投放或交易操作；不保证经营决策无风险。',
  ]
}

function buildReport(result) {
  const { calculation, priceLessBom, missingByMetric, sensitivity: sens, comparisons } = result
  const metrics = [
    ['priceLessBom', '标价减商品 BOM 成本（未扣优惠、包装、退款、履约、平台、营销与税费，非利润）', priceLessBom, formatAmount],
    ['paidPrice', '实付成交价（券后）', calculation.paidPrice, formatAmount],
    ['netSettlement', '单件净结算额（扣预计退款）', calculation.netSettlement, formatAmount],
    ['grossProfit', '毛利（实付减商品及包装成本）', calculation.grossProfit, formatAmount],
    ['contributionMargin1', '履约及平台后边际（CM1）', calculation.contributionMargin1, formatAmount],
    ['unitProfit', '单件净利润', calculation.unitProfit, formatAmount],
    ['margin', '单件净利率', calculation.margin, (v) => formatPercent(v, 1)],
    ['totalProfit', '活动整场总净利', calculation.totalProfit, formatAmount],
    ['gmv', '整场 GMV', calculation.gmv, formatAmount],
    ['totalNetSettlement', '整场退款后净结算额', calculation.totalNetSettlement, formatAmount],
    ['breakEvenUnits', '保本销售件数', calculation.breakEvenUnits, formatUnits],
    ['maxCommissionRate', '佣金率上限', calculation.maxCommissionRate, (v) => formatPercent(v, 1)],
    ['maxSlotFee', '坑位费上限', calculation.maxSlotFee, formatAmount],
    ['breakEvenRoi', '保本投流 ROI', calculation.breakEvenRoi, (v) => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '不适用/不可达'],
    ['safetyMargin', '安全边际', calculation.safetyMargin, (v) => formatPercent(v, 1)],
  ]

  const available = metrics.filter(([key]) => !missingByMetric[key])
  const unavailable = metrics.filter(([key]) => missingByMetric[key])

  const rows = available.map(([key, label, value, format]) => `| ${label} | ${result.unavailableReasons?.[key] ?? format(value)} |`).join('\n')
  const missingRows = unavailable.map(([key, label]) => `| ${label} | ${missingByMetric[key].map(tableText).join('、')} |`).join('\n')

  const costs = (calculation.costLines ?? []).map((item) => {
    const ratioText = calculation.paidPrice ? formatPercent(item.value / calculation.paidPrice, 1) : '—'
    return `| ${tableText(item.label)} | ${formatAmount(item.value)} | ${ratioText} |`
  }).join('\n')

  let sensitivitySection = ''
  if (sens && sens.rows) {
    const driverName = sens.useRoi ? '投流 ROI 变动' : '达人佣金率变动'
    const headers = sens.useRoi ? ['-10%', '-5%', '基准', '+5%', '+10%'] : ['-10pp', '-5pp', '基准', '+5pp', '+10pp']
    const tableHeader = `| 退货率变动 \\ ${driverName} | ${headers.join(' | ')} |\n| --- | ${headers.map(() => '---:').join(' | ')} |`
    const tableRows = sens.rows.map((row) => {
      const returnLabel = `${row.returnDelta >= 0 ? '+' : ''}${(row.returnDelta * 100).toFixed(0)}pp`
      const cells = row.cells.map((cell) => `单 ${formatAmount(cell.unitProfit)} / 总 ${formatAmount(cell.totalProfit)}`).join(' | ')
      return `| ${returnLabel} | ${cells} |`
    }).join('\n')
    sensitivitySection = `\n\n## 敏感度情景矩阵（单件净利 / 整场总净利）\n\n${tableHeader}\n${tableRows}\n\n退货率和佣金率按百分点变动，ROI 按相对百分比变动；比例触及 0% 或 100% 时按引擎边界截断，表中为情景，不是额外获得的真实数据。`
  }

  let comparisonsSection = ''
  if (comparisons && comparisons.length > 0) {
    const colHeaders = comparisons.map((item) => tableText(item.name))
    const headerRow = `| 关键指标 | ${colHeaders.join(' | ')} |\n| --- | ${colHeaders.map(() => '---:').join(' | ')} |`
    const compRows = [
      ['paidPrice', '实付成交价', formatAmount],
      ['unitProfit', '按分摊销量计算的单件净利润', formatAmount],
      ['margin', '单件净利率', formatPercent],
      ['totalProfit', '活动整场总净利', formatAmount],
      ['breakEvenUnits', '保本销售件数', formatUnits],
      ['maxCommissionRate', '按分摊销量的佣金率上限', formatPercent],
      ['maxSlotFee', '按分摊销量的坑位费上限', formatAmount],
    ].map(([key, label, format]) => `| ${label} | ${comparisons.map((c) =>
      c.missingByMetric[key] ? '数据不足' : c.unavailableReasons?.[key] ?? format(c.calculation[key])
    ).join(' | ')} |`).join('\n')
    comparisonsSection = `\n\n## 方案横向对比\n\n${headerRow}\n${compRows}`
  }

  return `# ${tableText(result.productName)}｜活动合作利润测算

## 结论

${result.status === 'complete'
    ? `在当前方案下，单件净利润为 ${formatAmount(calculation.unitProfit)}（净利率 ${formatPercent(calculation.margin, 1)}），活动整场总净利为 ${formatAmount(calculation.totalProfit)}；保本销售件数为 ${formatUnits(calculation.breakEvenUnits)}；达人佣金率上限为 ${formatPercent(calculation.maxCommissionRate, 1)}，坑位费上限为 ${formatAmount(calculation.maxSlotFee)}。`
    : '当前数据不足以计算完整活动净利润与保本线；仅列出已有数据支持的结果，不补入业务默认值。'}

## 核心经营指标

${rows ? `| 指标 | 数值 |\n| --- | ---: |\n${rows}` : '尚无可计算指标，请提供标价、优惠、成本、费率等数据。'}

## 已知费用明细（单件分摊）

${costs ? `| 科目 | 单件金额 | 占券后实付比 |\n| --- | ---: | ---: |\n${costs}` : '暂无已知费用明细。'}

## 暂不可提供的结果与缺失数据

${missingRows ? `| 指标 | 缺少的输入字段 |\n| --- | --- |\n${missingRows}` : '当前核心测算所需数据已齐全。'}${sensitivitySection}${comparisonsSection}

## 采用的数据

仅记录用户本次提供的数据；详见同目录 result.json：

\`\`\`json
${JSON.stringify(result.settings, null, 2)}
\`\`\`

## 口径与执行边界

${result.assumptions.map((item) => `- ${item}`).join('\n')}
- 佣金、坑位费和投流 ROI 上限以 expectedUnits 的单件分摊口径为基础，不自动代表 units 对应的整场保本上限。
- 对比表中的“数据不足”表示该方案未提供所需输入；方案输入和缺失字段保留在 result.json 的 comparisons 中。
`
}

export function executeScenario(settings, productName = DEFAULT_PRODUCT_NAME) {
  validateSettings(settings)
  const gates = dependencies(settings)
  const base = structuralSettings()
  const executionSettings = { ...base, ...settings }

  const originalCalculation = calculate(executionSettings)
  const missingByMetric = {}
  const calculation = {}

  for (const [key, required] of Object.entries(gates.fields)) {
    const missing = gates.missing(required)
    if (missing.length) {
      missingByMetric[key] = missing
      calculation[key] = null
    } else {
      calculation[key] = originalCalculation[key]
    }
  }

  calculation.costLines = originalCalculation.costLines.filter(
    (line) => gates.costLines[line.key] && gates.missing(gates.costLines[line.key]).length === 0
  )

  const diffMissing = gates.missing(gates.priceLessBom)
  if (diffMissing.length) missingByMetric.priceLessBom = diffMissing
  const priceLessBom = diffMissing.length
    ? null
    : settings.listPrice - settings.bomCost

  const sensMissing = gates.missing(gates.sensitivityRequired)
  const sens = sensMissing.length === 0 ? sensitivity(executionSettings) : null

  const unavailableReasons = {}
  if (calculation.paidPrice === 0 && !missingByMetric.margin) {
    calculation.margin = null
    unavailableReasons.margin = '券后实付为零，净利率分母为零。'
  }
  if (!missingByMetric.maxCommissionRate && calculate({ ...executionSettings, commissionRate: 0 }).unitProfit < -1e-9) {
    calculation.maxCommissionRate = null
    unavailableReasons.maxCommissionRate = '即使佣金为零仍亏损，不存在可承受佣金率。'
  }
  if (!missingByMetric.maxSlotFee && calculate({ ...executionSettings, slotFee: 0 }).unitProfit < -1e-9) {
    calculation.maxSlotFee = null
    unavailableReasons.maxSlotFee = '即使坑位费为零仍亏损，不存在可承受坑位费。'
  }
  const isComplete = calculation.unitProfit !== null && calculation.totalProfit !== null

  return {
    productName,
    status: isComplete ? 'complete' : 'partial',
    settings,
    calculation,
    priceLessBom,
    sensitivity: sens,
    missingByMetric,
    unavailableReasons,
    assumptions: buildAssumptions(),
  }
}

async function readInput(inputPath) {
  let text
  try {
    text = await readFile(inputPath, 'utf8')
  } catch {
    fail(`无法读取输入文件：${inputPath}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    fail(`输入文件不是有效 JSON：${inputPath}`)
  }
}

async function writeOutputs(outputDirectory, result) {
  const directory = path.resolve(outputDirectory)
  await mkdir(directory, { recursive: true })
  await Promise.all([
    writeFile(path.join(directory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8'),
    writeFile(path.join(directory, 'report.md'), buildReport(result), 'utf8'),
  ])
}

async function main() {
  assertNodeVersion()

  const [inputPath, outputDirectory, ...extraArguments] = process.argv.slice(2)
  if (!inputPath || extraArguments.length > 0) {
    fail('用法：node apps/live-taoke/agent/calculate.mjs <input.json> [output-directory]')
  }

  const raw = await readInput(path.resolve(inputPath))
  const parsed = parseInput(raw)

  const mainResult = executeScenario(parsed.settings, parsed.productName)

  let comparisons = null
  if (parsed.scenarios.length > 0) {
    comparisons = parsed.scenarios.map((sc) => {
      const res = executeScenario(sc.settings, sc.name)
      return {
        name: sc.name,
        status: res.status,
        settings: res.settings,
        calculation: res.calculation,
        missingByMetric: res.missingByMetric,
        unavailableReasons: res.unavailableReasons,
      }
    })
  }

  const finalResult = replaceNonFinite({
    ...mainResult,
    comparisons,
  })

  if (outputDirectory !== undefined) await writeOutputs(outputDirectory, finalResult)
  process.stdout.write(`${JSON.stringify(finalResult)}\n`)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : '未知错误。'
    process.stdout.write(`${JSON.stringify({ error: message })}\n`)
    process.exitCode = 1
  })
}
