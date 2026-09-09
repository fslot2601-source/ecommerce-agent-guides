import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { calculate, reverseTargets } from '../src/engine.ts'
import { structuralSettings, inferCostModes, dependencies } from './availability.mjs'

const DEFAULT_PRODUCT_NAME = '待命名商品'
const ALLOWED_ROOT_KEYS = new Set(['productName', 'settings', 'companyAdjustments'])

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

function mergeSettings(defaults, patch, location = 'settings') {
  if (!isPlainObject(patch)) fail(`${location} 必须是对象。`)

  const merged = { ...defaults }
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(defaults, key)) fail(`${location}.${key} 不是支持的设置项。`)

    const nextLocation = `${location}.${key}`
    if (isPlainObject(defaults[key])) {
      merged[key] = mergeSettings(defaults[key], value, nextLocation)
    } else {
      merged[key] = value
    }
  }
  return merged
}

function assertNumber(value, location, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${location} 必须是有限数字。`)
  if (exclusiveMin ? value <= min : value < min) fail(`${location} 必须${exclusiveMin ? '大于' : '不小于'} ${min}。`)
  if (value > max) fail(`${location} 必须不大于 ${max}。`)
}

function assertOneOf(value, location, values) {
  if (!values.includes(value)) fail(`${location} 必须是 ${values.join('、')} 之一。`)
}

function assertBoolean(value, location) {
  if (typeof value !== 'boolean') fail(`${location} 必须是 true 或 false。`)
}

function validateSettings(settings) {
  assertNumber(settings.asp, 'settings.asp', { min: 0, exclusiveMin: true })

  assertOneOf(settings.productCost.mode, 'settings.productCost.mode', ['summary', 'detailed'])
  assertNumber(settings.productCost.summary, 'settings.productCost.summary', { min: 0 })
  for (const key of ['bom', 'packaging', 'accessories', 'gifts', 'inboundFreight']) {
    assertNumber(settings.productCost.detailed[key], `settings.productCost.detailed.${key}`, { min: 0 })
  }

  assertOneOf(settings.fulfillmentCost.mode, 'settings.fulfillmentCost.mode', ['summary', 'detailed'])
  assertNumber(settings.fulfillmentCost.summary, 'settings.fulfillmentCost.summary', { min: 0 })
  for (const key of ['delivery', 'packing', 'shippingInsurance']) {
    assertNumber(settings.fulfillmentCost.detailed[key], `settings.fulfillmentCost.detailed.${key}`, { min: 0 })
  }

  assertOneOf(settings.platformFee.mode, 'settings.platformFee.mode', ['summary', 'detailed'])
  assertNumber(settings.platformFee.summary, 'settings.platformFee.summary', { min: 0, max: 1 })
  assertNumber(settings.platformFee.detailed.commissionRate, 'settings.platformFee.detailed.commissionRate', { min: 0, max: 1 })
  assertNumber(settings.platformFee.detailed.paymentRate, 'settings.platformFee.detailed.paymentRate', { min: 0, max: 1 })
  assertNumber(settings.platformFee.detailed.software, 'settings.platformFee.detailed.software', { min: 0 })

  assertOneOf(settings.tax.mode, 'settings.tax.mode', ['invoice', 'quick'])
  assertOneOf(settings.tax.taxpayerType, 'settings.tax.taxpayerType', ['general13', 'small1', 'small3', 'exempt'])
  assertNumber(settings.tax.surtaxRate, 'settings.tax.surtaxRate', { min: 0, max: 1 })
  assertNumber(settings.tax.quickRate, 'settings.tax.quickRate', { min: 0, max: 1 })
  if (settings.tax.logisticsInvoiceRate !== 0.06 && settings.tax.logisticsInvoiceRate !== 0.09) {
    fail('settings.tax.logisticsInvoiceRate 必须是 0.06 或 0.09。')
  }
  for (const key of ['productInvoice', 'logisticsInvoice', 'adInvoice']) {
    assertBoolean(settings.tax[key], `settings.tax.${key}`)
  }

  assertOneOf(settings.marketing.mode, 'settings.marketing.mode', ['rate', 'shareRoas'])
  assertNumber(settings.marketing.gmvRate, 'settings.marketing.gmvRate', { min: 0, max: 1 })
  assertNumber(settings.marketing.paidTrafficShare, 'settings.marketing.paidTrafficShare', { min: 0, max: 1 })
  assertNumber(settings.marketing.roas, 'settings.marketing.roas', { min: 0, exclusiveMin: true })
  assertNumber(settings.marketing.livestreamCommissionRate, 'settings.marketing.livestreamCommissionRate', { min: 0, max: 1 })

  assertNumber(settings.adjustments.returnRate, 'settings.adjustments.returnRate', { min: 0, max: 1 })
  assertNumber(settings.adjustments.discount, 'settings.adjustments.discount', { min: 0, max: settings.asp })
  assertNumber(settings.targetNetMargin, 'settings.targetNetMargin', { min: -0.5, max: 0.95 })
}

function parseCompanyAdjustments(value) {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail('companyAdjustments 必须是数组。')

  return value.map((adjustment, index) => {
    const location = `companyAdjustments[${index}]`
    if (!isPlainObject(adjustment)) fail(`${location} 必须是对象。`)
    for (const key of Object.keys(adjustment)) {
      if (key !== 'name' && key !== 'amount') fail(`${location}.${key} 不是支持的字段。`)
    }
    if (typeof adjustment.name !== 'string' || adjustment.name.trim() === '') fail(`${location}.name 必须是非空字符串。`)
    assertNumber(adjustment.amount, `${location}.amount`, { min: 0 })
    return { name: adjustment.name.trim(), amount: adjustment.amount }
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

  const provided = raw.settings === undefined ? {} : raw.settings
  if (!isPlainObject(provided)) fail('settings 必须是对象。')
  const settings = inferCostModes(provided)
  const structure = structuralSettings()
  // Without ASP, a nonnegative discount can still be validated independently.
  if (settings.asp === undefined && typeof settings.adjustments?.discount === 'number') {
    structure.asp = Math.max(1, settings.adjustments.discount)
  }
  const executionSettings = mergeSettings(structure, settings)
  validateSettings(executionSettings)

  return { productName, settings, executionSettings, companyProvided: raw.companyAdjustments !== undefined, companyAdjustments: parseCompanyAdjustments(raw.companyAdjustments) }
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

function formatPercent(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '不适用/不可达'
}

function tableText(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function buildAssumptions() {
  return [
    '所有金额均按单件发货订单、含税金额试算。',
    'settings 仅包含本次提供的数据及可无歧义识别的成本输入模式；缺失金额、比例、税务身份不使用示例值或零补齐。',
    '售价减商品成本的差额尚未扣除优惠、退货、履约、税费、平台及营销费用，不是毛利或净利润。',
    '原模型将 NP 定义为 CM2；退货逆向物流、质检与残损准备按退货率 ×（商品成本 + 履约成本）× 18%计提。',
    'companyAdjustments 是用户明确提供的单笔企业口径扣除项。它们只影响 company.netProfit 与 company.netMargin，不纳入原模型的保本 ROAS、保本售价或采购成本上限。',
  ]
}

function buildReport(result) {
  const { calculation, targets, company } = result
  const metrics = [
    ['priceLessProductCost', '售价减商品成本（未扣其他费用，非利润）', result.priceLessProductCost, formatAmount],
    ['asp', '实付成交价（ASP）', calculation.asp, formatAmount],
    ['productCost', '商品成本', calculation.productCost, formatAmount],
    ['netSales', '退款后有效成交额', calculation.netSales, formatAmount],
    ['grossProfit', '原模型毛利（GP）', calculation.grossProfit, formatAmount],
    ['cm1', '履约后贡献（CM1）', calculation.cm1, formatAmount],
    ['netProfit', '原模型净利润（CM2 / NP）', calculation.netProfit, formatAmount],
    ['netMargin', '原模型净利率', calculation.netMargin, formatPercent],
    ['adCost', '广告费', calculation.adCost, formatAmount],
    ['taxCost', '税费', calculation.taxCost, formatAmount],
    ['breakEvenRoas', '原模型保本 ROAS', calculation.breakEvenRoas, (value) => value === null ? '不适用/不可达' : value.toFixed(2)],
    ['breakEvenPrice', '原模型保本售价', calculation.breakEvenPrice, formatAmount],
    ['breakEvenCogs', '原模型保本采购成本', calculation.breakEvenCogs, formatAmount],
    ['targets', '目标净利率下最低售价', targets.minimumPrice, formatAmount],
    ['targets', '目标净利率下最高采购成本', targets.maxCogs, formatAmount],
  ]
  const available = metrics.filter(([key]) => !result.missingByMetric[key])
  const unavailable = metrics.filter(([key]) => result.missingByMetric[key])
  const rows = available.map(([, label, value, format]) => `| ${label} | ${format(value)} |`).join('\n')
  const missingRows = unavailable.map(([key, label]) => `| ${label} | ${result.missingByMetric[key].map(tableText).join('、')} |`).join('\n')
  const costs = calculation.lineItems.map((item) => `| ${tableText(item.name)} | ${formatAmount(item.amount)} | ${tableText(item.detail ?? '')} |`).join('\n')
  const adjustments = company.provided
    ? `${company.adjustments.map((item) => `- ${tableText(item.name)}：${formatAmount(item.amount)}`).join('\n')}\n- 已确认扣除项合计：${formatAmount(company.totalAdjustments)}`
    : '未提供企业费用信息，未将其视为零。'
  const companyResult = result.missingByMetric.company
    ? `暂不能输出企业口径利润；缺少：${result.missingByMetric.company.join('、')}。`
    : `企业口径利润：${formatAmount(company.netProfit)}；利润率：${formatPercent(company.netMargin)}。`
  return `# ${tableText(result.productName)}｜单品价值链测算\n\n## 结论\n\n${result.status === 'complete' ? `原模型净利润为 ${formatAmount(calculation.netProfit)}，净利率为 ${formatPercent(calculation.netMargin)}。` : '当前数据不足以计算完整净利润；仅列出已有数据支持的结果，不补入示例值。'}\n\n## 可提供的结果\n\n${rows ? `| 指标 | 数值 |\n| --- | ---: |\n${rows}` : '尚无可计算指标，请提供售价、成本等业务数据。'}\n\n## 已知费用明细\n\n${costs ? `| 科目 | 单笔金额 | 说明 |\n| --- | ---: | --- |\n${costs}` : '没有可列出的非零已知费用；不表示费用为零。'}\n\n## 暂不可提供的结果与缺失数据\n\n${missingRows ? `| 指标 | 缺少的输入字段 |\n| --- | --- |\n${missingRows}` : '当前核心测算及目标反推所需数据已齐全。'}\n\n## 企业费用调整\n\n${adjustments}\n\n${companyResult}\n\n企业调整不改变原模型保本线或目标反推。\n\n## 采用的数据\n\n仅记录用户本次提供的数据与可无歧义识别的输入模式；详见同目录 result.json 的 settings：\n\n\`\`\`json\n${JSON.stringify(result.settings, null, 2)}\n\`\`\`\n\n## 口径与执行边界\n\n${result.assumptions.map((item) => `- ${item}`).join('\n')}\n- 仅本地读取和计算，不上传数据，不修改原始输入，不执行投放或交易操作；不保证经营决策无风险。\n`

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
    fail('用法：node apps/unit-economics/agent/calculate.mjs <input.json> [output-directory]')
  }

  const raw = await readInput(path.resolve(inputPath))
  const parsed = parseInput(raw)
  const gates = dependencies(parsed.settings)
  const originalCalculation = calculate(parsed.executionSettings)
  const missingByMetric = {}
  const calculation = {}
  for (const [key, required] of Object.entries(gates.fields)) {
    const missing = gates.missing(required)
    if (missing.length) missingByMetric[key] = missing
    calculation[key] = missing.length ? null : originalCalculation[key]
  }
  calculation.lineItems = originalCalculation.lineItems.filter((line) => gates.lines[line.code] && gates.missing(gates.lines[line.code]).length === 0)
  const differenceMissing = gates.missing(gates.priceLessProductCost)
  if (differenceMissing.length) missingByMetric.priceLessProductCost = differenceMissing
  // Reuse the engine's subtraction with zero discount/returns solely for this explicitly
  // labelled pre-expense difference; it is never presented as the actual gross profit.
  const priceLessProductCost = differenceMissing.length ? null : calculate({
    ...parsed.executionSettings, adjustments: { discount: 0, returnRate: 0 },
  }).grossProfit
  const targetMissing = gates.missing(gates.targets)
  if (targetMissing.length) missingByMetric.targets = targetMissing
  const targets = targetMissing.length
    ? { minimumPrice: null, maxCogs: null, targetMargin: parsed.settings.targetNetMargin ?? null }
    : reverseTargets(parsed.executionSettings)
  const totalAdjustments = parsed.companyProvided ? parsed.companyAdjustments.reduce((sum, item) => sum + item.amount, 0) : null
  const companyProfit = calculation.netProfit !== null && totalAdjustments !== null ? calculation.netProfit - totalAdjustments : null
  const companyMargin = companyProfit !== null ? companyProfit / calculation.asp : null
  if (companyProfit === null) missingByMetric.company = [
    ...(missingByMetric.netProfit ?? []), ...(!parsed.companyProvided ? ['companyAdjustments'] : []),
  ]
  const result = replaceNonFinite({
    productName: parsed.productName,
    status: calculation.netProfit === null ? 'partial' : 'complete',
    settings: parsed.settings,
    calculation,
    priceLessProductCost,
    targets,
    missingByMetric,
    assumptions: buildAssumptions(),
    company: {
      adjustments: parsed.companyAdjustments,
      provided: parsed.companyProvided,
      totalAdjustments,
      netProfit: companyProfit,
      netMargin: companyMargin,
      basis: '企业口径利润 = 原模型 CM2 − 用户明确提供的 companyAdjustments；企业调整不改变原模型保本线。',
    },
  })

  if (outputDirectory !== undefined) await writeOutputs(outputDirectory, result)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : '未知错误。'
  process.stdout.write(`${JSON.stringify({ error: message })}\n`)
  process.exitCode = 1
})

