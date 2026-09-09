import type { CalculationResult, CostCategory, ModelSettings, LineItem, TaxpayerType } from './types'

const RETURN_HANDLING_FACTOR = 0.18
const round = (value: number) => Number.isFinite(value) ? Math.round(value * 100) / 100 : value
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0))
const vatRateFor = (type: TaxpayerType) => ({ general13: .13, small1: .01, small3: .03, exempt: 0 }[type])
const includedVat = (amount: number, rate: number) => rate > 0 ? Math.max(0, amount) * rate / (1 + rate) : 0

export function productCostOf(settings: ModelSettings) {
  const { productCost } = settings
  if (productCost.mode === 'summary') return Math.max(0, productCost.summary)
  const { bom, packaging, accessories, gifts, inboundFreight } = productCost.detailed
  return Math.max(0, bom) + Math.max(0, packaging) + Math.max(0, accessories) + Math.max(0, gifts) + Math.max(0, inboundFreight)
}

export function fulfillmentCostOf(settings: ModelSettings) {
  const { fulfillmentCost } = settings
  if (fulfillmentCost.mode === 'summary') return Math.max(0, fulfillmentCost.summary)
  const { delivery, packing, shippingInsurance } = fulfillmentCost.detailed
  return Math.max(0, delivery) + Math.max(0, packing) + Math.max(0, shippingInsurance)
}

function platformTerms(settings: ModelSettings) {
  const { platformFee } = settings
  if (platformFee.mode === 'summary') return { rate: Math.max(0, platformFee.summary), fixed: 0 }
  const { commissionRate, paymentRate, software } = platformFee.detailed
  return { rate: Math.max(0, commissionRate) + Math.max(0, paymentRate), fixed: Math.max(0, software) }
}

export function getAdSpendRate(settings: ModelSettings, roasOverride?: number) {
  const { marketing } = settings
  if (roasOverride !== undefined) return roasOverride > 0 ? Math.max(0, marketing.paidTrafficShare) / roasOverride : 0
  return marketing.mode === 'rate'
    ? Math.max(0, marketing.gmvRate)
    : marketing.roas > 0 ? Math.max(0, marketing.paidTrafficShare) / marketing.roas : 0
}

function addLine(lines: LineItem[], code: string, name: string, amount: number, category: CostCategory, detail?: string) {
  if (amount > .000001) lines.push({ code, name, amount: round(amount), category, detail })
}

function taxBreakdown(settings: ModelSettings, netSales: number, product: number, fulfillment: number, adCost: number) {
  const { tax } = settings
  if (tax.mode === 'quick') {
    const taxCost = netSales * clamp(tax.quickRate, 0, 1)
    return { outputVat: 0, productInputVat: 0, logisticsInputVat: 0, adInputVat: 0, inputVat: 0, payableVat: 0, surtax: 0, taxCost }
  }

  const outputVat = includedVat(netSales, vatRateFor(tax.taxpayerType))
  const canCredit = tax.taxpayerType === 'general13'
  const productInputVat = canCredit && tax.productInvoice ? includedVat(product, .13) : 0
  const logisticsInputVat = canCredit && tax.logisticsInvoice ? includedVat(fulfillment, tax.logisticsInvoiceRate) : 0
  const adInputVat = canCredit && tax.adInvoice ? includedVat(adCost, .06) : 0
  const inputVat = productInputVat + logisticsInputVat + adInputVat
  const payableVat = Math.max(0, outputVat - inputVat)
  const surtax = payableVat * clamp(tax.surtaxRate, 0, 1)
  return { outputVat, productInputVat, logisticsInputVat, adInputVat, inputVat, payableVat, surtax, taxCost: payableVat + surtax }
}

interface CalculateOverrides { returnRate?: number; roas?: number; adSpendRate?: number }

