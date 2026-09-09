import * as XLSX from 'xlsx'
import {
  DIMENSIONS,
  type Dataset,
  type DetailRow,
  type Dimension,
  type StageRow,
} from './analyticsCore.ts'

type XlsxUtils = typeof XLSX.utils

const STAGE_HEADERS = {
  stage: '分析阶段',
  startDate: '开始日期',
  endDate: '结束日期',
  promotionScene: '推广场景',
  attributionModel: '归因口径',
  attributionDays: '归因周期（天）',
  conversionScope: '成交口径',
  spend: '广告消耗',
  impressions: '展现量',
  clicks: '点击量',
  visits: '引导访问人数',
  potentialVisits: '引导访问潜客数',
  favorites: '收藏数',
  carts: '加购数',
  favoriteCarts: '收藏加购数',
  paidUsers: '成交人数',
  paidOrders: '成交笔数',
  revenue: '成交金额',
  newCustomers: '成交新客数',
  memberships: '入会量',
} as const

const DETAIL_HEADERS = {
  stage: '分析阶段',
  dimension: '分析维度',
  objectCode: '对象编码',
  objectName: '对象名称',
  campaignCode: '所属计划编码',
  campaignName: '所属计划名称',
  promotionScene: '推广场景',
  date: '日期',
  spend: '广告消耗',
  impressions: '展现量',
  clicks: '点击量',
  visits: '引导访问人数',
  favorites: '收藏数',
  carts: '加购数',
  favoriteCarts: '收藏加购数',
  paidUsers: '成交人数',
  paidOrders: '成交笔数',
  revenue: '成交金额',
  newCustomers: '成交新客数',
  memberships: '入会量',
} as const

const REQUIRED_STAGE_HEADERS = [
  '分析阶段',
  '开始日期',
  '结束日期',
  '推广场景',
  '归因口径',
  '归因周期（天）',
  '成交口径',
  '广告消耗',
  '展现量',
  '点击量',
  '加购数',
  '成交人数',
  '成交笔数',
  '成交金额',
  '成交新客数',
]

const REQUIRED_DETAIL_HEADERS = [
  '分析阶段',
  '分析维度',
  '对象名称',
  '推广场景',
  '广告消耗',
  '展现量',
  '点击量',
  '加购数',
  '成交人数',
  '成交笔数',
  '成交金额',
  '成交新客数',
]

function parseNumber(value: unknown, required: boolean, rowNumber: number, label: string) {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (required) throw new Error(`第 ${rowNumber} 行“${label}”不能为空。`)
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[¥￥,%\s]/g, '').replaceAll(',', ''))
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`第 ${rowNumber} 行“${label}”必须是非负数。`)
  return parsed
}

function parseText(value: unknown, required: boolean, rowNumber: number, label: string) {
  const parsed = String(value ?? '').trim()
  if (required && !parsed) throw new Error(`第 ${rowNumber} 行“${label}”不能为空。`)
  return parsed
}

