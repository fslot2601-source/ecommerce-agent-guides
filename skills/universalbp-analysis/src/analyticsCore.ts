export const DIMENSIONS = ['计划', '商品', '人群', '关键词', '创意', '地域'] as const
export type Dimension = typeof DIMENSIONS[number]

export type OptionalMetric = 'visits' | 'potentialVisits' | 'favorites' | 'favoriteCarts' | 'memberships'

export type StageRow = {
  stage: string
  startDate: string
  endDate: string
  promotionScene: string
  attributionModel: string
  attributionDays: number
  conversionScope: string
  spend: number
  impressions: number | null
  clicks: number | null
  visits: number | null
  potentialVisits: number | null
  favorites: number | null
  carts: number | null
  favoriteCarts: number | null
  paidUsers: number | null
  paidOrders: number | null
  revenue: number
  newCustomers: number | null
  memberships: number | null
}

export type DetailRow = {
  stage: string
  dimension: Dimension
  objectCode: string
  objectName: string
  campaignCode: string
  campaignName: string
  promotionScene: string
  date: string
  spend: number
  impressions: number | null
  clicks: number | null
  visits: number | null
  favorites: number | null
  carts: number | null
  favoriteCarts: number | null
  paidUsers: number | null
  paidOrders: number | null
  revenue: number
  newCustomers: number | null
  memberships: number | null
}

export type Dataset = {
  stages: StageRow[]
  details: DetailRow[]
  warnings: string[]
}

export type Summary = {
  spend: number
  impressions: number | null
  clicks: number | null
  carts: number | null
  paidUsers: number | null
  paidOrders: number | null
  revenue: number
  newCustomers: number | null
  visits: number | null
  potentialVisits: number | null
  favorites: number | null
  favoriteCarts: number | null
  memberships: number | null
  roi: number | null
  ctr: number | null
  cpc: number | null
  cpm: number | null
  visitRate: number | null
  potentialVisitShare: number | null
  cartRate: number | null
  cartCost: number | null
  cvr: number | null
  cac: number | null
  orderCost: number | null
  newCustomerCac: number | null
  newCustomerShare: number | null
  averageOrderValue: number | null
  paidUsersPer10k: number | null
  cartsPer10k: number | null
  membershipCost: number | null
}

export type MetricFormat = 'money' | 'integer' | 'percent' | 'multiple'
export type Tone = 'positive' | 'negative' | 'neutral'

export type ComparisonMetric = {
  label: string
  formula: string
  baseValue: number | null
  comparisonValue: number | null
  change: number | null
  changeMode: 'relative' | 'point'
  format: MetricFormat
  judgment: string
  tone: Tone
}

export type GranularityRow = {
  key: string
  code: string
  name: string
  base: Summary
  comparison: Summary
  spendChange: number | null
  roiChange: number | null
  quadrant: '放量增效' | '放量降效' | '缩量增效' | '缩量降效' | '新增对象' | '停止投放' | '基本持平' | '数据不足'
}

export type Finding = { title: string; text: string; tone: 'good' | 'warn' | 'info' }

export type UniversalbpAnalysisInput = {
  taskName?: string
  baseStage?: string
  comparisonStage?: string
  dimension?: Dimension
  stages: StageRow[]
  details?: DetailRow[]
}

export type UniversalbpAnalysisResult = {
  taskName: string
  status: 'complete' | 'partial'
  disclaimer: string
  attributionScope: {
    attributionModel: string
    attributionDays: number
    conversionScope: string
  }
  baseStage: {
    name: string
    startDate: string
    endDate: string
    promotionScene: string
    summary: Summary
  }
  comparisonStage: {
    name: string
    startDate: string
    endDate: string
    promotionScene: string
    summary: Summary
  }
  metrics: ComparisonMetric[]
  dimension: Dimension
  detailRows: GranularityRow[]
  findings: Finding[]
  warnings: string[]
}

export function ratio(numerator: number | null, denominator: number | null, scale = 1): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null
  return (numerator / denominator) * scale
}

export function sumOptional(rows: Array<StageRow | DetailRow>, key: OptionalMetric): number | null {
  const values = rows.map((row) => (key === 'potentialVisits' ? ('potentialVisits' in row ? row.potentialVisits : null) : row[key]))
  if (values.length === 0 || values.some((value) => value === null)) return null
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}

