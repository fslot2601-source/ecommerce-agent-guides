import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSourceQuote, riskLabels, scanText } from '../src/rules.ts'

const UNCERTAIN_MARKER_REGEX = /\[(无法识别|模糊|不确定|识别失败|缺损|缺失|\.\.\.|\?)\]/g
const DISCLAIMER = '本检查仅基于内置固定词库进行基础特征初筛，不替代人工专业审查及法律认定；词库未命中不等于宣传内容绝对合规。请结合具体类目、平台细则及证明材料综合判断。'

function fail(message) {
  const errorObj = { error: message }
  console.error(JSON.stringify(errorObj))
  process.exit(1)
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 18)) {
    fail('需要 Node.js 22.18 或更高版本。')
  }
}

function findUncertainMarkers(text) {
  const matches = text.match(UNCERTAIN_MARKER_REGEX)
  return matches ? [...new Set(matches)] : []
}

async function readInputText(arg) {
  if (typeof arg !== 'string') {
    fail('输入参数必须是文件路径或文本内容。')
  }

  // The CLI accepts files only: a missing file must never be scanned as its path.
  let raw
  try {
    raw = await readFile(arg, 'utf8')
  } catch {
    fail(`无法读取输入文件：${arg}`)
  }
  const isJsonFile = arg.toLowerCase().endsWith('.json')

  // If input is a JSON file or JSON-formatted string, parse it
  const trimmed = raw.trim()
  if (isJsonFile || (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === 'string') {
        return parsed
      }
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Allowed keys for text payload
        const candidateText = parsed.text ?? parsed.content ?? parsed.ocrText ?? parsed.rawText
        if (candidateText !== undefined) {
          if (typeof candidateText !== 'string') {
            fail('输入 JSON 中的文本字段（text / content / ocrText）必须是字符串。')
          }
          return candidateText
        }
        // If empty object passed
        if (Object.keys(parsed).length === 0) {
          return ''
        }
        fail('输入 JSON 必须包含 text、content 或 ocrText 字段，或作为空对象 {} 传入。')
      }
      fail('输入 JSON 顶层必须是对象或字符串。')
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('输入 JSON')) {
        fail(e.message)
      }
      fail(`解析 JSON 输入文件失败：${e instanceof Error ? e.message : '无效 JSON'}`)
    }
  }

  return raw
}

export function checkCompliance(text) {
  if (typeof text !== 'string') {
    fail('待检查文本必须是字符串。')
  }

  const trimmed = text.trim()
  const uncertainMarkers = findUncertainMarkers(text)

  if (trimmed.length === 0) {
    return {
      text,
      status: 'empty',
      summary: '待检文案为空，未检测到任何文本内容。请提供需检查的文案或图片识别文本。',
      stats: {
        charCount: 0,
        totalMatches: 0,
        highRiskCount: 0,
        evidenceCount: 0,
        contextCount: 0,
        uncertainMarkerCount: uncertainMarkers.length,
      },
      matches: [],
      contextReviewItems: [],
      uncertainMarkers,
      disclaimer: DISCLAIMER,
    }
  }

  const rawMatches = scanText(text)
  const uniqueMatches = []

  for (const match of rawMatches) {
    const quote = getSourceQuote(text, match.start, match.end)
    uniqueMatches.push({
      phrase: match.phrase,
      start: match.start,
      end: match.end,
      level: match.rule.level,
      levelLabel: riskLabels[match.rule.level] || match.rule.level,
      category: match.rule.category,
      reason: match.rule.reason,
      suggestion: match.rule.suggestion,
      quote,
      needsContextReview: match.rule.level === 'context' || match.rule.category === '需要结合语境',
    })
  }

  const highRiskCount = uniqueMatches.filter((m) => m.level === 'high').length
  const evidenceCount = uniqueMatches.filter((m) => m.level === 'evidence').length
  const contextCount = uniqueMatches.filter((m) => m.level === 'context').length
  const contextReviewItems = uniqueMatches.filter((m) => m.needsContextReview)

  let status = 'clean'
  let summary = '未命中内置预置风险词库；这不代表整体宣传合规。'
  if (highRiskCount > 0) {
    status = 'high_risk'
    summary = `命中 ${highRiskCount} 处词库高风险表达，请结合原句、使用范围与证据复核，不直接作违法认定。`
  } else if (evidenceCount > 0) {
    status = 'evidence_required'
    summary = `发现 ${evidenceCount} 处需证明宣传（排名/价格/背书），需备齐证明材料或补充来源范围。`
  } else if (contextCount > 0) {
    status = 'context_review'
    summary = `发现 ${contextCount} 处需要结合具体语境判断的词汇，请人工复核使用场景。`
  }

  if (uncertainMarkers.length > 0) {
    if (status === 'clean') status = 'incomplete'
    summary += ' 存在无法确认的文字，本次检查不完整，需对照原图校对。'
  }

  return {
    text,
    status,
    summary,
    stats: {
      charCount: text.length,
      totalMatches: uniqueMatches.length,
      highRiskCount,
      evidenceCount,
      contextCount,
      uncertainMarkerCount: uncertainMarkers.length,
    },
    matches: uniqueMatches,
    contextReviewItems,
    uncertainMarkers,
    disclaimer: DISCLAIMER,
  }
}

