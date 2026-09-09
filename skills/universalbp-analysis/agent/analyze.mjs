import { realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DIMENSIONS,
  aggregateDetails,
  buildComparison,
  buildFindings,
  summarize,
  validateDatasetInput,
} from '../src/analyticsCore.ts'

function fail(message) {
  throw new Error(message)
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 18)) {
    fail('需要 Node.js 22.18 或更高版本。')
  }
}

function formatValue(value, format) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (format === 'money') return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (format === 'integer') return Math.round(value).toLocaleString('zh-CN')
  if (format === 'multiple') return `${value.toFixed(2)}x`
  return `${value.toFixed(2)}%`
}

function formatChange(change, mode) {
  if (change === null || change === undefined || !Number.isFinite(change)) return '—'
  const sign = change > 0 ? '+' : change < 0 ? '−' : ''
  const absVal = Math.abs(change)
  if (mode === 'point') {
    return `${sign}${absVal.toFixed(2)}pp`
  }
  return `${sign}${absVal.toFixed(1)}%`
}

function buildReport(result) {
  // Escape user-supplied names and metadata for Markdown presentation only.
  const escaped = JSON.parse(JSON.stringify(result), (_key, value) => typeof value === 'string'
    ? value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')
    : value)
  const { baseStage, comparisonStage, attributionScope, metrics, dimension, detailRows, findings, warnings, disclaimer } = escaped

  const lines = []
  lines.push('# 万相台阶段对比分析报告\n')
  lines.push(`> **分析说明与边界**：${disclaimer}\n`)

  lines.push('## 1. 阶段信息与口径确认\n')
  lines.push('| 项目 | 基准阶段（' + baseStage.name + '） | 对比阶段（' + comparisonStage.name + '） |')
  lines.push('| :--- | :--- | :--- |')
  lines.push(`| 日期范围 | ${baseStage.startDate} 至 ${baseStage.endDate} | ${comparisonStage.startDate} 至 ${comparisonStage.endDate} |`)
  lines.push(`| 推广场景 | ${baseStage.promotionScene} | ${comparisonStage.promotionScene} |`)
  lines.push(`| 归因口径 | ${attributionScope.attributionModel} | ${attributionScope.attributionModel} |`)
  lines.push(`| 归因周期 | ${attributionScope.attributionDays}天 | ${attributionScope.attributionDays}天 |`)
  lines.push(`| 成交口径 | ${attributionScope.conversionScope} | ${attributionScope.conversionScope} |`)
  lines.push('\n*注：两阶段归因口径、归因周期与成交口径一致，满足直接规则化对比条件。*\n')

  lines.push('## 2. 整体核心指标对照表\n')
  lines.push('| 核心指标 | 基准阶段数值 | 对比阶段数值 | 阶段变动 | 规则判定 | 计算口径 |')
  lines.push('| :--- | ---: | ---: | ---: | :---: | :--- |')
  for (const row of metrics) {
    const baseStr = formatValue(row.baseValue, row.format)
    const compStr = formatValue(row.comparisonValue, row.format)
    const changeStr = formatChange(row.change, row.changeMode)
    lines.push(`| ${row.label} | ${baseStr} | ${compStr} | ${changeStr} | ${row.judgment} | ${row.formula} |`)
  }
  lines.push('')

  lines.push(`## 3. ${dimension}维度对象变化（四象限分类）\n`)
  if (detailRows && detailRows.length > 0) {
    lines.push('| 对象名称 | 编码 | 基准消耗 | 对比消耗 | 消耗变动 | 基准ROI | 对比ROI | ROI变动 | 象限分类 |')
    lines.push('| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |')
    for (const row of detailRows) {
      const codeStr = row.code || '—'
      const baseSpend = formatValue(row.base.spend, 'money')
      const compSpend = formatValue(row.comparison.spend, 'money')
      const spendChg = formatChange(row.spendChange, 'relative')
      const baseRoi = formatValue(row.base.roi, 'multiple')
      const compRoi = formatValue(row.comparison.roi, 'multiple')
      const roiChg = formatChange(row.roiChange, 'relative')
      lines.push(`| ${row.name} | ${codeStr} | ${baseSpend} | ${compSpend} | ${spendChg} | ${baseRoi} | ${compRoi} | ${roiChg} | ${row.quadrant} |`)
    }
    lines.push('\n*分类按消耗与 ROI 相对变化的 ±1% 阈值判定，并非统计显著性。新增对象/停止投放仅表示当前数据中某阶段无该对象记录，不等于已证实业务启停；存在记录但变化不可计算时标为数据不足。*\n')
  } else {
    lines.push(`所选阶段与${dimension}维度没有可用明细，本次仅生成阶段整体指标对比。\n`)
  }

  lines.push('## 4. 规则化诊断发现\n')
  if (findings && findings.length > 0) {
    for (const f of findings) {
      lines.push(`- **${f.title}**：${f.text}`)
    }
  } else {
    lines.push('- 暂无特殊异常或显著变化发现。')
  }
  lines.push('')

  lines.push('## 5. 数据完整性与口径说明\n')
  if (warnings && warnings.length > 0) {
    for (const w of warnings) {
      lines.push(`- **提示**：${w}`)
    }
  }
  const missingOptional = []
  for (const [key, label] of Object.entries({ impressions: '展现量', clicks: '点击量', carts: '加购数', paidUsers: '成交人数', paidOrders: '成交笔数', newCustomers: '成交新客数', favoriteCarts: '收藏加购数' })) {
    if (baseStage.summary[key] === null || comparisonStage.summary[key] === null) missingOptional.push(label)
  }
  if (baseStage.summary.visits === null || comparisonStage.summary.visits === null) {
    missingOptional.push('引导访问人数（影响引导访问率及潜客占比计算）')
  }
  if (baseStage.summary.potentialVisits === null || comparisonStage.summary.potentialVisits === null) {
    missingOptional.push('引导访问潜客数（影响潜客占比计算）')
  }
  if (baseStage.summary.favorites === null || comparisonStage.summary.favorites === null) {
    missingOptional.push('收藏数')
  }
  if (baseStage.summary.memberships === null || comparisonStage.summary.memberships === null) {
    missingOptional.push('入会量（影响会员获客成本计算）')
  }
  if (missingOptional.length > 0) {
    lines.push(`- **未提供可选字段**：${missingOptional.join('、')}。相关衍生指标保留为空，未擅自补零或填充行业预估值。`)
  } else {
    lines.push('- 阶段核心及可选字段均已完整提供。')
  }
  lines.push('- **因果与统计边界**：本对比基于真实录入数据的算术汇总与规则对比，不作为因果推断结论，亦不包含假设检验或统计显著性判定。投放优化请结合商品生命周期与店铺整体目标。')
  lines.push('')

  return lines.join('\n')
}

