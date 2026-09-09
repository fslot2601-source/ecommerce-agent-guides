export type RiskLevel = 'high' | 'evidence' | 'context'

export type ComplianceRule = {
  phrases: string[]
  level: RiskLevel
  category: string
  reason: string
  suggestion: string
}

export type TextMatch = {
  phrase: string
  start: number
  end: number
  rule: ComplianceRule
}

export const complianceRules: ComplianceRule[] = [
  {
    phrases: ['国家级', '世界级', '宇宙级', '最高级', '最佳', '最好', '最强', '最优', '最安全', '最有效', '最专业', '最先进', '最便宜', '最低价', '顶级', '极品', '极致', '至尊', '巅峰', '无敌', '万能', '绝无仅有', '独一无二'],
    level: 'high',
    category: '绝对化表达',
    reason: '可能构成最高级、最佳或近似含义的绝对化宣传。',
    suggestion: '删除绝对化结论，改为可客观验证的商品特征。',
  },
  {
    phrases: ['全网最低', '史上最低', '价格最低', '行业最低', '全网第一', '全国第一', '世界第一', '行业第一', '销量第一', '排名第一', 'TOP1', 'NO.1', '冠军品牌', '销量冠军', '遥遥领先'],
    level: 'evidence',
    category: '排名与价格宣传',
    reason: '排名、销量或价格结论需要明确统计范围、时间和可靠依据。',
    suggestion: '无法提供完整证明材料时删除；有依据时写明平台、周期和数据来源。',
  },
  {
    phrases: ['唯一', '独家', '首创', '首家', '首个', '首次', '全球首发', '全国首发', '官方指定', '官方推荐', '国家认证', '专家推荐', '医生推荐', '权威推荐', '领导品牌', '领军品牌'],
    level: 'evidence',
    category: '身份与背书',
    reason: '唯一性、首创性、官方身份或专业背书通常需要有效依据。',
    suggestion: '核实授权、认证或证明材料；无法证明时删除。',
  },
  {
    phrases: ['100%有效', '百分百有效', '保证有效', '保证满意', '绝对有效', '永久有效', '永不反弹', '绝不褪色', '绝不掉色', '零风险', '无风险', '无副作用', '立即见效', '一次见效', '当天见效', '包过', '包治', '根治', '治愈'],
    level: 'high',
    category: '效果与保证',
    reason: '对效果、安全性或结果作出确定性保证，存在较高宣传风险。',
    suggestion: '改为具体功能、使用条件和客观参数，不保证必然结果。',
  },
  {
    phrases: ['第一', '领先', '顶尖', '王牌', '永久', '绝对', '完全', '人人都在用', '一致好评', '最受欢迎'],
    level: 'context',
    category: '需要结合语境',
    reason: '该词不一定违规，需要结合是否指向商品效果、质量、排名或市场地位判断。',
    suggestion: '检查完整句子；用于步骤、时间、规格或经营理念时可能不属于绝对化宣传。',
  },
]

export const riskLabels: Record<RiskLevel, string> = {
  high: '高风险',
  evidence: '需证明',
  context: '结合语境',
}

export function scanText(text: string): TextMatch[] {
  const normalized = text.toLocaleLowerCase('zh-CN')
  const candidates: TextMatch[] = []

  for (const rule of complianceRules) {
    for (const phrase of rule.phrases) {
      const target = phrase.toLocaleLowerCase('zh-CN')
      let offset = 0
      while (offset < normalized.length) {
        const start = normalized.indexOf(target, offset)
        if (start < 0) break
        candidates.push({ phrase: text.slice(start, start + phrase.length), start, end: start + phrase.length, rule })
        offset = start + Math.max(1, phrase.length)
      }
    }
  }

  candidates.sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start))
  const matches: TextMatch[] = []
  for (const candidate of candidates) {
    if (matches.some((match) => candidate.start < match.end && candidate.end > match.start)) continue
    matches.push(candidate)
  }
  return matches.sort((left, right) => left.start - right.start)
}

export const quoteBreaks = '\n。！？；'

export function getSourceQuote(text: string, start: number, end: number): string {
  let quoteStart = start
  while (quoteStart > 0 && !quoteBreaks.includes(text[quoteStart - 1])) quoteStart -= 1
  let quoteEnd = end
  while (quoteEnd < text.length && !quoteBreaks.includes(text[quoteEnd])) quoteEnd += 1
  const quote = text.slice(quoteStart, quoteEnd).trim()
  if (quote.length <= 120) return quote
  const from = Math.max(0, start - quoteStart - 45)
  const to = Math.min(quote.length, end - quoteStart + 45)
  return `${from > 0 ? '…' : ''}${quote.slice(from, to).trim()}${to < quote.length ? '…' : ''}`
}
