export type ScenarioId = 'selfPaid' | 'influencerCommission' | 'influencerSlot' | 'taoke'
export type TaxMode = 'inclusive' | 'exclusive'

export interface CalculatorInput {
  scenario: ScenarioId
  productName: string
  listPrice: number
  coupon: number
  units: number
  bomCost: number
  packagingCost: number
  shippingCost: number
  returnRate: number
  platformFeeRate: number
  taxMode: TaxMode
  taxRate: number
  paidTrafficShare: number
  roi: number
  commissionRate: number
  leaderFeeRate: number
  slotFee: number
  expectedUnits: number
  sampleCost: number
}

export interface SavedScenario {
  id: string
  name: string
  input: CalculatorInput
  createdAt: string
}

export interface CostLine {
  key: string
  label: string
  value: number
  color: string
}

export interface Calculation {
  expectedRefund: number
  bomCost: number
  fulfilmentCost: number
  platformFee: number
  commission: number
  leaderFee: number
  slotAllocation: number
  sampleAllocation: number
  commercialPromotion: number
  adSpend: number
  tax: number
  paidPrice: number
  netSettlement: number
  gmv: number
  totalNetSettlement: number
  unitProfit: number
  totalProfit: number
  margin: number
  totalAdSpend: number
  totalCost: number
  costLines: CostLine[]
  grossProfit: number
  contributionMargin1: number
  operatingProfit: number
  breakEvenRoi: number | null
  breakEvenUnits: number | null
  maxCommissionRate: number | null
  maxSlotFee: number
  safetyMargin: number
}

const EPSILON = 0.000001
const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback
const nonNegative = (value: number): number => Math.max(0, finite(value))
const rate = (value: number): number => Math.min(1, nonNegative(value))
const ratio = (value: number): number => Math.max(0, finite(value))

export const SCENARIOS: Array<{ id: ScenarioId; short: string; name: string; description: string }> = [
  { id: 'selfPaid', short: '自播', name: '自播付费投流', description: '控制 ROI 与付费流量占比' },
  { id: 'influencerCommission', short: '达播', name: '达播纯佣', description: '按成交额结算达人佣金' },
  { id: 'influencerSlot', short: '坑佣', name: '达播坑位费 + 佣金', description: '固定坑位费与带货佣金' },
  { id: 'taoke', short: '淘客', name: '淘客 / 团长招商', description: '专享券、淘客佣金与团长费' },
]

export const SCENARIO_PRESETS: Record<ScenarioId, Partial<CalculatorInput>> = {
  selfPaid: { coupon: 0, paidTrafficShare: 0.55, roi: 3.2, commissionRate: 0, leaderFeeRate: 0, slotFee: 0, sampleCost: 0 },
  influencerCommission: { coupon: 0, paidTrafficShare: 0, roi: 0, commissionRate: 0.22, leaderFeeRate: 0, slotFee: 0, sampleCost: 800 },
  influencerSlot: { coupon: 0, paidTrafficShare: 0, roi: 0, commissionRate: 0.16, leaderFeeRate: 0, slotFee: 12000, sampleCost: 1200 },
  taoke: { coupon: 30, paidTrafficShare: 0, roi: 0, commissionRate: 0.18, leaderFeeRate: 0.05, slotFee: 0, sampleCost: 500 },
}

export const DEFAULT_INPUT: CalculatorInput = {
  scenario: 'selfPaid',
  productName: '春季主推单品',
  listPrice: 199,
  coupon: 0,
  units: 1000,
  bomCost: 48,
  packagingCost: 3.5,
  shippingCost: 7,
  returnRate: 0.16,
  platformFeeRate: 0.06,
  taxMode: 'inclusive',
  taxRate: 0.13,
  paidTrafficShare: 0.55,
  roi: 3.2,
  commissionRate: 0,
  leaderFeeRate: 0,
  slotFee: 0,
  expectedUnits: 1000,
  sampleCost: 0,
}

