export interface Model {
  price: number
  purchaseCost: number
  shippingCost: number
  platformRate: number
  returnRate: number
  cvr: number
  ctr: number
  paidShare: number
  targetMargin: number
  budget: number
}

export type NumericField = keyof Model

export interface SavedPlan {
  id: string
  name: string
  savedAt: string
  model: Model
}

export interface AdRoiSettings {
  price?: number
  purchaseCost?: number
  shippingCost?: number
  platformRate?: number
  returnRate?: number
  cvr?: number
  ctr?: number
  paidShare?: number
  targetMargin?: number
  budget?: number
}

export interface ScenarioRow {
  roi: number
  unitProfit: number
  budgetProfit: number
}

export interface Result {
  settledRevenue: number
  transactionCost: number
  contribution: number
  targetProfit: number
  pureBreakEvenRoi: number | null
  targetRoi: number | null
  mixedBreakEvenRoi: number | null
  maxCpc: number | null
  maxCpm: number | null
}

export interface CalculationResult {
  settledRevenue: number | null
  transactionCost: number | null
  contribution: number | null
  targetProfit: number | null
  pureBreakEvenRoi: number | null
  targetRoi: number | null
  mixedBreakEvenRoi: number | null
  maxCpc: number | null
  maxCpm: number | null
}

export const defaultModel: Model = {
  price: 199,
  purchaseCost: 68,
  shippingCost: 12,
  platformRate: 6,
  returnRate: 25,
  cvr: 3.2,
  ctr: 2.5,
  paidShare: 65,
  targetMargin: 10,
  budget: 10_000,
}

export const presets: Array<{ name: string; description: string; model: Model }> = [
  { name: '千川短视频', description: '高退货率商品', model: { ...defaultModel, price: 159, purchaseCost: 48, shippingCost: 11, platformRate: 5, returnRate: 45, cvr: 2.2, ctr: 1.8, paidShare: 75, targetMargin: 8 } },
  { name: '千川直播', description: '高退货率场景', model: { ...defaultModel, price: 299, purchaseCost: 105, shippingCost: 14, platformRate: 5, returnRate: 55, cvr: 5.5, ctr: 4.2, paidShare: 70, targetMargin: 8 } },
  { name: '直通车搜索', description: '标品搜索投放', model: { ...defaultModel, price: 239, purchaseCost: 86, shippingCost: 10, platformRate: 8, returnRate: 12, cvr: 4.8, ctr: 3.6, paidShare: 45, targetMargin: 12 } },
  { name: '拼多多全站', description: '跑量成交场景', model: { ...defaultModel, price: 99, purchaseCost: 31, shippingCost: 7, platformRate: 4, returnRate: 18, cvr: 6.5, ctr: 4.8, paidShare: 80, targetMargin: 8 } },
]

export const FORMULA_DISCLOSURES = [
  '所有金额均按单件发货订单、含税金额试算；比例输入为小数（如 25% 记为 0.25）。',
  '保本 ROI 分子为商品售价（未扣退款），分母为退款后结算收入扣除交易成本后的单件贡献。必须核对用户广告报表的归因及成交额定义，不能直接宣称适配所有广告后台口径。',
  '投流前单件贡献按退款后结算收入（售价 × (1 - 退货率)）扣除平台扣点与税费、采购成本与发货运费计算。',
  '平台扣点与税费采用合并综合费率估算，按退款后结算收入计提，未精算增值税进项抵扣、专票差额或附加税细项。',
  '模型未包含退货逆向物流、质检残损、达人佣金、固定人力租金及资金成本；若业务存在这些额外支出，需要另行校准，不能把当前结果当成最终净利润保本线。',
  '混合流量保本 ROI（纯付费保本 ROI × 付费流量占比）假定自然流量与付费流量成本结构完全一致且自然流比例固定；实际放量时自然流量可能被稀释或蚕食，不能静默承诺为绝对安全的降保本线出价。',
  'Max CPC 与 Max CPM 基于给定 CVR/CTR 计算平均成本边界，不决定每一笔订单是否盈利；流量效率可能变化，低于边界也不保证实际投放盈利。',
  '预算表的 ROI 是明确列出的假设情景，不是实际投放数据；仅假设预算按该 ROI 全额消耗，不模拟消耗速度、边际变化或库存约束。',
]

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function formatMoney(value: number | null): string {
  return value === null || !isFiniteNumber(value) ? '—' : money.format(value)
}

export function formatPercent(value: number | null): string {
  return value === null || !isFiniteNumber(value) ? '—' : `${value.toFixed(1)}%`
}

export function formatRoi(value: number | null): string {
  return value === null || !isFiniteNumber(value) ? '—' : `${value.toFixed(2)}x`
}

export function modelToSettings(model: Model): AdRoiSettings {
  return {
    price: isFiniteNumber(model.price) ? model.price : undefined,
    purchaseCost: isFiniteNumber(model.purchaseCost) ? model.purchaseCost : undefined,
    shippingCost: isFiniteNumber(model.shippingCost) ? model.shippingCost : undefined,
    platformRate: isFiniteNumber(model.platformRate) ? model.platformRate / 100 : undefined,
    returnRate: isFiniteNumber(model.returnRate) ? model.returnRate / 100 : undefined,
    cvr: isFiniteNumber(model.cvr) ? model.cvr / 100 : undefined,
    ctr: isFiniteNumber(model.ctr) ? model.ctr / 100 : undefined,
    paidShare: isFiniteNumber(model.paidShare) ? model.paidShare / 100 : undefined,
    targetMargin: isFiniteNumber(model.targetMargin) ? model.targetMargin / 100 : undefined,
    budget: isFiniteNumber(model.budget) ? model.budget : undefined,
  }
}