export function summarize(rows: Array<StageRow | DetailRow>): Summary {
  const sumKnown = (key: 'impressions' | 'clicks' | 'carts' | 'paidUsers' | 'paidOrders' | 'newCustomers') => {
    if (rows.length === 0 || rows.some((row) => row[key] === null)) return null
    return rows.reduce((sum, row) => sum + (row[key] ?? 0), 0)
  }
  const total = {
    spend: rows.reduce((sum, row) => sum + row.spend, 0),
    revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    impressions: sumKnown('impressions'), clicks: sumKnown('clicks'), carts: sumKnown('carts'),
    paidUsers: sumKnown('paidUsers'), paidOrders: sumKnown('paidOrders'), newCustomers: sumKnown('newCustomers'),
  }
  const visits = sumOptional(rows, 'visits')
  const potentialVisits = sumOptional(rows, 'potentialVisits')
  const favorites = sumOptional(rows, 'favorites')
  const favoriteCarts = sumOptional(rows, 'favoriteCarts')
  const memberships = sumOptional(rows, 'memberships')
  return {
    ...total,
    visits,
    potentialVisits,
    favorites,
    favoriteCarts,
    memberships,
    roi: ratio(total.revenue, total.spend),
    ctr: ratio(total.clicks, total.impressions, 100),
    cpc: ratio(total.spend, total.clicks),
    cpm: ratio(total.spend, total.impressions, 1000),
    visitRate: ratio(visits, total.clicks, 100),
    potentialVisitShare: ratio(potentialVisits, visits, 100),
    cartRate: ratio(total.carts, total.clicks, 100),
    cartCost: ratio(total.spend, total.carts),
    cvr: ratio(total.paidUsers, total.clicks, 100),
    cac: ratio(total.spend, total.paidUsers),
    orderCost: ratio(total.spend, total.paidOrders),
    newCustomerCac: ratio(total.spend, total.newCustomers),
    newCustomerShare: ratio(total.newCustomers, total.paidUsers, 100),
    averageOrderValue: ratio(total.revenue, total.paidUsers),
    paidUsersPer10k: ratio(total.paidUsers, total.spend, 10000),
    cartsPer10k: ratio(total.carts, total.spend, 10000),
    membershipCost: ratio(total.spend, memberships),
  }
}

export function metricChange(baseValue: number | null, comparisonValue: number | null, mode: 'relative' | 'point'): number | null {
  if (baseValue === null || comparisonValue === null) return null
  if (mode === 'point') return comparisonValue - baseValue
  if (baseValue === 0) return null
  return ((comparisonValue - baseValue) / Math.abs(baseValue)) * 100
}

export function metricJudgment(change: number | null, mode: 'relative' | 'point', higherIsBetter: boolean | null): { judgment: string; tone: Tone } {
  if (change === null) return { judgment: '数据不足', tone: 'neutral' as const }
  if (higherIsBetter === null) {
    const threshold = mode === 'point' ? 0.5 : 5
    return Math.abs(change) < threshold
      ? { judgment: '规模基本持平', tone: 'neutral' as const }
      : { judgment: change > 0 ? '规模扩大' : '规模收缩', tone: 'neutral' as const }
  }
  const favorable = higherIsBetter ? change : -change
  const significant = mode === 'point' ? 0.5 : 5
  const slight = mode === 'point' ? 0.1 : 1
  if (favorable >= significant) return { judgment: '显著优化', tone: 'positive' as const }
  if (favorable >= slight) return { judgment: '小幅改善', tone: 'positive' as const }
  if (favorable <= -significant) return { judgment: '明显下降', tone: 'negative' as const }
  if (favorable <= -slight) return { judgment: '轻微下降', tone: 'negative' as const }
  return { judgment: '基本持平', tone: 'neutral' as const }
}