function calculateCore(settings: ModelSettings, overrides: CalculateOverrides = {}): CalculationResult {
  const asp = Math.max(0, settings.asp)
  const returnRate = clamp(overrides.returnRate ?? settings.adjustments.returnRate, 0, 1)
  const discount = clamp(settings.adjustments.discount, 0, asp)
  const settledSales = asp - discount
  const netSales = settledSales * (1 - returnRate)
  const product = productCostOf(settings)
  const fulfillment = fulfillmentCostOf(settings)
  const platform = platformTerms(settings)
  const adSpendRate = overrides.adSpendRate ?? getAdSpendRate(settings, overrides.roas)
  const adCost = asp * Math.max(0, adSpendRate)
  const livestreamCommission = netSales * clamp(settings.marketing.livestreamCommissionRate, 0, 1)
  const marketingCost = adCost + livestreamCommission
  const platformCost = netSales * platform.rate + platform.fixed
  const returnProvision = returnRate * (product + fulfillment) * RETURN_HANDLING_FACTOR
  const tax = taxBreakdown(settings, netSales, product, fulfillment, adCost)
  const grossProfit = netSales - product
  const cm1 = grossProfit - fulfillment - returnProvision - platformCost - tax.taxCost
  const cm2 = cm1 - marketingCost
  const netProfit = cm2
  const margin = (value: number) => asp > 0 ? value / asp : 0
  const lines: LineItem[] = []

  addLine(lines, '1001', '优惠让利', discount, 'tax', '券、满减、店铺折扣')
  if (settings.productCost.mode === 'summary') addLine(lines, '2000', '商品采购成本 / 出厂价', product, 'product')
  else {
    const details = settings.productCost.detailed
    addLine(lines, '2001', '商品采购成本 / 出厂价', details.bom, 'product')
    addLine(lines, '2002', '包装', details.packaging, 'product')
    addLine(lines, '2003', '辅料', details.accessories, 'product')
    addLine(lines, '2004', '赠品', details.gifts, 'product')
    addLine(lines, '2005', '头程物流', details.inboundFreight, 'product')
  }
  if (settings.fulfillmentCost.mode === 'summary') addLine(lines, '3000', '物流履约费用', fulfillment, 'fulfillment')
  else {
    const details = settings.fulfillmentCost.detailed
    addLine(lines, '3001', '正向物流运费', details.delivery, 'fulfillment')
    addLine(lines, '3002', '打包出库', details.packing, 'fulfillment')
    addLine(lines, '3003', '运费险', details.shippingInsurance, 'fulfillment')
  }
  addLine(lines, '3009', '退货逆向损耗准备', returnProvision, 'fulfillment', '按退货率自动计提')
  addLine(lines, '4001', settings.platformFee.mode === 'summary' ? '平台综合扣点' : '平台与支付交易费', platformCost, 'platform')
  addLine(lines, '5001', '广告投流（千川/直通车）', adCost, 'marketing', `广告费率 ${(adSpendRate * 100).toFixed(1)}%`)
  addLine(lines, '5002', '直播 / 达人带货纯佣', livestreamCommission, 'marketing', `纯佣 ${(settings.marketing.livestreamCommissionRate * 100).toFixed(1)}%，按有效成交额`) 
  addLine(lines, '6001', settings.tax.mode === 'quick' ? '快捷综合税费' : '实纳税费（增值税及附加）', tax.taxCost, 'tax')

  return {
    asp: round(asp), gmv: round(asp), discount: round(discount), settledSales: round(settledSales), netSales: round(netSales), returnRate,
    productCost: round(product), fulfillmentCost: round(fulfillment + returnProvision), platformCost: round(platformCost), adCost: round(adCost), livestreamCommission: round(livestreamCommission), marketingCost: round(marketingCost),
    taxCost: round(tax.taxCost), outputVat: round(tax.outputVat), productInputVat: round(tax.productInputVat), logisticsInputVat: round(tax.logisticsInputVat), adInputVat: round(tax.adInputVat), inputVat: round(tax.inputVat), payableVat: round(tax.payableVat), surtax: round(tax.surtax), operationsCost: round(tax.taxCost), returnProvision: round(returnProvision),
    grossProfit: round(grossProfit), cm1: round(cm1), cm2: round(cm2), netProfit: round(netProfit), grossMargin: margin(grossProfit), cm1Margin: margin(cm1), cm2Margin: margin(cm2), netMargin: margin(netProfit),
    breakEvenRoas: Infinity, breakEvenPrice: Infinity, breakEvenCogs: Infinity,
    adSpendRate, actualAdCostRate: netSales > 0 ? adCost / netSales : Infinity, lineItems: lines,
  }
}

