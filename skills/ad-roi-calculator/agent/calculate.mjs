import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  calculate,
  calculateBudgetScenarios,
  FORMULA_DISCLOSURES,
  formatMoney,
  formatPercent,
  formatRoi,
  isFiniteNumber,
} from '../src/engine.ts'
import { dependencies, METRIC_DEPENDENCIES } from './availability.mjs'

const DEFAULT_PRODUCT_NAME = '待测算商品'
const ALLOWED_ROOT_KEYS = new Set(['productName', 'settings'])
const ALLOWED_SETTINGS_KEYS = new Set([
  'price',
  'purchaseCost',
  'shippingCost',
  'platformRate',
  'returnRate',
  'cvr',
  'ctr',
  'paidShare',
  'targetMargin',
  'budget',
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

function validateSettings(settings) {
  for (const key of Object.keys(settings)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) fail(`settings.${key} 不是支持的输入字段。`)
  }

  if (settings.price !== undefined) {
    assertNumber(settings.price, 'settings.price', { min: 0, exclusiveMin: true })
  }
  if (settings.purchaseCost !== undefined) {
    assertNumber(settings.purchaseCost, 'settings.purchaseCost', { min: 0 })
  }
  if (settings.shippingCost !== undefined) {
    assertNumber(settings.shippingCost, 'settings.shippingCost', { min: 0 })
  }
  if (settings.platformRate !== undefined) {
    if (typeof settings.platformRate !== 'number' || !Number.isFinite(settings.platformRate) || settings.platformRate < 0 || settings.platformRate > 1) {
      fail('settings.platformRate 必须在 0 到 1 之间（例如 6% 请输入 0.06）。')
    }
  }
  if (settings.returnRate !== undefined) {
    if (typeof settings.returnRate !== 'number' || !Number.isFinite(settings.returnRate) || settings.returnRate < 0 || settings.returnRate > 1) {
      fail('settings.returnRate 必须在 0 到 1 之间（例如 25% 请输入 0.25）。')
    }
  }
  if (settings.cvr !== undefined) {
    if (typeof settings.cvr !== 'number' || !Number.isFinite(settings.cvr) || settings.cvr < 0 || settings.cvr > 1) {
      fail('settings.cvr 必须在 0 到 1 之间（例如 3.2% 请输入 0.032）。')
    }
  }
  if (settings.ctr !== undefined) {
    if (typeof settings.ctr !== 'number' || !Number.isFinite(settings.ctr) || settings.ctr < 0 || settings.ctr > 1) {
      fail('settings.ctr 必须在 0 到 1 之间（例如 2.5% 请输入 0.025）。')
    }
  }
  if (settings.paidShare !== undefined) {
    if (typeof settings.paidShare !== 'number' || !Number.isFinite(settings.paidShare) || settings.paidShare < 0 || settings.paidShare > 1) {
      fail('settings.paidShare 必须在 0 到 1 之间（例如 65% 请输入 0.65）。')
    }
  }
  if (settings.targetMargin !== undefined) {
    if (typeof settings.targetMargin !== 'number' || !Number.isFinite(settings.targetMargin) || settings.targetMargin < 0 || settings.targetMargin > 1) {
      fail('settings.targetMargin 必须在 0 到 1 之间（例如 10% 请输入 0.10）。')
    }
  }
  if (settings.budget !== undefined) {
    assertNumber(settings.budget, 'settings.budget', { min: 0 })
  }
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
  if (!isPlainObject(settings)) fail('settings 必须是对象。')
  validateSettings(settings)

  return { productName, settings }
}

function tableText(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function buildReport(result) {
  const { calculation, settings, missingByMetric, budgetScenarios, status } = result

  const metricLabels = {
    price: '商品售价',
    settledRevenue: '退款后结算收入',
    transactionCost: '平台扣点与税费',
    purchaseCost: '商品采购成本',
    shippingCost: '单件发货运费包装',
    contribution: '投流前单件贡献',
    targetProfit: '目标单件利润额',
    pureBreakEvenRoi: '纯付费保本 ROI',
    targetRoi: '目标利润 ROI',
    mixedBreakEvenRoi: '混合流量保本 ROI',
    maxCpc: 'Max CPC（最高点击出价）',
    maxCpm: 'Max CPM（最高千次展示出价）',
    budgetScenarios: '预算收益试算',
  }

  // 1. Conclusion
  let conclusion = ''
  if (calculation.contribution !== null) {
    if (calculation.contribution !== null && calculation.contribution <= 0) {
      conclusion = `商品售价 ${formatMoney(settings.price)}，退款后结算收入 ${formatMoney(calculation.settledRevenue)} 不足以覆盖采购与履约成本。投流前单件贡献为 ${formatMoney(calculation.contribution)}（非正），无法通过纯付费投放保本；请先优化采购价、运费、退货率或提高售价。`
    } else if (calculation.pureBreakEvenRoi !== null) {
      const targetText = calculation.targetRoi !== null ? `，目标利润 ROI 为 ${formatRoi(calculation.targetRoi)}` : ''
      conclusion = `测算完成：纯付费保本 ROI 为 ${formatRoi(calculation.pureBreakEvenRoi)}${targetText}。${calculation.maxCpc !== null ? `Max CPC 为 ${formatMoney(calculation.maxCpc)}` : 'Max CPC 暂不能提供'}，${calculation.maxCpm !== null ? `Max CPM 为 ${formatMoney(calculation.maxCpm)}` : 'Max CPM 暂不能提供'}；缺失项或不适用原因见下方。`
    } else {
      conclusion = '测算完成，核心指标已列出。'
    }
  } else {
    conclusion = '当前业务数据不完整；仅输出已有数据支持的指标，缺失数据不自动补入示例值或默认值。'
  }

  // 2. Available rows
  const availableRows = []
  if (settings.price !== undefined) {
    availableRows.push(`| ${metricLabels.price} | ${formatMoney(settings.price)} | 单件含税标价 |`)
  }
  if (calculation.settledRevenue !== null) {
    availableRows.push(`| ${metricLabels.settledRevenue} | ${formatMoney(calculation.settledRevenue)} | 退货退款率 ${formatPercent(settings.returnRate * 100)} |`)
  }
  if (calculation.transactionCost !== null) {
    availableRows.push(`| ${metricLabels.transactionCost} | -${formatMoney(calculation.transactionCost)} | 综合费率 ${formatPercent(settings.platformRate * 100)} |`)
  }
  if (settings.purchaseCost !== undefined) {
    availableRows.push(`| ${metricLabels.purchaseCost} | -${formatMoney(settings.purchaseCost)} | 单件出厂/采购成本 |`)
  }
  if (settings.shippingCost !== undefined) {
    availableRows.push(`| ${metricLabels.shippingCost} | -${formatMoney(settings.shippingCost)} | 单件快递与包装耗材 |`)
  }
  if (calculation.contribution !== null) {
    availableRows.push(`| ${metricLabels.contribution} | ${formatMoney(calculation.contribution)} | 投流前单件可承受广告额上限 |`)
  }
  if (calculation.targetProfit !== null) {
    availableRows.push(`| ${metricLabels.targetProfit} | ${formatMoney(calculation.targetProfit)} | 目标净利率 ${formatPercent((settings.targetMargin ?? 0) * 100)} |`)
  }
  if (calculation.pureBreakEvenRoi !== null) {
    availableRows.push(`| ${metricLabels.pureBreakEvenRoi} | ${formatRoi(calculation.pureBreakEvenRoi)} | 售价 ÷ 单件贡献（GMV 口径） |`)
  } else if (!missingByMetric.pureBreakEvenRoi && calculation.contribution !== null && calculation.contribution <= 0) {
    availableRows.push(`| ${metricLabels.pureBreakEvenRoi} | 不可达（贡献<=0） | 投流前单件贡献不足以覆盖成本 |`)
  }
  if (calculation.targetRoi !== null) {
    availableRows.push(`| ${metricLabels.targetRoi} | ${formatRoi(calculation.targetRoi)} | 留存目标净利润后的出资线 |`)
  } else if (!missingByMetric.targetRoi && calculation.contribution !== null && calculation.targetProfit !== null && (calculation.contribution - calculation.targetProfit) <= 0) {
    availableRows.push(`| ${metricLabels.targetRoi} | 不可达（留利后无预算） | 目标利润超过投流前单件贡献 |`)
  }
  if (calculation.mixedBreakEvenRoi !== null) {
    availableRows.push(`| ${metricLabels.mixedBreakEvenRoi} | ${formatRoi(calculation.mixedBreakEvenRoi)} | 付费成交占比 ${formatPercent((settings.paidShare ?? 0) * 100)} |`)
  }
  if (calculation.maxCpc !== null) {
    availableRows.push(`| ${metricLabels.maxCpc} | ${formatMoney(calculation.maxCpc)} | 单件贡献 × 转化率 CVR |`)
  }
  if (calculation.maxCpm !== null) {
    availableRows.push(`| ${metricLabels.maxCpm} | ${formatMoney(calculation.maxCpm)} | Max CPC × 点击率 CTR × 1,000 |`)
  }

  // 3. Budget scenarios (简化场景试算)
  let budgetSection = ''
  if (budgetScenarios && budgetScenarios.length > 0) {
    const scenarioRows = budgetScenarios
      .map(
        (row) =>
          `| ${formatRoi(row.roi)} | ${formatMoney(row.unitProfit)} | ${formatMoney(row.budgetProfit)} |`
      )
      .join('\n')
    budgetSection = `\n## 预算收益试算（简化场景试算）\n\n投放预算：${formatMoney(settings.budget)}（注：仅为静态线性试算，假定预算按所列假设 ROI 全额消耗；不作为实际经营收益承诺）。\n\n| 假设投放 ROI | 单件情景利润 | 预算情景利润 |\n| --- | ---: | ---: |\n${scenarioRows}\n`
  }

  if (budgetSection) budgetSection += '\n情景生成方式：围绕保本 ROI、可计算的目标 ROI 及 ±0.5 偏移生成对照；目标 ROI 缺失或不可达时，仅以保本 ROI 的偏移展示，不代表已实现用户目标，也不是实际投放观测。\n'

  const unavailableSection = Object.entries(result.unavailableReasons).map(([metric, reason]) => `- ${metricLabels[metric] ?? metric}：${reason}`).join('\n')

  // 4. Missing metrics table
  const missingRows = []
  for (const [metric, missingFields] of Object.entries(missingByMetric)) {
    const label = metricLabels[metric] ?? metric
    missingRows.push(`| ${label} | ${missingFields.join('、')} |`)
  }

  return `# ${tableText(result.productName)}｜投放出价上限测算\n\n## 结论\n\n${conclusion}\n\n## 可提供的结果\n\n${availableRows.length ? `| 指标 | 测算数值 | 测算说明 |\n| --- | ---: | --- |\n${availableRows.join('\n')}` : '尚无可计算指标，请至少提供商品售价及相关成本与流转参数。'}\n${budgetSection}\n## 暂不可提供的结果与缺失数据\n\n${missingRows.length ? `| 暂不能输出的指标 | 缺少的输入字段 |\n| --- | --- |\n${missingRows.join('\n')}` : '当前测算链路所需数据已齐全。'}\n\n## 数据齐全但不适用的结果\n\n${unavailableSection || '无。'}\n\n## 采用的数据\n\n\`\`\`json\n${JSON.stringify(result.settings, null, 2)}\n\`\`\`\n\n## 口径披露、旧公式局限与操作边界\n\n${result.disclosures.map((item) => `- ${item}`).join('\n')}\n- 本测算仅执行本地读取与计算，不上传敏感数据，不修改原表，不执行自动化投放或交易出价操作。\n`
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
    fail('用法：node apps/ad-roi-calculator/agent/calculate.mjs <input.json> [output-directory]')
  }

  const raw = await readInput(path.resolve(inputPath))
  const parsed = parseInput(raw)
  const gates = dependencies(parsed.settings)
  const rawCalculation = calculate(parsed.settings)

  const missingByMetric = {}
  const calculation = {}

  for (const [metric, deps] of Object.entries(gates.fields)) {
    const missing = gates.missing(deps)
    if (missing.length > 0) {
      missingByMetric[metric] = missing
      if (metric in rawCalculation) {
        calculation[metric] = null
      }
    } else {
      if (metric in rawCalculation) {
        calculation[metric] = rawCalculation[metric]
      }
    }
  }

  // Budget scenarios: only computed if budget is supplied and pureBreakEvenRoi is valid
  let budgetScenarios = null
  const budgetMissing = gates.missing(gates.fields.budgetScenarios)
  if (budgetMissing.length === 0 && calculation.pureBreakEvenRoi !== null && parsed.settings.budget !== undefined && calculation.contribution !== null && parsed.settings.price !== undefined) {
    budgetScenarios = calculateBudgetScenarios(
      parsed.settings.price,
      calculation.contribution,
      calculation.pureBreakEvenRoi,
      calculation.targetRoi,
      parsed.settings.budget,
    )
  }

  const unavailableReasons = {}
  for (const [key, value] of Object.entries(calculation)) {
    if (value !== null || missingByMetric[key]) continue
    if (key === 'pureBreakEvenRoi') unavailableReasons[key] = '投流前贡献非正，没有可承受的正广告支出。'
    if (key === 'targetRoi') unavailableReasons[key] = '扣除目标利润后没有可用广告预算。'
    if (key === 'mixedBreakEvenRoi') unavailableReasons[key] = parsed.settings.paidShare === 0 ? '付费成交占比为零，混合投流 ROI 不适用。' : '纯付费保本 ROI 不可达。'
    if (key === 'maxCpc') unavailableReasons[key] = calculation.contribution <= 0 ? '投流前贡献非正，无可承受的正点击出价。' : 'CVR 为零，没有可支持的正点击出价。'
    if (key === 'maxCpm') unavailableReasons[key] = parsed.settings.ctr === 0 ? 'CTR 为零，没有可支持的正曝光出价。' : '点击出价边界不可用（CVR 为零或贡献非正）。'
  }
  if (!missingByMetric.budgetScenarios && budgetScenarios === null) unavailableReasons.budgetScenarios = '纯付费保本 ROI 不可达，未生成预算场景。'

  // Determine completeness
  // Complete requires all metrics that have dependency gates to be free of missing inputs
  const hasMissing = Object.keys(missingByMetric).length > 0
  const status = hasMissing ? 'partial' : 'complete'

  const result = {
    productName: parsed.productName,
    status,
    settings: parsed.settings,
    calculation,
    budgetScenarios,
    missingByMetric,
    unavailableReasons,
    disclosures: FORMULA_DISCLOSURES,
  }

  if (outputDirectory !== undefined) {
    await writeOutputs(outputDirectory, result)
  }

  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : '未知错误。'
  process.stdout.write(`${JSON.stringify({ error: message })}\n`)
  process.exitCode = 1
})
