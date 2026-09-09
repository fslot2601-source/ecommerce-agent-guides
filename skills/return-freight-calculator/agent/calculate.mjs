import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calculateExtended,
  calculateReimbursement,
  calculateSensitivity,
  evaluateDecision,
  finite,
  formatMoney,
  formatPercent,
} from '../src/engine.ts'
import { checkMissingMetrics, metricLabels } from './availability.mjs'

const ALLOWED_ROOT_KEYS = new Set([
  'scenarioName',
  'productName',
  'price',
  'freight',
  'returnRate',
  'packagingLoss',
  'insurancePremium',
  'insurancePayout',
  'batchQuantity',
  'settings',
])

const ALLOWED_SETTINGS_KEYS = new Set([
  'price',
  'freight',
  'returnRate',
  'packagingLoss',
  'insurancePremium',
  'insurancePayout',
  'batchQuantity',
])

function fail(message) {
  throw new Error(message)
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 18)) {
    fail('需要 Node.js 22.18 或更高版本。')
  }
}

function assertNumber(value, location, { min = -Infinity, max = Infinity, exclusiveMin = false, integer = false } = {}) {
  if (typeof value !== 'number' || !finite(value)) {
    fail(`${location} 必须是有限数字。`)
  }
  if (exclusiveMin ? value <= min : value < min) {
    fail(`${location} 必须${exclusiveMin ? '大于' : '不小于'} ${min}。`)
  }
  if (value > max) {
    fail(`${location} 必须不大于 ${max}。`)
  }
  if (integer && !Number.isInteger(value)) {
    fail(`${location} 必须是整数。`)
  }
}

function parseInput(raw) {
  if (!isPlainObject(raw)) fail('输入 JSON 顶层必须是对象。')

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_ROOT_KEYS.has(key)) {
      fail(`${key} 不是支持的输入字段。`)
    }
  }

  let scenarioName = '运费险成本对比测算'
  if (raw.scenarioName !== undefined) {
    if (typeof raw.scenarioName !== 'string' || raw.scenarioName.trim() === '') {
      fail('scenarioName 必须是非空字符串。')
    }
    scenarioName = raw.scenarioName.trim()
  } else if (raw.productName !== undefined) {
    if (typeof raw.productName !== 'string' || raw.productName.trim() === '') {
      fail('productName 必须是非空字符串。')
    }
    scenarioName = raw.productName.trim()
  }

  let settings = {}
  if (raw.settings !== undefined) {
    if (!isPlainObject(raw.settings)) fail('settings 必须是对象。')
    for (const key of Object.keys(raw.settings)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) {
        fail(`settings.${key} 不是支持的设置项。`)
      }
    }
    settings = { ...raw.settings }
  }

  // Merge top-level fields with settings
  const merged = { ...settings }
  for (const key of ALLOWED_SETTINGS_KEYS) {
    if (raw[key] !== undefined) {
      if (settings[key] !== undefined && settings[key] !== raw[key]) {
        fail(`输入冲突：顶层 ${key} 与 settings.${key} 不一致。`)
      }
      merged[key] = raw[key]
    }
  }

  const inputs = {}

  if (merged.price !== undefined) {
    assertNumber(merged.price, 'price', { min: 0, exclusiveMin: true })
    inputs.price = merged.price
  }

  if (merged.freight !== undefined) {
    assertNumber(merged.freight, 'freight', { min: 0 })
    inputs.freight = merged.freight
  }

  if (merged.returnRate !== undefined) {
    assertNumber(merged.returnRate, 'returnRate', { min: 0, max: 100 })
    inputs.returnRate = merged.returnRate
  }

  if (merged.packagingLoss !== undefined) {
    assertNumber(merged.packagingLoss, 'packagingLoss', { min: 0 })
    inputs.packagingLoss = merged.packagingLoss
  }

  if (merged.insurancePremium !== undefined) {
    assertNumber(merged.insurancePremium, 'insurancePremium', { min: 0 })
    inputs.insurancePremium = merged.insurancePremium
  }

  if (merged.insurancePayout !== undefined) {
    assertNumber(merged.insurancePayout, 'insurancePayout', { min: 0 })
    inputs.insurancePayout = merged.insurancePayout
  }

  if (merged.batchQuantity !== undefined) {
    assertNumber(merged.batchQuantity, 'batchQuantity', { min: 1, integer: true })
    inputs.batchQuantity = merged.batchQuantity
  }

  return { scenarioName, inputs }
}

function buildAssumptions() {
  return [
    '退回运费等于发货单程运费为模型假设。',
    '有效赔付按 min(发货运费, 单笔赔付) 计入；单笔赔付超出单程运费的部分不予计入。',
    '运费险赔付仅抵扣退回运费，不抵扣包装破损折旧成本。',
    '本测算仅基于物流与赔付条件的直接成本对比，不纳入开通运费险可能带来的转化率提升、售后体验改善或拒赔率等因素；成本对比不保证最终经营决策。',
    '缺失输入项不使用示例值或零值自动补齐；包装折旧缺失时可计算方案差额与临界点，不冒充完整单均成本。',
  ]
}

