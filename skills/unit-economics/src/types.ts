export type CostMode = 'summary' | 'detailed'
export type AdMode = 'rate' | 'shareRoas'
export type TaxMode = 'invoice' | 'quick'
export type TaxpayerType = 'general13' | 'small1' | 'small3' | 'exempt'

export interface ProductCostDetails {
  bom: number
  packaging: number
  accessories: number
  gifts: number
  inboundFreight: number
}

export interface FulfillmentDetails {
  delivery: number
  packing: number
  shippingInsurance: number
}

export interface PlatformFeeDetails {
  commissionRate: number
  paymentRate: number
  software: number
}

export interface CostGroup<T> {
  mode: CostMode
  summary: number
  detailed: T
}

export interface TaxSettings {
  /** 精算回票抵扣或直接按综合税率估算。 */
  mode: TaxMode
  taxpayerType: TaxpayerType
  /** 城建税、教育费附加等合计，基于应纳增值税。 */
  surtaxRate: number
  /** 快捷模式下，按退款后有效成交额计税。 */
  quickRate: number
  productInvoice: boolean
  logisticsInvoice: boolean
  /** 物流运输服务的专票税率。 */
  logisticsInvoiceRate: 0.06 | 0.09
  adInvoice: boolean
}

export interface ModelSettings {
  /** 单件实付成交价，含税口径。 */
  asp: number
  productCost: CostGroup<ProductCostDetails>
  fulfillmentCost: CostGroup<FulfillmentDetails>
  platformFee: CostGroup<PlatformFeeDetails>
  tax: TaxSettings
  marketing: {
    mode: AdMode
    /** 广告费 ÷ 成交额。 */
    gmvRate: number
    /** 用于 ROI / ROAS 方式的付费成交额占比。 */
    paidTrafficShare: number
    /** 成交额 ÷ 广告费。 */
    roas: number
    /** 按退款后有效成交额计提的达人/直播纯佣。 */
    livestreamCommissionRate: number
  }
  adjustments: {
    returnRate: number
    discount: number
  }
  targetNetMargin: number
}

export type CostCategory = 'product' | 'fulfillment' | 'platform' | 'marketing' | 'tax'

export interface LineItem {
  code: string
  name: string
  amount: number
  category: CostCategory
  detail?: string
}

export interface CalculationResult {
  asp: number
  gmv: number
  discount: number
  settledSales: number
  netSales: number
  returnRate: number
  productCost: number
  fulfillmentCost: number
  platformCost: number
  adCost: number
  livestreamCommission: number
  marketingCost: number
  taxCost: number
  outputVat: number
  productInputVat: number
  logisticsInputVat: number
  adInputVat: number
  inputVat: number
  payableVat: number
  surtax: number
  operationsCost: number
  returnProvision: number
  grossProfit: number
  cm1: number
  cm2: number
  netProfit: number
  grossMargin: number
  cm1Margin: number
  cm2Margin: number
  netMargin: number
  breakEvenRoas: number
  breakEvenPrice: number
  breakEvenCogs: number
  adSpendRate: number
  actualAdCostRate: number
  lineItems: LineItem[]
}