export function generateMarkdownReport(result) {
  const lines = []
  lines.push('# 电商图片与文案基础合规检查报告')
  lines.push('')
  lines.push('## 1. 检查结论与概况')
  lines.push('')
  lines.push(`- **检查结论**：${result.summary}`)
  lines.push(`- **文本字数**：${result.stats.charCount} 字符`)
  lines.push(`- **命中风险项**：共 ${result.stats.totalMatches} 项（高风险：${result.stats.highRiskCount}，需证明：${result.stats.evidenceCount}，结合语境：${result.stats.contextCount}）`)
  if (result.stats.uncertainMarkerCount > 0) {
    lines.push(`- **图像识别不确定标记**：检测到 ${result.stats.uncertainMarkerCount} 处不确定标记（如 ${result.uncertainMarkers.join('、')}）`)
  }
  lines.push('')

  if (result.matches.length > 0) {
    lines.push('## 2. 风险词明细表')
    lines.push('')
    lines.push('| 风险词 | 风险等级 | 类别 | 上下文原句 | 处理建议 |')
    lines.push('| --- | --- | --- | --- | --- |')
    for (const item of result.matches) {
      const cleanQuote = item.quote.replaceAll('\n', ' ').replaceAll('|', '\\|')
      const cleanReason = item.reason.replaceAll('\n', ' ').replaceAll('|', '\\|')
      const cleanSuggestion = item.suggestion.replaceAll('\n', ' ').replaceAll('|', '\\|')
      lines.push(`| ${item.phrase} | ${item.levelLabel} | ${item.category} | ${cleanQuote} | ${cleanSuggestion}（${cleanReason}） |`)
    }
    lines.push('')
  } else if (result.status === 'clean' || result.status === 'incomplete') {
    lines.push('## 2. 检查结果')
    lines.push('')
    lines.push('文案中未检测到内置词库所列的绝对化用语、夸大宣传或背书风险词。')
    lines.push('')
  } else {
    lines.push('## 2. 检查结果')
    lines.push('')
    lines.push('未提供有效待检文本。')
    lines.push('')
  }

  if (result.contextReviewItems.length > 0) {
    lines.push('## 3. 需语境复核项说明')
    lines.push('')
    lines.push('以下词汇不一定违规，必须结合其在句子中的实际指向进行人工复核：')
    lines.push('')
    for (const item of result.contextReviewItems) {
      lines.push(`- **「${item.phrase}」**（上下文：\`${item.quote.replaceAll('\n', ' ')}\`）`)
      lines.push(`  - **判定依据**：${item.reason}`)
      lines.push(`  - **人工核对建议**：${item.suggestion}`)
    }
    lines.push('')
    lines.push('> **说明**：如词汇仅用于指示操作步骤（如“第一步”）、规格批次、时间顺序或服务愿景，通常不构成违规；若用于修饰产品效果、技术水平、行业排名或市场地位，则属于绝对化宣传风险。')
    lines.push('')
  }

  if (result.uncertainMarkers.length > 0) {
    lines.push('## 4. 图像识别不确定标记提示')
    lines.push('')
    lines.push(`检测到以下文字识别不确定标记：\`${result.uncertainMarkers.join('`, `')}\``)
    lines.push('此标记表明原图该处文字可能模糊、被遮挡或无法完全确认。建议对照原图人工校对对应文案，确认真实词句后再做合规判断。')
    lines.push('')
  }

  lines.push('## 合规边界与声明')
  lines.push('')
  lines.push('1. **基础词库初筛**：本工具仅针对预置的常见电商禁用词、极限词和需背书词汇进行规则匹配，不替代人工法务审核、行政监管判定或平台官方审查。')
  lines.push('2. **未命中不等于合规**：未检出风险词不代表整体宣传必然合法，仍需遵守《广告法》及类目专门规范，并确保所陈述事实真实、有据可查。')
  lines.push('3. **证明材料复核**：涉及排名、独家或背书的宣传，应核实适用范围、时间和已有证明材料。所需证据取决于具体表述与规则，不能一概要求官方证书，也不意味着取得材料就必然合规。')
  lines.push('')

  return lines.join('\n')
}

async function main() {
  assertNodeVersion()

  const [inputArg, outputArg, ...extra] = process.argv.slice(2)
  if (inputArg === undefined || extra.length > 0) {
    fail('用法：node check.mjs <input.json 或文本文件> [输出目录]')
  }

  const text = await readInputText(inputArg)
  const result = checkCompliance(text)
  const report = generateMarkdownReport(result)

  if (outputArg) {
    const resolvedOutput = path.resolve(process.cwd(), outputArg)
    await mkdir(resolvedOutput, { recursive: true })
    await writeFile(path.join(resolvedOutput, 'result.json'), JSON.stringify(result, null, 2) + '\n', 'utf8')
    await writeFile(path.join(resolvedOutput, 'report.md'), report + '\n', 'utf8')
  }

  console.log(JSON.stringify(result, null, 2))
}

function isDirectRun() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isDirectRun()) {
  main().catch((err) => {
    fail(err instanceof Error ? err.message : String(err))
  })
}