export function validation(model: Model): string | null {
  if (!Object.values(model).every(isFiniteNumber)) return '请补全所有数值输入。'
  if (model.price <= 0) return '商品售价必须大于 0。'
  if ([model.purchaseCost, model.shippingCost, model.budget].some((value) => value < 0)) return '成本和预算不能为负数。'
  if ([model.platformRate, model.returnRate, model.cvr, model.ctr, model.paidShare, model.targetMargin].some((value) => value < 0 || value > 100)) return '比例请输入 0–100 之间的数值。'
  if (model.cvr === 0) return '转化率必须大于 0，才能计算 CPC 上限。'
  if (model.ctr === 0) return '点击率必须大于 0，才能计算 CPM 上限。'
  return null
}

export function calculate(settings: AdRoiSettings): CalculationResult {
  const hasPrice = isFiniteNumber(settings.price)
  const hasReturn = isFiniteNumber(settings.returnRate)
  const hasPlatform = isFiniteNumber(settings.platformRate)
  const hasPurchase = isFiniteNumber(settings.purchaseCost)
  const hasShipping = isFiniteNumber(settings.shippingCost)
  const hasTargetMargin = isFiniteNumber(settings.targetMargin)
  const hasCvr = isFiniteNumber(settings.cvr)
  const hasCtr = isFiniteNumber(settings.ctr)
  const hasPaidShare = isFiniteNumber(settings.paidShare)

  const settledRevenue = (hasPrice && hasReturn)
    ? settings.price! * (1 - settings.returnRate!)
    : null

  const transactionCost = (settledRevenue !== null && hasPlatform)
    ? settledRevenue * settings.platformRate!
    : null

  const contribution = (settledRevenue !== null && transactionCost !== null && hasPurchase && hasShipping)
    ? settledRevenue - transactionCost - settings.purchaseCost! - settings.shippingCost!
    : null

  const targetProfit = (settledRevenue !== null && hasTargetMargin)
    ? settledRevenue * settings.targetMargin!
    : null

  const pureBreakEvenRoi = (hasPrice && contribution !== null && contribution > 0)
    ? settings.price! / contribution
    : null

  const targetRoi = (hasPrice && contribution !== null && targetProfit !== null && (contribution - targetProfit) > 0)
    ? settings.price! / (contribution - targetProfit)
    : null

  const mixedBreakEvenRoi = (pureBreakEvenRoi !== null && hasPaidShare && settings.paidShare! > 0)
    ? pureBreakEvenRoi * settings.paidShare!
    : null

  const maxCpc = (contribution !== null && contribution > 0 && hasCvr && settings.cvr! > 0)
    ? contribution * settings.cvr!
    : null

  const maxCpm = (maxCpc !== null && hasCtr && settings.ctr! > 0)
    ? maxCpc * settings.ctr! * 1000
    : null

  return {
    settledRevenue,
    transactionCost,
    contribution,
    targetProfit,
    pureBreakEvenRoi,
    targetRoi,
    mixedBreakEvenRoi,
    maxCpc,
    maxCpm,
  }
}

export function calculateModel(model: Model): Result {
  const res = calculate(modelToSettings(model))
  return {
    settledRevenue: res.settledRevenue!,
    transactionCost: res.transactionCost!,
    contribution: res.contribution!,
    targetProfit: res.targetProfit ?? 0,
    pureBreakEvenRoi: res.pureBreakEvenRoi,
    targetRoi: res.targetRoi,
    mixedBreakEvenRoi: res.mixedBreakEvenRoi,
    maxCpc: res.maxCpc,
    maxCpm: res.maxCpm,
  }
}

export function calculateBudgetScenarios(
  price: number,
  contribution: number,
  pureBreakEvenRoi: number,
  targetRoi: number | null,
  budget: number,
): ScenarioRow[] {
  if (pureBreakEvenRoi <= 0 || budget < 0) return []
  const effectiveTargetRoi = targetRoi ?? pureBreakEvenRoi + 0.5
  const candidates = [
    Math.max(0.1, pureBreakEvenRoi - 0.5),
    pureBreakEvenRoi,
    effectiveTargetRoi,
    effectiveTargetRoi + 0.5,
  ]
  const uniqueRois = candidates.filter(
    (value, index, values) => values.findIndex((c) => Math.abs(c - value) < 0.01) === index
  )
  return uniqueRois.map((roi) => ({
    roi,
    unitProfit: contribution - price / roi,
    budgetProfit: budget * (roi / pureBreakEvenRoi - 1),
  }))
}

export function resultText(result: Result | null): string {
  if (!result) return ''
  return [
    '付费投放保本 ROI 测算',
    `纯付费保本 ROI：${formatRoi(result.pureBreakEvenRoi)}`,
    `目标利润 ROI：${formatRoi(result.targetRoi)}`,
    `混合流量保本 ROI：${formatRoi(result.mixedBreakEvenRoi)}`,
    `Max CPC：${formatMoney(result.maxCpc)}`,
    `Max CPM：${formatMoney(result.maxCpm)}`,
    `结算后成交额：${formatMoney(result.settledRevenue)}`,
    `投流前单件贡献：${formatMoney(result.contribution)}`,
  ].join('\n')
}