function parseDate(value: unknown, required: boolean, rowNumber: number, label: string) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${value.getFullYear()}-${month}-${day}`
  }
  if (typeof value === 'number') {
    const parsed = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000))
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  const text = parseText(value, required, rowNumber, label)
  if (!text) return ''
  const timestamp = Date.parse(text)
  if (!Number.isFinite(timestamp)) throw new Error(`第 ${rowNumber} 行“${label}”不是有效日期。`)
  return text
}

function assertHeaders(sheet: XLSX.WorkSheet, requiredHeaders: string[], sheetName: string, utils: XlsxUtils) {
  const matrix = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  const headers = (matrix[0] ?? []).map((value) => String(value).trim())
  const missing = requiredHeaders.filter((header) => !headers.includes(header))
  if (missing.length > 0) throw new Error(`“${sheetName}”缺少字段：${missing.join('、')}。`)
}

function readStageRows(sheet: XLSX.WorkSheet, utils: XlsxUtils) {
  assertHeaders(sheet, REQUIRED_STAGE_HEADERS, '阶段汇总', utils)
  const records = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
  if (records.length < 2) throw new Error('“阶段汇总”至少需要两行数据。')
  return records.map((record, index): StageRow => {
    const rowNumber = index + 2
    const startDate = parseDate(record[STAGE_HEADERS.startDate], true, rowNumber, STAGE_HEADERS.startDate)
    const endDate = parseDate(record[STAGE_HEADERS.endDate], true, rowNumber, STAGE_HEADERS.endDate)
    if (Date.parse(startDate) > Date.parse(endDate)) throw new Error(`第 ${rowNumber} 行开始日期不能晚于结束日期。`)
    const paidUsers = parseNumber(record[STAGE_HEADERS.paidUsers], true, rowNumber, STAGE_HEADERS.paidUsers) ?? 0
    const newCustomers = parseNumber(record[STAGE_HEADERS.newCustomers], true, rowNumber, STAGE_HEADERS.newCustomers) ?? 0
    if (newCustomers > paidUsers) throw new Error(`第 ${rowNumber} 行成交新客数不能大于成交人数。`)
    return {
      stage: parseText(record[STAGE_HEADERS.stage], true, rowNumber, STAGE_HEADERS.stage),
      startDate,
      endDate,
      promotionScene: parseText(record[STAGE_HEADERS.promotionScene], true, rowNumber, STAGE_HEADERS.promotionScene),
      attributionModel: parseText(record[STAGE_HEADERS.attributionModel], true, rowNumber, STAGE_HEADERS.attributionModel),
      attributionDays: parseNumber(record[STAGE_HEADERS.attributionDays], true, rowNumber, STAGE_HEADERS.attributionDays) ?? 0,
      conversionScope: parseText(record[STAGE_HEADERS.conversionScope], true, rowNumber, STAGE_HEADERS.conversionScope),
      spend: parseNumber(record[STAGE_HEADERS.spend], true, rowNumber, STAGE_HEADERS.spend) ?? 0,
      impressions: parseNumber(record[STAGE_HEADERS.impressions], true, rowNumber, STAGE_HEADERS.impressions) ?? 0,
      clicks: parseNumber(record[STAGE_HEADERS.clicks], true, rowNumber, STAGE_HEADERS.clicks) ?? 0,
      visits: parseNumber(record[STAGE_HEADERS.visits], false, rowNumber, STAGE_HEADERS.visits),
      potentialVisits: parseNumber(record[STAGE_HEADERS.potentialVisits], false, rowNumber, STAGE_HEADERS.potentialVisits),
      favorites: parseNumber(record[STAGE_HEADERS.favorites], false, rowNumber, STAGE_HEADERS.favorites),
      carts: parseNumber(record[STAGE_HEADERS.carts], true, rowNumber, STAGE_HEADERS.carts) ?? 0,
      favoriteCarts: parseNumber(record[STAGE_HEADERS.favoriteCarts], false, rowNumber, STAGE_HEADERS.favoriteCarts),
      paidUsers,
      paidOrders: parseNumber(record[STAGE_HEADERS.paidOrders], true, rowNumber, STAGE_HEADERS.paidOrders) ?? 0,
      revenue: parseNumber(record[STAGE_HEADERS.revenue], true, rowNumber, STAGE_HEADERS.revenue) ?? 0,
      newCustomers,
      memberships: parseNumber(record[STAGE_HEADERS.memberships], false, rowNumber, STAGE_HEADERS.memberships),
    }
  })
}

function readDetailRows(sheet: XLSX.WorkSheet | undefined, stageNames: Set<string>, warnings: string[], utils: XlsxUtils) {
  if (!sheet) {
    warnings.push('未找到“颗粒度明细”工作表，整体对比可正常使用。')
    return []
  }
  assertHeaders(sheet, REQUIRED_DETAIL_HEADERS, '颗粒度明细', utils)
  const records = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
  return records.flatMap((record, index): DetailRow[] => {
    const rowNumber = index + 2
    if (Object.values(record).every((value) => String(value ?? '').trim() === '')) return []
    const stage = parseText(record[DETAIL_HEADERS.stage], true, rowNumber, DETAIL_HEADERS.stage)
    if (!stageNames.has(stage)) throw new Error(`“颗粒度明细”第 ${rowNumber} 行的分析阶段未出现在“阶段汇总”中。`)
    const dimensionText = parseText(record[DETAIL_HEADERS.dimension], true, rowNumber, DETAIL_HEADERS.dimension)
    if (!DIMENSIONS.includes(dimensionText as Dimension)) throw new Error(`“颗粒度明细”第 ${rowNumber} 行分析维度必须是：${DIMENSIONS.join('、')}。`)
    const paidUsers = parseNumber(record[DETAIL_HEADERS.paidUsers], true, rowNumber, DETAIL_HEADERS.paidUsers) ?? 0
    const newCustomers = parseNumber(record[DETAIL_HEADERS.newCustomers], true, rowNumber, DETAIL_HEADERS.newCustomers) ?? 0
    if (newCustomers > paidUsers) throw new Error(`“颗粒度明细”第 ${rowNumber} 行成交新客数不能大于成交人数。`)
    return [{
      stage,
      dimension: dimensionText as Dimension,
      objectCode: parseText(record[DETAIL_HEADERS.objectCode], false, rowNumber, DETAIL_HEADERS.objectCode),
      objectName: parseText(record[DETAIL_HEADERS.objectName], true, rowNumber, DETAIL_HEADERS.objectName),
      campaignCode: parseText(record[DETAIL_HEADERS.campaignCode], false, rowNumber, DETAIL_HEADERS.campaignCode),
      campaignName: parseText(record[DETAIL_HEADERS.campaignName], false, rowNumber, DETAIL_HEADERS.campaignName),
      promotionScene: parseText(record[DETAIL_HEADERS.promotionScene], true, rowNumber, DETAIL_HEADERS.promotionScene),
      date: parseDate(record[DETAIL_HEADERS.date], false, rowNumber, DETAIL_HEADERS.date),
      spend: parseNumber(record[DETAIL_HEADERS.spend], true, rowNumber, DETAIL_HEADERS.spend) ?? 0,
      impressions: parseNumber(record[DETAIL_HEADERS.impressions], true, rowNumber, DETAIL_HEADERS.impressions) ?? 0,
      clicks: parseNumber(record[DETAIL_HEADERS.clicks], true, rowNumber, DETAIL_HEADERS.clicks) ?? 0,
      visits: parseNumber(record[DETAIL_HEADERS.visits], false, rowNumber, DETAIL_HEADERS.visits),
      favorites: parseNumber(record[DETAIL_HEADERS.favorites], false, rowNumber, DETAIL_HEADERS.favorites),
      carts: parseNumber(record[DETAIL_HEADERS.carts], true, rowNumber, DETAIL_HEADERS.carts) ?? 0,
      favoriteCarts: parseNumber(record[DETAIL_HEADERS.favoriteCarts], false, rowNumber, DETAIL_HEADERS.favoriteCarts),
      paidUsers,
      paidOrders: parseNumber(record[DETAIL_HEADERS.paidOrders], true, rowNumber, DETAIL_HEADERS.paidOrders) ?? 0,
      revenue: parseNumber(record[DETAIL_HEADERS.revenue], true, rowNumber, DETAIL_HEADERS.revenue) ?? 0,
      newCustomers,
      memberships: parseNumber(record[DETAIL_HEADERS.memberships], false, rowNumber, DETAIL_HEADERS.memberships),
    }]
  })
}

export function parseWorkbook(buffer: ArrayBuffer): Dataset {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const stageSheet = workbook.Sheets['阶段汇总']
  if (!stageSheet) throw new Error('未找到“阶段汇总”工作表，请使用本站模板。')
  const warnings: string[] = []
  const stages = readStageRows(stageSheet, XLSX.utils)
  const stageNames = stages.map((row) => row.stage)
  if (new Set(stageNames).size !== stageNames.length) throw new Error('“阶段汇总”的分析阶段名称不能重复。')
  const attributionModels = new Set(stages.map((row) => row.attributionModel))
  const attributionDays = new Set(stages.map((row) => row.attributionDays))
  const conversionScopes = new Set(stages.map((row) => row.conversionScope))
  if (attributionModels.size > 1) throw new Error('不同阶段的归因口径不一致，不能直接对比。')
  if (attributionDays.size > 1) throw new Error('不同阶段的归因周期不一致，不能直接对比。')
  if (conversionScopes.size > 1) throw new Error('不同阶段的成交口径不一致，不能直接对比。')
  const details = readDetailRows(workbook.Sheets['颗粒度明细'], new Set(stageNames), warnings, XLSX.utils)
  if (details.length === 0) warnings.push('颗粒度明细为空，将只展示阶段汇总分析。')
  return { stages, details, warnings }
}