export function buildComparison(base: Summary, comparison: Summary): ComparisonMetric[] {
  const definitions: Array<{
    label: string
    formula: string
    key: keyof Summary
    format: MetricFormat
    mode: 'relative' | 'point'
    higherIsBetter: boolean | null
  }> = [
    { label: '广告消耗', formula: '用户填写', key: 'spend', format: 'money', mode: 'relative', higherIsBetter: null },
    { label: '成交金额', formula: '用户填写', key: 'revenue', format: 'money', mode: 'relative', higherIsBetter: true },
    { label: '广告 ROI', formula: '成交金额 ÷ 广告消耗', key: 'roi', format: 'multiple', mode: 'relative', higherIsBetter: true },
    { label: '点击率（CTR）', formula: '点击量 ÷ 展现量', key: 'ctr', format: 'percent', mode: 'point', higherIsBetter: true },
    { label: '平均点击花费（CPC）', formula: '广告消耗 ÷ 点击量', key: 'cpc', format: 'money', mode: 'relative', higherIsBetter: false },
    { label: '支付转化率（CVR）', formula: '成交人数 ÷ 点击量', key: 'cvr', format: 'percent', mode: 'point', higherIsBetter: true },
    { label: '获客成本（CAC）', formula: '广告消耗 ÷ 成交人数', key: 'cac', format: 'money', mode: 'relative', higherIsBetter: false },
    { label: '新客获客成本', formula: '广告消耗 ÷ 成交新客数', key: 'newCustomerCac', format: 'money', mode: 'relative', higherIsBetter: false },
    { label: '每万元成交人数', formula: '成交人数 ÷ 广告消耗 × 10,000', key: 'paidUsersPer10k', format: 'integer', mode: 'relative', higherIsBetter: true },
    { label: '每万元加购数', formula: '加购数 ÷ 广告消耗 × 10,000', key: 'cartsPer10k', format: 'integer', mode: 'relative', higherIsBetter: true },
    { label: '成交新客占比', formula: '成交新客数 ÷ 成交人数', key: 'newCustomerShare', format: 'percent', mode: 'point', higherIsBetter: true },
    { label: '客单价', formula: '成交金额 ÷ 成交人数', key: 'averageOrderValue', format: 'money', mode: 'relative', higherIsBetter: null },
  ]
  return definitions.map((definition) => {
    const baseValue = base[definition.key] as number | null
    const comparisonValue = comparison[definition.key] as number | null
    const change = metricChange(baseValue, comparisonValue, definition.mode)
    return {
      ...definition,
      baseValue,
      comparisonValue,
      change,
      changeMode: definition.mode,
      ...metricJudgment(change, definition.mode, definition.higherIsBetter),
    }
  })
}

export function aggregateDetails(
  details: DetailRow[],
  dimension: Dimension,
  baseStage: string,
  comparisonStage: string
): GranularityRow[] {
  const relevant = details.filter((row) => row.dimension === dimension && (row.stage === baseStage || row.stage === comparisonStage))
  const objectKey = (row: DetailRow) => JSON.stringify([row.objectCode || row.objectName, row.objectName])
  const keys = Array.from(new Set(relevant.map(objectKey)))
  return keys
    .map((key): GranularityRow => {
      const [code, name] = JSON.parse(key) as [string, string]
      const baseRows = relevant.filter((row) => row.stage === baseStage && objectKey(row) === key)
      const comparisonRows = relevant.filter((row) => row.stage === comparisonStage && objectKey(row) === key)
      const base = summarize(baseRows)
      const comparison = summarize(comparisonRows)
      const spendChange = metricChange(base.spend, comparison.spend, 'relative')
      const roiChange = metricChange(base.roi, comparison.roi, 'relative')
      let quadrant: GranularityRow['quadrant'] = '基本持平'
      if (baseRows.length === 0) quadrant = '新增对象'
      else if (comparisonRows.length === 0) quadrant = '停止投放'
      else if (spendChange === null || roiChange === null) quadrant = '数据不足'
      else {
        if (spendChange > 1 && roiChange > 1) quadrant = '放量增效'
        else if (spendChange > 1 && roiChange < -1) quadrant = '放量降效'
        else if (spendChange < -1 && roiChange > 1) quadrant = '缩量增效'
        else if (spendChange < -1 && roiChange < -1) quadrant = '缩量降效'
      }
      return { key, code, name, base, comparison, spendChange, roiChange, quadrant }
    })
    .sort((left, right) => right.comparison.spend - left.comparison.spend || right.base.spend - left.base.spend)
}

function describeChange(label: string, change: number | null) {
  if (change === null) return `${label}相对变化不可计算（数据不足或基准为零）`
  if (change === 0) return `${label}持平`
  return `${label}${change > 0 ? '增加' : '减少'} ${Math.abs(change).toFixed(1)}%`
}