export function calculate(input: CalculatorInput): Calculation {
  const price = nonNegative(input.listPrice)
  const coupon = Math.min(price, nonNegative(input.coupon))
  const paidPrice = price - coupon
  const units = nonNegative(input.units)
  const projectedUnits = Math.max(1, nonNegative(input.expectedUnits))
  const returnRate = rate(input.returnRate)
  const platformFeeRate = rate(input.platformFeeRate)
  const commissionRate = rate(input.commissionRate)
  const leaderFeeRate = rate(input.leaderFeeRate)
  const paidTrafficShare = rate(input.paidTrafficShare)
  const roi = ratio(input.roi)
  const taxRate = rate(input.taxRate)
  const netSettlement = paidPrice * (1 - returnRate)
  const expectedRefund = paidPrice * returnRate
  const platformFee = paidPrice * platformFeeRate
  const commission = paidPrice * commissionRate
  const leaderFee = paidPrice * leaderFeeRate
  const slotAllocation = nonNegative(input.slotFee) / projectedUnits
  const adSpend = roi > EPSILON ? paidPrice * paidTrafficShare / roi : paidTrafficShare > EPSILON ? paidPrice * paidTrafficShare : 0
  const sampleAllocation = nonNegative(input.sampleCost) / projectedUnits
  const tax = input.taxMode === 'inclusive'
    ? paidPrice * taxRate / (1 + taxRate)
    : paidPrice * taxRate
  const bomCost = nonNegative(input.bomCost) + nonNegative(input.packagingCost)
  const fulfilmentCost = nonNegative(input.shippingCost)
  const commercialPromotion = commission + leaderFee + slotAllocation + sampleAllocation
  const costLines: CostLine[] = [
    { key: 'returns', label: '退款回吐准备', value: expectedRefund, color: '#d977a7' },
    { key: 'bom', label: '商品 BOM 成本', value: bomCost, color: '#5f6fff' },
    { key: 'fulfilment', label: '基础发货履约', value: fulfilmentCost, color: '#7386ff' },
    { key: 'platform', label: '平台技术服务费', value: platformFee, color: '#bd65d8' },
    { key: 'promotion', label: '商务推广', value: commercialPromotion, color: '#f59b5f' },
    { key: 'ads', label: '付费投流分摊', value: adSpend, color: '#45bfb2' },
    { key: 'tax', label: '税金及附加', value: tax, color: '#9ca3af' },
  ]
  const totalCost = costLines.reduce((sum, line) => sum + line.value, 0)
  const grossProfit = paidPrice - bomCost
  const contributionMargin1 = grossProfit - fulfilmentCost - platformFee
  const operatingProfit = contributionMargin1 - expectedRefund - commercialPromotion - adSpend - tax
  const unitProfit = operatingProfit
  const contributionBeforeFixed = unitProfit + slotAllocation + sampleAllocation
  const fixedCosts = nonNegative(input.slotFee) + nonNegative(input.sampleCost)
  const gmv = paidPrice * units
  const totalNetSettlement = netSettlement * units
  const totalProfit = contributionBeforeFixed * units - fixedCosts
  const margin = paidPrice > EPSILON ? unitProfit / paidPrice : 0
  const unitProfitBeforeAd = unitProfit + adSpend
  const unitProfitBeforeCommission = unitProfit + commission
  const unitProfitBeforeSlot = unitProfit + slotAllocation
  const breakEvenRoi = paidTrafficShare > EPSILON && unitProfitBeforeAd > EPSILON
    ? paidPrice * paidTrafficShare / unitProfitBeforeAd
    : null
  const breakEvenUnits = contributionBeforeFixed > EPSILON ? fixedCosts / contributionBeforeFixed : null
  const maxCommissionRate = paidPrice > EPSILON
    ? Math.max(0, Math.min(1, unitProfitBeforeCommission / paidPrice))
    : null
  const maxSlotFee = Math.max(0, unitProfitBeforeSlot * projectedUnits)
  const safetyMargin = unitProfitBeforeAd > EPSILON && paidTrafficShare > EPSILON && roi > EPSILON
    ? (roi - (breakEvenRoi ?? roi)) / roi
    : unitProfit > 0 ? 1 : 0

  return {
    expectedRefund, bomCost, fulfilmentCost, platformFee, commission, leaderFee,
    slotAllocation, sampleAllocation, commercialPromotion, adSpend, tax,
    paidPrice, netSettlement, gmv, totalNetSettlement, unitProfit, totalProfit, margin,
    totalAdSpend: adSpend * units, totalCost, costLines, grossProfit, contributionMargin1, operatingProfit,
    breakEvenRoi, breakEvenUnits, maxCommissionRate, maxSlotFee, safetyMargin: finite(safetyMargin),
  }
}

export function sensitivity(input: CalculatorInput) {
  const returnDeltas = [-0.1, -0.05, 0, 0.05, 0.1]
  const driverDeltas = [-0.1, -0.05, 0, 0.05, 0.1]
  const useRoi = input.paidTrafficShare > EPSILON && input.roi > EPSILON
  return {
    useRoi,
    rows: returnDeltas.map((returnDelta) => ({
      returnDelta,
      cells: driverDeltas.map((driverDelta) => {
        const altered: CalculatorInput = {
          ...input,
          returnRate: Math.max(0, input.returnRate + returnDelta),
          ...(useRoi
            ? { roi: Math.max(EPSILON, input.roi * (1 + driverDelta)) }
            : { commissionRate: Math.max(0, input.commissionRate + driverDelta) }),
        }
        const result = calculate(altered)
        return { driverDelta, unitProfit: result.unitProfit, totalProfit: result.totalProfit }
      }),
    })),
  }
}

export function formatCurrency(value: number, digits = 2): string {
  const safe = finite(value)
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: 'CNY', minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(safe)
}

export function formatPercent(value: number, digits = 1): string {
  return `${(finite(value) * 100).toFixed(digits)}%`
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(finite(value))
}