function priceForMargin(settings: ModelSettings, targetMargin: number) {
  const marginAt = (price: number) => calculateCore({ ...settings, asp: price }).netProfit - price * targetMargin
  if (marginAt(0) >= 0) return 0
  let high = Math.max(1, settings.asp)
  while (high < 1_000_000 && marginAt(high) < 0) high *= 2
  if (marginAt(high) < 0) return Infinity
  let low = 0
  for (let step = 0; step < 56; step += 1) {
    const middle = (low + high) / 2
    if (marginAt(middle) >= 0) high = middle
    else low = middle
  }
  return high
}

function maxProductCostForMargin(settings: ModelSettings, targetMargin: number) {
  const price = Math.max(0, settings.asp)
  const profitAt = (cost: number) => calculateCore({ ...settings, productCost: { ...settings.productCost, mode: 'summary', summary: cost } }).netProfit - price * targetMargin
  if (profitAt(0) < 0) return 0
  let low = 0
  let high = Math.max(1, productCostOf(settings))
  while (high < 1_000_000 && profitAt(high) >= 0) high *= 2
  if (profitAt(high) >= 0) return Infinity
  for (let step = 0; step < 56; step += 1) {
    const middle = (low + high) / 2
    if (profitAt(middle) >= 0) low = middle
    else high = middle
  }
  return low
}

function breakEvenRoasFor(settings: ModelSettings) {
  const paidShare = settings.marketing.mode === 'shareRoas' ? settings.marketing.paidTrafficShare : 1
  if (paidShare <= 0) return Infinity
  const profitAtRate = (rate: number) => calculateCore(settings, { adSpendRate: rate }).netProfit
  if (profitAtRate(0) < 0) return Infinity
  let high = Math.max(1, getAdSpendRate(settings))
  while (high < 100 && profitAtRate(high) >= 0) high *= 2
  if (profitAtRate(high) >= 0) return 0
  let low = 0
  for (let step = 0; step < 56; step += 1) {
    const middle = (low + high) / 2
    if (profitAtRate(middle) >= 0) low = middle
    else high = middle
  }
  return low > 0 ? paidShare / low : Infinity
}

/** 每笔发货订单经营损益：成交额、费用均按含税金额输入；一般纳税人自动按含税价还原销项和进项税额。 */
export function calculate(settings: ModelSettings, overrides: CalculateOverrides = {}): CalculationResult {
  const result = calculateCore(settings, overrides)
  const targetMargin = clamp(settings.targetNetMargin, -.5, .95)
  return {
    ...result,
    breakEvenRoas: breakEvenRoasFor(settings),
    breakEvenPrice: round(priceForMargin(settings, 0)),
    breakEvenCogs: round(maxProductCostForMargin(settings, 0)),
    lineItems: result.lineItems,
  }
}

export function reverseTargets(settings: ModelSettings) {
  const targetMargin = clamp(settings.targetNetMargin, -.5, .95)
  return {
    minimumPrice: round(priceForMargin(settings, targetMargin)),
    maxCogs: round(maxProductCostForMargin(settings, targetMargin)),
    targetMargin,
  }
}

export function sensitivityMatrix(settings: ModelSettings) {
  const roas = [1.5, 2, 2.5, 3, 3.5]
  const returns = [.15, .3, .45]
  return { roas, returns, values: returns.map((returnRate) => roas.map((roasValue) => calculateCore(settings, { returnRate, roas: roasValue }).netMargin)) }
}