export function buildFindings(
  base: Summary,
  comparison: Summary,
  rows: GranularityRow[],
  dimension: Dimension
): Finding[] {
  const revenueChange = metricChange(base.revenue, comparison.revenue, 'relative')
  const spendChange = metricChange(base.spend, comparison.spend, 'relative')
  const roiChange = metricChange(base.roi, comparison.roi, 'relative')
  const findings: Finding[] = [
    {
      title: '整体规模与效率',
      text: `${describeChange('广告消耗', spendChange)}，${describeChange('成交金额', revenueChange)}，${describeChange('ROI', roiChange)}。`,
      tone: roiChange === null || roiChange === 0 ? 'info' : roiChange > 0 ? 'good' : 'warn',
    },
  ]
  const best = rows
    .filter((row) => row.roiChange !== null && row.roiChange > 0 && row.comparison.spend > 0)
    .sort((left, right) => (right.roiChange ?? 0) - (left.roiChange ?? 0))[0]
  if (best) {
    findings.push({
      title: `${dimension}效率提升`,
      text: `${best.name} 的 ROI 从 ${best.base.roi?.toFixed(2) ?? '—'}x 变为 ${
        best.comparison.roi?.toFixed(2) ?? '—'
      }x，是当前维度下提升最明显的对象。`,
      tone: 'info',
    })
  }
  const warning = rows
    .filter((row) => row.quadrant === '放量降效')
    .sort((left, right) => right.comparison.spend - left.comparison.spend)[0]
  if (warning) {
    findings.push({
      title: '放量但效率下降',
      text: `${warning.name} 的消耗增加 ${Math.abs(warning.spendChange ?? 0).toFixed(1)}%，ROI 下降 ${Math.abs(
        warning.roiChange ?? 0
      ).toFixed(1)}%。`,
      tone: 'warn',
    })
  }
  return findings
}

export function validateNumber(value: unknown, required: boolean, label: string): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    if (required) throw new Error(`“${label}”不能为空。`)
    return null
  }
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error(`“${label}”必须是非负数。`)
  const normalized = typeof value === 'string' ? value.trim().replace(/^[¥￥]/, '').replaceAll(',', '') : value
  if (normalized === '') throw new Error(`“${label}”必须是非负数。`)
  const parsed = typeof normalized === 'number' ? normalized : Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`“${label}”必须是非负数。`)
  }
  return parsed
}

export function validateText(value: unknown, required: boolean, label: string): string {
  const parsed = String(value ?? '').trim()
  if (required && !parsed) {
    throw new Error(`“${label}”不能为空。`)
  }
  return parsed
}