function buildReport(result) {
  const { scenarioName, status, inputs, calculation, decision, sensitivity, missingByMetric, assumptions } = result

  // Metrics definitions for reporting
  const metricDisplayConfigs = [
    { key: 'withInsurance', label: '开通运费险单均成本', format: formatMoney, unit: '元 / 单' },
    { key: 'withoutInsurance', label: '不开通运费险单均成本', format: formatMoney, unit: '元 / 单' },
    {
      key: 'difference',
      label: '开通方案单均差额',
      format: (val) => val === null ? '—' : `${val > 0 ? '+' : ''}${formatMoney(val)}`,
      unit: '元 / 单（相对不开通）',
    },
    {
      key: 'breakEvenRate',
      label: '盈亏平衡临界退货率',
      format: (val) => {
        if (val === null) {
          if (calculation.reimbursement === 0) return '不适用（有效赔付为 0）'
          return '—'
        }
        return formatPercent(val)
      },
      unit: '%',
    },
    { key: 'reimbursement', label: '有效运费赔付', format: formatMoney, unit: '元 / 退货' },
    { key: 'batchWithInsurance', label: '开通运费险批次总成本', format: formatMoney, unit: '元 / 批次' },
    { key: 'batchWithoutInsurance', label: '不开通运费险批次总成本', format: formatMoney, unit: '元 / 批次' },
    {
      key: 'batchDifference',
      label: '开通方案批次差额',
      format: (val) => val === null ? '—' : `${val > 0 ? '+' : ''}${formatMoney(val)}`,
      unit: '元 / 批次（相对不开通）',
    },
    { key: 'lossRatioToPrice', label: '不开通方案物流成本占售价比（含正向运费）', format: formatPercent, unit: '%' },
  ]

  const availableMetrics = metricDisplayConfigs.filter(
    (cfg) => calculation[cfg.key] !== null && !missingByMetric[cfg.key],
  )

  let conclusionText = ''
  if (calculation.withInsurance !== null && calculation.batchWithInsurance !== null) {
    conclusionText = `**${decision.title}**。${decision.detail}（基于当前输入测算，任务是成本对比，不保证最终经营决策）。`
  } else if (calculation.withInsurance !== null && calculation.batchWithInsurance === null) {
    conclusionText = `**${decision.title}**。${decision.detail}（未提供批次总量，不输出批次总额；基于当前输入测算，任务是成本对比，不保证最终经营决策）。`
  } else if (calculation.difference !== null) {
    conclusionText = `当前已计算出方案差额：**${decision.title}**（${decision.detail}）；临界退货率见下方说明。因缺少包装折旧成本，暂不提供完整单均总成本。`
  } else {
    conclusionText = '当前输入数据不足以完成方案成本对比；仅列出已有数据支持的中间指标，不使用默认值或示例补齐。'
  }

  // Available metrics table
  let metricsTable = '尚无可计算指标，请提供运费、保费、退货率等业务数据。'
  if (availableMetrics.length > 0) {
    const rows = availableMetrics.map(
      (m) => `| ${m.label} | ${m.format(calculation[m.key])} | ${m.unit} |`,
    )
    metricsTable = `| 指标 | 数值 | 单位 / 说明 |\n| --- | ---: | --- |\n${rows.join('\n')}`
  }

  // Sensitivity / Scenario analysis
  let sensitivitySection = ''
  if (sensitivity && sensitivity.length > 0 && calculation.reimbursement !== null && inputs.insurancePremium !== undefined) {
    const hasFullCosts = sensitivity.some((row) => row.withInsurance !== null)
    let sensRows = ''
    if (hasFullCosts) {
      sensRows = sensitivity
        .map((row) => {
          const isCurrent = inputs.returnRate !== undefined && Math.abs(row.returnRate - inputs.returnRate) < 0.001
          const tag = isCurrent ? ' (当前)' : ''
          const diffStr = row.difference !== null ? `${row.difference > 0 ? '+' : ''}${formatMoney(row.difference)}` : '—'
          const better = row.difference === null
            ? '—'
            : row.difference < -0.005
              ? '开通运费险'
              : row.difference > 0.005
                ? '不开通'
                : '成本持平'
          return `| ${row.returnRate.toFixed(1)}%${tag} | ${formatMoney(row.withInsurance)} | ${formatMoney(row.withoutInsurance)} | ${diffStr} | ${better} |`
        })
        .join('\n')
      sensitivitySection = `## 退货率敏感度分析\n\n| 退货率 | 开通单均成本 | 不开通单均成本 | 开通差额 | 成本较优方案 |\n| ---: | ---: | ---: | ---: | --- |\n${sensRows}\n\n> 注：开通差额 = 开通成本 - 不开通成本；负数表示开通运费险更省钱。`
    } else {
      sensRows = sensitivity
        .map((row) => {
          const isCurrent = inputs.returnRate !== undefined && Math.abs(row.returnRate - inputs.returnRate) < 0.001
          const tag = isCurrent ? ' (当前)' : ''
          const diffStr = row.difference !== null ? `${row.difference > 0 ? '+' : ''}${formatMoney(row.difference)}` : '—'
          const better = row.difference === null
            ? '—'
            : row.difference < -0.005
              ? '开通运费险'
              : row.difference > 0.005
                ? '不开通'
                : '成本持平'
          return `| ${row.returnRate.toFixed(1)}%${tag} | ${diffStr} | ${better} |`
        })
        .join('\n')
      sensitivitySection = `## 退货率敏感度分析（差额测算）\n\n因缺少包装折旧数据，不输出单均总成本，仅输出各退货率下的方案差额：\n\n| 退货率 | 开通差额 | 成本较优方案 |\n| ---: | ---: | --- |\n${sensRows}\n\n> 注：方案差额 = 保费 - (退货率 × 有效赔付)。差额独立于包装折旧，结果真实有效。`
    }
  }

  // Unavailable metrics
  const unavailableMetrics = Object.entries(missingByMetric)
  let unavailableSection = ''
  if (unavailableMetrics.length > 0) {
    const rows = unavailableMetrics.map(([key, missingFields]) => {
      const label = metricLabels[key] || key
      return `| ${label} | ${missingFields.join('、')} |`
    })
    unavailableSection = `## 暂不可提供的结果与缺失数据\n\n| 指标 | 缺少的输入项 |\n| --- | --- |\n${rows.join('\n')}`
  } else {
    unavailableSection = '## 暂不可提供的结果与缺失数据\n\n当前核心指标测算所需数据已齐全。'
  }

  // Critical breakeven explanation
  let breakEvenExplanation = ''
  if (calculation.breakEvenRate !== null) {
    if (calculation.breakEvenRate > 100) {
      breakEvenExplanation = `> **临界退货率说明**：临界退货率为 ${formatPercent(calculation.breakEvenRate)}，高于 100%。在任何实际退货率下，不开通运费险成本均更低。`
    } else {
      breakEvenExplanation = `> **临界退货率说明**：盈亏平衡临界退货率为 ${formatPercent(calculation.breakEvenRate)}。当实际退货率高于此值时，开通运费险更省钱；低于此值时，不开通更省钱。`
    }
  } else if (calculation.reimbursement === 0) {
    const costEffect = inputs.insurancePremium === undefined
      ? '尚未提供保费，不能判断额外支出或方案优劣。'
      : inputs.insurancePremium === 0
        ? '保费也为 0，两方案差额在所有退货率下为 0；没有唯一临界点。'
        : '保费大于 0，开通方案在所有退货率下均增加该笔保费。'
    breakEvenExplanation = `> **临界退货率说明**：有效赔付金额为 0 元，临界退货率不适用。${costEffect}`
  }

  if (sensitivitySection) sensitivitySection += '\n\n情景说明：表中退货率梯度用于敏感度展示，不是自动补入的真实退货率；当前值仅在用户已提供时标注。表中“成本持平”采用单均 0.005 元展示阈值，细小差额仍以原始结果和批次差额为准。'

  const safeName = scenarioName.replace(/[\r\n]+/g, ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `# ${safeName}｜运费险成本对比测算

## 结论

${conclusionText}

${breakEvenExplanation}

## 可提供的测算结果

${metricsTable}

${sensitivitySection}

${unavailableSection}

## 采用的数据

\`\`\`json
${JSON.stringify(inputs, null, 2)}
\`\`\`

## 口径与模型假设

${assumptions.map((item) => `- ${item}`).join('\n')}
- 仅本地读取和计算，不上传数据，不修改原始输入，不执行外部操作。
`
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

  const jsonPath = path.join(directory, 'result.json')
  const reportPath = path.join(directory, 'report.md')

  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  await writeFile(reportPath, buildReport(result), 'utf8')
}

export async function run(inputPath, outputDirectory) {
  assertNodeVersion()
  const raw = await readInput(inputPath)
  const { scenarioName, inputs } = parseInput(raw)

  const calculation = calculateExtended(inputs)
  const missingByMetric = checkMissingMetrics(inputs)
  const decision = evaluateDecision(calculation.difference, inputs.batchQuantity)
  const sensitivity = calculateSensitivity(inputs)
  const assumptions = buildAssumptions()

  const isComplete = Object.keys(missingByMetric).length === 0
  const status = isComplete ? 'complete' : 'partial'

  const result = {
    scenarioName,
    status,
    inputs,
    calculation,
    decision,
    sensitivity,
    missingByMetric,
    assumptions,
  }

  if (outputDirectory) {
    await writeOutputs(outputDirectory, result)
  }

  return result
}

async function main() {
  const [inputPath, outputDirectory, ...extra] = process.argv.slice(2)
  if (!inputPath || extra.length > 0) {
    fail('用法：node apps/return-freight-calculator/agent/calculate.mjs <input.json> [output-directory]')
  }

  const result = await run(inputPath, outputDirectory)
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(JSON.stringify({ error: error.message }, null, 2))
    process.exitCode = 1
  })
}