export async function readInput(inputPath) {
  const ext = path.extname(inputPath).toLowerCase()
  if (ext === '.xlsx' || ext === '.xls') {
    let workbookModule
    try {
      workbookModule = await import('../src/workbook.ts')
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('xlsx')) {
        fail('在当前环境读取 Excel (.xlsx) 需要安装 xlsx 依赖。独立 Skill 包不包含私有 node_modules。请使用 Agent 将原表字段映射后传入标准 JSON，或在已安装依赖的工程环境中执行。')
      }
      throw err
    }
    const buffer = await readFile(inputPath)
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    const dataset = workbookModule.parseWorkbook(arrayBuffer)
    return {
      taskName: '万相台阶段对比分析（Excel导入）',
      stages: dataset.stages,
      details: dataset.details,
    }
  }

  const content = await readFile(inputPath, 'utf8')
  try {
    return JSON.parse(content)
  } catch (err) {
    fail(`输入文件不是有效的 JSON：${err.message}`)
  }
}

export function executeAnalysis(rawInput) {
  const validated = validateDatasetInput(rawInput)
  const { taskName, baseStage: baseStageName, comparisonStage: compStageName, dimension, stages, details, warnings } = validated

  const baseRow = stages.find((s) => s.stage === baseStageName)
  const compRow = stages.find((s) => s.stage === compStageName)

  const baseSummary = summarize(baseRow ? [baseRow] : [])
  const compSummary = summarize(compRow ? [compRow] : [])

  const metrics = buildComparison(baseSummary, compSummary)
  const detailRows = details.length > 0 ? aggregateDetails(details, dimension, baseStageName, compStageName) : []
  const findings = buildFindings(baseSummary, compSummary, detailRows, dimension)
  if (details.length > 0 && detailRows.length === 0) warnings.push(`所选阶段与${dimension}维度没有可用明细，无法进行该维度下钻。`)

  const result = {
    taskName,
    status: metrics.some((row) => row.baseValue === null || row.comparisonValue === null) ? 'partial' : 'complete',
    disclaimer: '本分析为两阶段规则化指标对照与对象变动分类，非因果归因或统计显著性承诺。投放调整与经营决策需结合行业淡旺季、货品周期与整体经营策略综合研判。',
    attributionScope: {
      attributionModel: stages[0].attributionModel,
      attributionDays: stages[0].attributionDays,
      conversionScope: stages[0].conversionScope,
    },
    baseStage: {
      name: baseStageName,
      startDate: baseRow.startDate,
      endDate: baseRow.endDate,
      promotionScene: baseRow.promotionScene,
      summary: baseSummary,
    },
    comparisonStage: {
      name: compStageName,
      startDate: compRow.startDate,
      endDate: compRow.endDate,
      promotionScene: compRow.promotionScene,
      summary: compSummary,
    },
    metrics,
    dimension,
    detailRows,
    findings,
    warnings,
  }

  return {
    result,
    markdown: buildReport(result),
  }
}

async function main() {
  assertNodeVersion()

  const [inputPath, outputDirectory, ...extraArguments] = process.argv.slice(2)
  if (!inputPath || extraArguments.length > 0) {
    fail('用法：node apps/universalbp-analysis/agent/analyze.mjs <input.json|input.xlsx> [output-directory]')
  }

  const resolvedInputPath = path.resolve(inputPath)
  const rawInput = await readInput(resolvedInputPath)
  const { result, markdown } = executeAnalysis(rawInput)

  if (outputDirectory !== undefined) {
    const resolvedOutDir = path.resolve(outputDirectory)
    await mkdir(resolvedOutDir, { recursive: true })
    await Promise.all([
      writeFile(path.join(resolvedOutDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8'),
      writeFile(path.join(resolvedOutDir, 'report.md'), markdown, 'utf8'),
    ])
  }

  process.stdout.write(`${JSON.stringify(result)}\n`)
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

// Only execute main when directly called via CLI
if (isDirectExecution()) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : '未知错误。'
    process.stdout.write(`${JSON.stringify({ error: message })}\n`)
    process.exitCode = 1
  })
}