export function validateDate(value: unknown, required: boolean, label: string): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${value.getFullYear()}-${month}-${day}`
  }
  const text = validateText(value, required, label)
  if (!text) return ''
  const timestamp = Date.parse(text)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== text) {
    throw new Error(`“${label}”必须是有效的 YYYY-MM-DD 日期：${text}。`)
  }
  return text
}

export function validateStageRow(raw: unknown, index: number): StageRow {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`第 ${index + 1} 个阶段必须是对象。`)
  }
  const rec = raw as Record<string, unknown>
  const prefix = `阶段[${index + 1}]`
  const stage = validateText(rec.stage ?? rec['分析阶段'], true, `${prefix} 阶段名称（stage）`)
  const startDate = validateDate(rec.startDate ?? rec['开始日期'], true, `${stage} 开始日期（startDate）`)
  const endDate = validateDate(rec.endDate ?? rec['结束日期'], true, `${stage} 结束日期（endDate）`)
  if (Date.parse(startDate) > Date.parse(endDate)) {
    throw new Error(`阶段“${stage}”开始日期（${startDate}）不能晚于结束日期（${endDate}）。`)
  }
  const promotionScene = validateText(rec.promotionScene ?? rec['推广场景'], true, `${stage} 推广场景（promotionScene）`)
  const attributionModel = validateText(rec.attributionModel ?? rec['归因口径'], true, `${stage} 归因口径（attributionModel）`)
  const attributionDays = validateNumber(rec.attributionDays ?? rec['归因周期（天）'] ?? rec['归因周期'], true, `${stage} 归因周期（attributionDays）`) ?? 0
  const conversionScope = validateText(rec.conversionScope ?? rec['成交口径'], true, `${stage} 成交口径（conversionScope）`)

  const spend = validateNumber(rec.spend ?? rec['广告消耗'], true, `${stage} 广告消耗（spend）`) ?? 0
  const impressions = validateNumber(rec.impressions ?? rec['展现量'], false, `${stage} 展现量（impressions）`)
  const clicks = validateNumber(rec.clicks ?? rec['点击量'], false, `${stage} 点击量（clicks）`)
  const carts = validateNumber(rec.carts ?? rec['加购数'], false, `${stage} 加购数（carts）`)
  const paidUsers = validateNumber(rec.paidUsers ?? rec['成交人数'], false, `${stage} 成交人数（paidUsers）`)
  const paidOrders = validateNumber(rec.paidOrders ?? rec['成交笔数'], false, `${stage} 成交笔数（paidOrders）`)
  const revenue = validateNumber(rec.revenue ?? rec['成交金额'], true, `${stage} 成交金额（revenue）`) ?? 0
  const newCustomers = validateNumber(rec.newCustomers ?? rec['成交新客数'], false, `${stage} 成交新客数（newCustomers）`)

  if (newCustomers !== null && paidUsers !== null && newCustomers > paidUsers) {
    throw new Error(`阶段“${stage}”成交新客数（${newCustomers}）不能大于成交人数（${paidUsers}）。`)
  }

  const visits = validateNumber(rec.visits ?? rec['引导访问人数'], false, `${stage} 引导访问人数`)
  const potentialVisits = validateNumber(rec.potentialVisits ?? rec['引导访问潜客数'], false, `${stage} 引导访问潜客数`)
  const favorites = validateNumber(rec.favorites ?? rec['收藏数'], false, `${stage} 收藏数`)
  const favoriteCarts = validateNumber(rec.favoriteCarts ?? rec['收藏加购数'], false, `${stage} 收藏加购数`)
  const memberships = validateNumber(rec.memberships ?? rec['入会量'], false, `${stage} 入会量`)

  return {
    stage,
    startDate,
    endDate,
    promotionScene,
    attributionModel,
    attributionDays,
    conversionScope,
    spend,
    impressions,
    clicks,
    visits,
    potentialVisits,
    favorites,
    carts,
    favoriteCarts,
    paidUsers,
    paidOrders,
    revenue,
    newCustomers,
    memberships,
  }
}

export function validateDetailRow(raw: unknown, index: number, stageNames: Set<string>): DetailRow {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`颗粒度明细第 ${index + 1} 行必须是对象。`)
  }
  const rec = raw as Record<string, unknown>
  const prefix = `明细[${index + 1}]`
  const stage = validateText(rec.stage ?? rec['分析阶段'], true, `${prefix} 分析阶段（stage）`)
  if (!stageNames.has(stage)) {
    throw new Error(`颗粒度明细第 ${index + 1} 行的分析阶段“${stage}”未在“阶段汇总”中定义。`)
  }
  const dimText = validateText(rec.dimension ?? rec['分析维度'], true, `${prefix} 分析维度（dimension）`)
  if (!DIMENSIONS.includes(dimText as Dimension)) {
    throw new Error(`颗粒度明细第 ${index + 1} 行分析维度“${dimText}”必须是：${DIMENSIONS.join('、')}。`)
  }
  const dimension = dimText as Dimension

  const objectName = validateText(rec.objectName ?? rec['对象名称'], true, `${prefix} 对象名称（objectName）`)
  const objectCode = validateText(rec.objectCode ?? rec['对象编码'], false, `${prefix} 对象编码`)
  const campaignCode = validateText(rec.campaignCode ?? rec['所属计划编码'], false, `${prefix} 所属计划编码`)
  const campaignName = validateText(rec.campaignName ?? rec['所属计划名称'], false, `${prefix} 所属计划名称`)
  const promotionScene = validateText(rec.promotionScene ?? rec['推广场景'], true, `${prefix} 推广场景（promotionScene）`)
  const date = validateDate(rec.date ?? rec['日期'], false, `${prefix} 日期`)

  const spend = validateNumber(rec.spend ?? rec['广告消耗'], true, `${prefix} 广告消耗（spend）`) ?? 0
  const impressions = validateNumber(rec.impressions ?? rec['展现量'], false, `${prefix} 展现量（impressions）`)
  const clicks = validateNumber(rec.clicks ?? rec['点击量'], false, `${prefix} 点击量（clicks）`)
  const carts = validateNumber(rec.carts ?? rec['加购数'], false, `${prefix} 加购数（carts）`)
  const paidUsers = validateNumber(rec.paidUsers ?? rec['成交人数'], false, `${prefix} 成交人数（paidUsers）`)
  const paidOrders = validateNumber(rec.paidOrders ?? rec['成交笔数'], false, `${prefix} 成交笔数（paidOrders）`)
  const revenue = validateNumber(rec.revenue ?? rec['成交金额'], true, `${prefix} 成交金额（revenue）`) ?? 0
  const newCustomers = validateNumber(rec.newCustomers ?? rec['成交新客数'], false, `${prefix} 成交新客数（newCustomers）`)

  if (newCustomers !== null && paidUsers !== null && newCustomers > paidUsers) {
    throw new Error(`颗粒度明细第 ${index + 1} 行（${objectName}）成交新客数（${newCustomers}）不能大于成交人数（${paidUsers}）。`)
  }

  const visits = validateNumber(rec.visits ?? rec['引导访问人数'], false, `${prefix} 引导访问人数`)
  const favorites = validateNumber(rec.favorites ?? rec['收藏数'], false, `${prefix} 收藏数`)
  const favoriteCarts = validateNumber(rec.favoriteCarts ?? rec['收藏加购数'], false, `${prefix} 收藏加购数`)
  const memberships = validateNumber(rec.memberships ?? rec['入会量'], false, `${prefix} 入会量`)

  return {
    stage,
    dimension,
    objectCode,
    objectName,
    campaignCode,
    campaignName,
    promotionScene,
    date,
    spend,
    impressions,
    clicks,
    visits,
    favorites,
    carts,
    favoriteCarts,
    paidUsers,
    paidOrders,
    revenue,
    newCustomers,
    memberships,
  }
}

export function validateDatasetInput(input: unknown): {
  taskName: string
  baseStage: string
  comparisonStage: string
  dimension: Dimension
  stages: StageRow[]
  details: DetailRow[]
  warnings: string[]
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('输入必须是包含 stages 数组的 JSON 对象。')
  }

  const rec = input as Record<string, unknown>
  const rawStages = rec.stages
  if (!Array.isArray(rawStages)) {
    throw new Error('输入数据必须包含“stages”数组。')
  }
  if (rawStages.length < 2) {
    throw new Error('“stages”至少需要两个分析阶段才能进行对比分析。')
  }

  const stages = rawStages.map((row, idx) => validateStageRow(row, idx))
  const stageNames = stages.map((s) => s.stage)
  if (new Set(stageNames).size !== stageNames.length) {
    throw new Error('“stages”中的分析阶段名称不能重复。')
  }

  // Attribution alignment check
  const attributionModels = new Set(stages.map((row) => row.attributionModel))
  const attributionDays = new Set(stages.map((row) => row.attributionDays))
  const conversionScopes = new Set(stages.map((row) => row.conversionScope))
  if (attributionModels.size > 1) {
    throw new Error(`不同阶段的归因口径不一致（${Array.from(attributionModels).join(' vs ')}），不能直接对比。`)
  }
  if (attributionDays.size > 1) {
    throw new Error(`不同阶段的归因周期不一致（${Array.from(attributionDays).join('天 vs ')}天），不能直接对比。`)
  }
  if (conversionScopes.size > 1) {
    throw new Error(`不同阶段的成交口径不一致（${Array.from(conversionScopes).join(' vs ')}），不能直接对比。`)
  }

  const warnings: string[] = []
  const stageNameSet = new Set(stageNames)

  let details: DetailRow[] = []
  if (rec.details !== undefined && rec.details !== null) {
    if (!Array.isArray(rec.details)) {
      throw new Error('“details”若提供必须是数组。')
    }
    details = rec.details.map((row, idx) => validateDetailRow(row, idx, stageNameSet))
  }
  if (details.length === 0) {
    warnings.push('未提供颗粒度明细数据，本次仅生成阶段整体对比与整体指标发现。')
  }

  if (stages.length > 2 && (!rec.baseStage || !rec.comparisonStage)) {
    throw new Error('超过两个阶段时必须明确 baseStage 和 comparisonStage，不能自动取前两项。')
  }
  const baseStage = rec.baseStage ? String(rec.baseStage).trim() : stages[0].stage
  const comparisonStage = rec.comparisonStage ? String(rec.comparisonStage).trim() : stages[1].stage
  if (!stageNameSet.has(baseStage)) {
    throw new Error(`指定的基准阶段“${baseStage}”未在 stages 列表中找到。`)
  }
  if (!stageNameSet.has(comparisonStage)) {
    throw new Error(`指定的对比阶段“${comparisonStage}”未在 stages 列表中找到。`)
  }
  if (baseStage === comparisonStage) {
    throw new Error(`基准阶段与对比阶段不能相同（“${baseStage}”）。`)
  }

  let dimension: Dimension = '商品'
  if (rec.dimension !== undefined && rec.dimension !== null) {
    const d = String(rec.dimension).trim() as Dimension
    if (!DIMENSIONS.includes(d)) {
      throw new Error(`指定的分析维度“${d}”无效，必须是：${DIMENSIONS.join('、')}。`)
    }
    dimension = d
  } else if (details.length > 0) {
    const dimsInDetails = DIMENSIONS.filter((d) => details.some((row) => row.dimension === d))
    if (dimsInDetails.includes('商品')) {
      dimension = '商品'
    } else if (dimsInDetails.length > 0) {
      dimension = dimsInDetails[0]
    }
  }

  const taskName = rec.taskName ? String(rec.taskName).trim() : `万相台阶段对比（${baseStage} vs ${comparisonStage}）`

  return {
    taskName,
    baseStage,
    comparisonStage,
    dimension,
    stages,
    details,
    warnings,
  }
}

export const SAMPLE_DATASET: Dataset = {
  warnings: [],
  stages: [
    {
      stage: '关键词+人群推广期',
      startDate: '2026-08-01',
      endDate: '2026-08-15',
      promotionScene: '关键词推广+人群推广',
      attributionModel: '末次点击归因',
      attributionDays: 15,
      conversionScope: '总成交',
      spend: 94000,
      impressions: 3083000,
      clicks: 107150,
      visits: 98200,
      potentialVisits: 87500,
      favorites: 12600,
      carts: 18380,
      favoriteCarts: 30980,
      paidUsers: 1565,
      paidOrders: 1740,
      revenue: 402150,
      newCustomers: 1272,
      memberships: 630,
    },
    {
      stage: '全站推广期',
      startDate: '2026-08-16',
      endDate: '2026-08-30',
      promotionScene: '全站推广',
      attributionModel: '末次点击归因',
      attributionDays: 15,
      conversionScope: '总成交',
      spend: 118000,
      impressions: 5055000,
      clicks: 176560,
      visits: 164300,
      potentialVisits: 151200,
      favorites: 21100,
      carts: 32750,
      favoriteCarts: 53850,
      paidUsers: 3310,
      paidOrders: 3595,
      revenue: 756800,
      newCustomers: 2874,
      memberships: 1310,
    },
  ],
  details: [
    {
      stage: '关键词+人群推广期',
      dimension: '商品',
      objectCode: 'ITEM-01',
      objectName: '轻量羽绒服',
      campaignCode: '',
      campaignName: '',
      promotionScene: '关键词推广+人群推广',
      date: '2026-08-15',
      spend: 38000,
      impressions: 1210000,
      clicks: 43560,
      visits: 40100,
      favorites: 5200,
      carts: 7480,
      favoriteCarts: 12680,
      paidUsers: 645,
      paidOrders: 710,
      revenue: 180600,
      newCustomers: 532,
      memberships: 245,
    },
    {
      stage: '关键词+人群推广期',
      dimension: '商品',
      objectCode: 'ITEM-02',
      objectName: '针织开衫',
      campaignCode: '',
      campaignName: '',
      promotionScene: '关键词推广+人群推广',
      date: '2026-08-15',
      spend: 27500,
      impressions: 978000,
      clicks: 33250,
      visits: 30100,
      favorites: 4080,
      carts: 6120,
      favoriteCarts: 10200,
      paidUsers: 472,
      paidOrders: 530,
      revenue: 108560,
      newCustomers: 382,
      memberships: 176,
    },
    {
      stage: '关键词+人群推广期',
      dimension: '商品',
      objectCode: 'ITEM-03',
      objectName: '通勤风衣',
      campaignCode: '',
      campaignName: '',
      promotionScene: '关键词推广+人群推广',
      date: '2026-08-15',
      spend: 28500,
      impressions: 895000,
      clicks: 30340,
      visits: 28000,
      favorites: 3320,
      carts: 4780,
      favoriteCarts: 8100,
      paidUsers: 448,
      paidOrders: 500,
      revenue: 113000,
      newCustomers: 358,
      memberships: 209,
    },
    {
      stage: '全站推广期',
      dimension: '商品',
      objectCode: 'ITEM-01',
      objectName: '轻量羽绒服',
      campaignCode: '',
      campaignName: '',
      promotionScene: '全站推广',
      date: '2026-08-30',
      spend: 44000,
      impressions: 1910000,
      clicks: 68850,
      visits: 64100,
      favorites: 8350,
      carts: 12600,
      favoriteCarts: 20950,
      paidUsers: 1320,
      paidOrders: 1435,
      revenue: 343200,
      newCustomers: 1155,
      memberships: 510,
    },
    {
      stage: '全站推广期',
      dimension: '商品',
      objectCode: 'ITEM-02',
      objectName: '针织开衫',
      campaignCode: '',
      campaignName: '',
      promotionScene: '全站推广',
      date: '2026-08-30',
      spend: 39000,
      impressions: 1685000,
      clicks: 57620,
      visits: 53200,
      favorites: 7010,
      carts: 10750,
      favoriteCarts: 17760,
      paidUsers: 1060,
      paidOrders: 1160,
      revenue: 226840,
      newCustomers: 928,
      memberships: 438,
    },
    {
      stage: '全站推广期',
      dimension: '商品',
      objectCode: 'ITEM-03',
      objectName: '通勤风衣',
      campaignCode: '',
      campaignName: '',
      promotionScene: '全站推广',
      date: '2026-08-30',
      spend: 35000,
      impressions: 1460000,
      clicks: 50090,
      visits: 47000,
      favorites: 5740,
      carts: 9400,
      favoriteCarts: 15140,
      paidUsers: 930,
      paidOrders: 1000,
      revenue: 186760,
      newCustomers: 791,
      memberships: 362,
    },
    {
      stage: '关键词+人群推广期',
      dimension: '计划',
      objectCode: 'PLAN-01',
      objectName: '核心词计划',
      campaignCode: 'PLAN-01',
      campaignName: '核心词计划',
      promotionScene: '关键词推广',
      date: '2026-08-15',
      spend: 47000,
      impressions: 1420000,
      clicks: 52540,
      visits: 48100,
      favorites: 6200,
      carts: 9200,
      favoriteCarts: 15400,
      paidUsers: 780,
      paidOrders: 865,
      revenue: 216000,
      newCustomers: 625,
      memberships: 320,
    },
    {
      stage: '关键词+人群推广期',
      dimension: '计划',
      objectCode: 'PLAN-02',
      objectName: '高意向人群计划',
      campaignCode: 'PLAN-02',
      campaignName: '高意向人群计划',
      promotionScene: '人群推广',
      date: '2026-08-15',
      spend: 47000,
      impressions: 1663000,
      clicks: 54610,
      visits: 50100,
      favorites: 6400,
      carts: 9180,
      favoriteCarts: 15580,
      paidUsers: 785,
      paidOrders: 875,
      revenue: 186150,
      newCustomers: 647,
      memberships: 310,
    },
    {
      stage: '全站推广期',
      dimension: '计划',
      objectCode: 'PLAN-03',
      objectName: '全站成交计划',
      campaignCode: 'PLAN-03',
      campaignName: '全站成交计划',
      promotionScene: '全站推广',
      date: '2026-08-30',
      spend: 70000,
      impressions: 3020000,
      clicks: 106300,
      visits: 99100,
      favorites: 12600,
      carts: 19500,
      favoriteCarts: 32100,
      paidUsers: 2050,
      paidOrders: 2220,
      revenue: 465000,
      newCustomers: 1760,
      memberships: 780,
    },
    {
      stage: '全站推广期',
      dimension: '计划',
      objectCode: 'PLAN-04',
      objectName: '全站拉新计划',
      campaignCode: 'PLAN-04',
      campaignName: '全站拉新计划',
      promotionScene: '全站推广',
      date: '2026-08-30',
      spend: 48000,
      impressions: 2035000,
      clicks: 70260,
      visits: 65200,
      favorites: 8500,
      carts: 13250,
      favoriteCarts: 21750,
      paidUsers: 1260,
      paidOrders: 1375,
      revenue: 291800,
      newCustomers: 1114,
      memberships: 530,
    },
  ],
}
