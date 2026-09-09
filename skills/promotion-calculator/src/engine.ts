export type CouponKind = 'fixed' | 'rate'

export type Model = {
  listPrice: number
  productCost: number
  shippingCost: number
  platformFeeRate: number
  taxRate: number
  fullReductionThreshold: number
  fullReductionAmount: number
  basketAmount: number
  itemAllocationRate: number
  shopCouponKind: CouponKind
  shopCouponThreshold: number
  shopCouponValue: number
  newCustomerGift: number
  newCustomerPlatformRate: number
  categoryCouponKind: CouponKind
  categoryCouponThreshold: number
  categoryCouponValue: number
  categoryPlatformRate: number
  vipCreatorCouponKind: CouponKind
  vipCreatorCouponThreshold: number
  vipCreatorCouponValue: number
  vipCreatorPlatformRate: number
}

export type NumericField = Exclude<keyof Model, 'shopCouponKind' | 'categoryCouponKind' | 'vipCreatorCouponKind'>

export type Layer = {
  name: string
  note: string
  discount: number
  merchant: number
  platform: number
}

export type Result = {
  consumerPrice: number
  merchantReceipt: number
  fee: number
  tax: number
  netProfit: number
  margin: number
  totalDiscount: number
  merchantDiscount: number
  platformContribution: number
  externalSubsidy: number
  layers: Layer[]
  breakEvenListPrice: number | null
  maxShopCoupon: number | null
  fullReductionEligible: boolean
  shopCouponEligible: boolean
}

export type PartialLayer = {
  name: string
  note: string
  discount: number | null
  merchant: number | null
  platform: number | null
}

export type PromotionCalculationResult = {
  consumerPrice: number | null
  merchantReceipt: number | null
  fee: number | null
  tax: number | null
  productCost: number | null
  shippingCost: number | null
  netProfit: number | null
  margin: number | null
  totalDiscount: number | null
  merchantDiscount: number | null
  platformContribution: number | null
  externalSubsidy: number | null
  layers: PartialLayer[]
  breakEvenListPrice: number | null
  maxShopCoupon: number | null
  fullReductionEligible: boolean | null
  shopCouponEligible: boolean | null
  missingByMetric: Record<string, string[]>
  status: 'complete' | 'partial'
}

export const defaultModel: Model = {
  listPrice: 399,
  productCost: 168,
  shippingCost: 10,
  platformFeeRate: 5,
  taxRate: 1,
  fullReductionThreshold: 300,
  fullReductionAmount: 50,
  basketAmount: 399,
  itemAllocationRate: 100,
  shopCouponKind: 'fixed',
  shopCouponThreshold: 300,
  shopCouponValue: 30,
  newCustomerGift: 20,
  newCustomerPlatformRate: 100,
  categoryCouponKind: 'fixed',
  categoryCouponThreshold: 0,
  categoryCouponValue: 20,
  categoryPlatformRate: 40,
  vipCreatorCouponKind: 'fixed',
  vipCreatorCouponThreshold: 0,
  vipCreatorCouponValue: 15,
  vipCreatorPlatformRate: 40,
}

export const presets: Array<{ name: string; description: string; values: Model }> = [
  { name: '天猫双11 / 618', description: '满减、店铺券、新客礼金、88VIP', values: defaultModel },
  {
    name: '抖音大促',
    description: '官方立减、首单礼金、达人券',
    values: {
      ...defaultModel,
      listPrice: 299,
      productCost: 118,
      shippingCost: 8,
      platformFeeRate: 5,
      taxRate: 1,
      fullReductionThreshold: 199,
      fullReductionAmount: 30,
      basketAmount: 299,
      shopCouponThreshold: 199,
      shopCouponValue: 20,
      newCustomerGift: 15,
      categoryCouponThreshold: 0,
      categoryCouponValue: 0,
      categoryPlatformRate: 0,
      vipCreatorCouponThreshold: 0,
      vipCreatorCouponValue: 30,
      vipCreatorPlatformRate: 20,
    },
  },
  {
    name: '拼多多百亿补贴',
    description: '平台券高比例补贴',
    values: {
      ...defaultModel,
      listPrice: 259,
      productCost: 104,
      shippingCost: 7,
      platformFeeRate: 3,
      taxRate: 1,
      fullReductionThreshold: 0,
      fullReductionAmount: 0,
      basketAmount: 259,
      shopCouponThreshold: 0,
      shopCouponValue: 0,
      newCustomerGift: 0,
      categoryCouponThreshold: 0,
      categoryCouponValue: 60,
      categoryPlatformRate: 72,
      vipCreatorCouponThreshold: 0,
      vipCreatorCouponValue: 0,
      vipCreatorPlatformRate: 0,
    },
  },
]

export function finite(value: number) {
  return Number.isFinite(value)
}

export function formatMoney(value: number | null) {
  if (value === null || !finite(value)) return '—'
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number) {
  return `${(finite(value) ? value : 0).toFixed(1)}%`
}

export function validate(model: Model): string | null {
  if (!Object.values(model).filter((value): value is number => typeof value === 'number').every(finite)) {
    return '请补全所有数值输入。'
  }
  if (model.listPrice <= 0) return '标价必须大于 0。'
  if (
    [
      model.productCost,
      model.shippingCost,
      model.fullReductionThreshold,
      model.fullReductionAmount,
      model.basketAmount,
      model.shopCouponThreshold,
      model.shopCouponValue,
      model.newCustomerGift,
      model.categoryCouponThreshold,
      model.categoryCouponValue,
      model.vipCreatorCouponThreshold,
      model.vipCreatorCouponValue,
    ].some((value) => value < 0)
  ) {
    return '金额和门槛不能为负数。'
  }
  if (
    [
      model.platformFeeRate,
      model.taxRate,
      model.itemAllocationRate,
      model.newCustomerPlatformRate,
      model.categoryPlatformRate,
      model.vipCreatorPlatformRate,
    ].some((value) => value < 0 || value > 100)
  ) {
    return '比例请输入 0–100 之间的数值。'
  }
  if (
    (model.shopCouponKind === 'rate' && model.shopCouponValue > 100) ||
    (model.categoryCouponKind === 'rate' && model.categoryCouponValue > 100) ||
    (model.vipCreatorCouponKind === 'rate' && model.vipCreatorCouponValue > 100)
  ) {
    return '折扣券比例请输入 0–100 之间的数值。'
  }
  return null
}

export function couponDiscount(amount: number, threshold: number, kind: CouponKind, value: number) {
  if (amount + 0.000001 < threshold) return 0
  return Math.min(amount, kind === 'fixed' ? value : (amount * value) / 100)
}

export function couponNote(kind: CouponKind, threshold: number, value: number) {
  return kind === 'fixed'
    ? `满 ${formatMoney(threshold)} 减 ${formatMoney(value)}`
    : `满 ${formatMoney(threshold)} 打 ${formatPercent(value)} 折`
}

export function reverseTargets(
  model: Model,
  shopCouponEligible?: boolean,
): { breakEvenListPrice: number | null; maxShopCoupon: number | null } {
  let breakEvenListPrice: number | null = null
  let maxShopCoupon: number | null = null

  const lossAtCeiling = calculation({ ...model, listPrice: 10_000_000 }, false).netProfit
  if (lossAtCeiling >= 0) {
    let low = 0
    let high = 10_000_000
    for (let index = 0; index < 56; index += 1) {
      const middle = (low + high) / 2
      if (calculation({ ...model, listPrice: middle }, false).netProfit >= 0) high = middle
      else low = middle
    }
    breakEvenListPrice = high
  }

  const isEligible = shopCouponEligible ?? model.listPrice >= model.shopCouponThreshold
  if (isEligible) {
    const cap = model.shopCouponKind === 'fixed' ? model.listPrice : 100
    if (calculation({ ...model, shopCouponValue: 0 }, false).netProfit >= 0) {
      let low = 0
      let high = cap
      for (let index = 0; index < 56; index += 1) {
        const middle = (low + high) / 2
        if (calculation({ ...model, shopCouponValue: middle }, false).netProfit >= 0) low = middle
        else high = middle
      }
      maxShopCoupon = low
    } else {
      maxShopCoupon = 0
    }
  }

  return { breakEvenListPrice, maxShopCoupon }
}

export function calculation(model: Model, includeInverses = true): Result {
  let price = model.listPrice
  const layers: Layer[] = []
  const addLayer = (name: string, note: string, discount: number, merchantRate: number, platformRate: number) => {
    const applied = Math.max(0, Math.min(price, discount))
    price -= applied
    layers.push({ name, note, discount: applied, merchant: applied * merchantRate, platform: applied * platformRate })
  }

  const fullReductionDiscount =
    model.fullReductionThreshold > 0 && model.basketAmount >= model.fullReductionThreshold
      ? (model.fullReductionAmount * model.itemAllocationRate) / 100
      : 0
  addLayer(
    '跨店满减 / 官方立减',
    model.fullReductionThreshold > 0
      ? `订单满 ${formatMoney(model.fullReductionThreshold)}，本商品分摊 ${formatPercent(model.itemAllocationRate)}`
      : '未配置',
    fullReductionDiscount,
    1,
    0,
  )
  const shopCouponEligible = price >= model.shopCouponThreshold

  const shopDiscount = couponDiscount(price, model.shopCouponThreshold, model.shopCouponKind, model.shopCouponValue)
  addLayer(
    '店铺券 / 满折',
    couponNote(model.shopCouponKind, model.shopCouponThreshold, model.shopCouponValue),
    shopDiscount,
    1,
    0,
  )

  addLayer(
    '新客礼金 / 首单礼金',
    `礼金 ${formatMoney(model.newCustomerGift)}；平台出资 ${formatPercent(model.newCustomerPlatformRate)}`,
    model.newCustomerGift,
    1 - model.newCustomerPlatformRate / 100,
    model.newCustomerPlatformRate / 100,
  )

  const categoryDiscount = couponDiscount(
    price,
    model.categoryCouponThreshold,
    model.categoryCouponKind,
    model.categoryCouponValue,
  )
  addLayer(
    '品类券 / 平台券',
    `${couponNote(model.categoryCouponKind, model.categoryCouponThreshold, model.categoryCouponValue)}；平台出资 ${formatPercent(model.categoryPlatformRate)}`,
    categoryDiscount,
    1 - model.categoryPlatformRate / 100,
    model.categoryPlatformRate / 100,
  )

  const vipCreatorDiscount = couponDiscount(
    price,
    model.vipCreatorCouponThreshold,
    model.vipCreatorCouponKind,
    model.vipCreatorCouponValue,
  )
  addLayer(
    '88VIP / 达人券',
    `${couponNote(model.vipCreatorCouponKind, model.vipCreatorCouponThreshold, model.vipCreatorCouponValue)}；平台出资 ${formatPercent(model.vipCreatorPlatformRate)}`,
    vipCreatorDiscount,
    1 - model.vipCreatorPlatformRate / 100,
    model.vipCreatorPlatformRate / 100,
  )

  const totalDiscount = layers.reduce((sum, layer) => sum + layer.discount, 0)
  const merchantDiscount = layers.reduce((sum, layer) => sum + layer.merchant, 0)
  const platformContribution = layers.reduce((sum, layer) => sum + layer.platform, 0)
  const externalSubsidy = platformContribution
  const merchantReceipt = price + externalSubsidy
  const fee = (merchantReceipt * model.platformFeeRate) / 100
  const tax = (merchantReceipt * model.taxRate) / 100
  const netProfit = merchantReceipt - model.productCost - model.shippingCost - fee - tax
  const margin = merchantReceipt > 0 ? (netProfit / merchantReceipt) * 100 : -100

  let breakEvenListPrice: number | null = null
  let maxShopCoupon: number | null = null
  if (includeInverses) {
    const inverses = reverseTargets(model, shopCouponEligible)
    breakEvenListPrice = inverses.breakEvenListPrice
    maxShopCoupon = inverses.maxShopCoupon
  }

  return {
    consumerPrice: price,
    merchantReceipt,
    fee,
    tax,
    netProfit,
    margin,
    totalDiscount,
    merchantDiscount,
    platformContribution,
    externalSubsidy,
    layers,
    breakEvenListPrice,
    maxShopCoupon,
    fullReductionEligible: model.fullReductionThreshold > 0 && model.basketAmount >= model.fullReductionThreshold,
    shopCouponEligible,
  }
}

// Segment the existing price curve at coupon thresholds and saturation points.
// On each open segment the model is affine; test adjacent 0.01-grid points with
// the original calculation rather than assuming the whole curve is monotonic.
export function skillReverseTargets(model: Model) {
  const solve = (variable: 'listPrice' | 'shopCouponValue', low: number, high: number, maximum: boolean) => {
    const at = (x: number) => ({ ...model, [variable]: x })
    const trace = (x: number) => calculation(at(x), false)
    let cuts = [low, high]
    const prePrice = (x: number, layer: number) => {
      const config = at(x)
      return config.listPrice - trace(x).layers.slice(0, layer).reduce((sum, row) => sum + row.discount, 0)
    }
    for (let layer = 0; layer < 5; layer += 1) {
      const equations: Array<(x: number) => number> = []
      if (layer === 0) {
        const reduction = model.fullReductionThreshold > 0 && model.basketAmount >= model.fullReductionThreshold
          ? model.fullReductionAmount * model.itemAllocationRate / 100 : 0
        equations.push((x) => prePrice(x, layer) - reduction)
      } else if (layer === 2) {
        equations.push((x) => prePrice(x, layer) - model.newCustomerGift)
      } else {
        const prefix = layer === 1 ? 'shop' : layer === 3 ? 'category' : 'vipCreator'
        const threshold = model[`${prefix}CouponThreshold` as keyof Model] as number
        const kind = model[`${prefix}CouponKind` as keyof Model] as CouponKind
        equations.push((x) => prePrice(x, layer) + 0.000001 - threshold)
        equations.push((x) => {
          const price = prePrice(x, layer)
          const value = at(x)[`${prefix}CouponValue` as keyof Model] as number
          return price - (kind === 'fixed' ? value : price * value / 100)
        })
      }
      const extra: number[] = []
      for (let i = 0; i < cuts.length - 1; i += 1) {
        const a = cuts[i], b = cuts[i + 1]
        if (b - a < 1e-10) continue
        const x1 = a + (b - a) / 3, x2 = a + (b - a) * 2 / 3
        for (const equation of equations) {
          const y1 = equation(x1), y2 = equation(x2)
          if (Math.abs(y2 - y1) < 1e-12) continue
          const root = x1 - y1 * (x2 - x1) / (y2 - y1)
          if (Number.isFinite(root) && root > a && root < b) extra.push(root)
        }
      }
      cuts = [...new Set([...cuts, ...extra])].sort((a, b) => a - b)
    }
    const candidates = new Set<number>()
    const addGrid = (x: number) => {
      for (const tick of [Math.floor(x * 100) - 1, Math.floor(x * 100), Math.ceil(x * 100), Math.ceil(x * 100) + 1]) {
        const value = tick / 100
        if (value >= low && value <= high) candidates.add(value)
      }
    }
    cuts.forEach(addGrid)
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const a = cuts[i], b = cuts[i + 1]
      if (b - a < 1e-10) continue
      const x1 = a + (b - a) / 3, x2 = a + (b - a) * 2 / 3
      const y1 = trace(x1).netProfit, y2 = trace(x2).netProfit
      if (Math.abs(y2 - y1) > 1e-12) {
        const root = x1 - y1 * (x2 - x1) / (y2 - y1)
        if (root >= a && root <= b) addGrid(root)
      }
    }
    const feasible = [...candidates].filter((x) => trace(x).netProfit >= -1e-8)
    return feasible.length ? (maximum ? Math.max(...feasible) : Math.min(...feasible)) : null
  }
  // Eligibility is determined after the upstream reduction, not at the list price.
  const current = calculation(model, false)
  return {
    breakEvenListPrice: solve('listPrice', 0.01, 10_000_000, false),
    maxShopCoupon: current.shopCouponEligible
      ? solve('shopCouponValue', 0, model.shopCouponKind === 'fixed' ? model.listPrice : 100, true)
      : null,
  }
}

export function calculatePromotion(settings: Partial<Model>, options: { includeInverses?: boolean } = {}): PromotionCalculationResult {
  // Values in this structural model are execution scaffolding, never user data.
  const structure = Object.fromEntries(Object.entries(defaultModel).map(([key, value]) => [key, typeof value === 'number' ? 0 : 'fixed'])) as Model
  structure.listPrice = 1
  const model: Model = { ...structure, ...settings }
  const raw = calculation(model, false)
  const missing = (keys: string[]) => [...new Set(keys)].filter((key) => settings[key as keyof Model] === undefined)
  const missingByMetric: Record<string, string[]> = {}
  const value = <T>(key: string, required: string[], actual: T): T | null => {
    const absent = missing(required)
    if (absent.length) { missingByMetric[key] = absent; return null }
    return actual
  }
  const layerRules = [
    { amount: 'fullReductionAmount', fields: ['fullReductionThreshold', 'basketAmount', 'itemAllocationRate'], funding: [] },
    { amount: 'shopCouponValue', fields: ['shopCouponKind', 'shopCouponThreshold'], funding: [] },
    { amount: 'newCustomerGift', fields: [], funding: ['newCustomerPlatformRate'] },
    { amount: 'categoryCouponValue', fields: ['categoryCouponKind', 'categoryCouponThreshold'], funding: ['categoryPlatformRate'] },
    { amount: 'vipCreatorCouponValue', fields: ['vipCreatorCouponKind', 'vipCreatorCouponThreshold'], funding: ['vipCreatorPlatformRate'] },
  ]
  let priceRequired = ['listPrice']
  let allFunding: string[] = []
  let fullReductionEligible: boolean | null = null
  let shopCouponEligible: boolean | null = null
  const layers = layerRules.map((rule, index): PartialLayer => {
    const disabled = settings[rule.amount as keyof Model] === 0
    const own = disabled ? [rule.amount] : [rule.amount, ...rule.fields]
    const discountRequired = disabled ? own : [...priceRequired, ...own]
    const fundingRequired = disabled ? own : [...discountRequired, ...rule.funding]
    const discount = value(`layers.${index}.discount`, discountRequired, raw.layers[index].discount)
    const merchant = value(`layers.${index}.merchant`, fundingRequired, raw.layers[index].merchant)
    const platform = value(`layers.${index}.platform`, fundingRequired, raw.layers[index].platform)
    if (index === 0) fullReductionEligible = value('fullReductionEligible', ['fullReductionThreshold', 'basketAmount'], raw.fullReductionEligible)
    if (index === 1) shopCouponEligible = value('shopCouponEligible', [...priceRequired, 'shopCouponThreshold'], raw.shopCouponEligible)
    priceRequired = [...priceRequired, ...own]
    allFunding = [...allFunding, ...fundingRequired]
    const note = missing(fundingRequired).length ? `缺少：${missing(fundingRequired).join('、')}`
      : disabled ? '用户明确无此项优惠' : raw.layers[index].note.replace(/打 ([\d.]+)% 折/g, '优惠扣减 $1%')
    return { name: raw.layers[index].name, note, discount, merchant, platform }
  })
  const receiptRequired = [...priceRequired, ...allFunding]
  const profitRequired = [...receiptRequired, 'productCost', 'shippingCost', 'platformFeeRate', 'taxRate']
  const consumerPrice = value('consumerPrice', priceRequired, raw.consumerPrice)
  const merchantReceipt = value('merchantReceipt', receiptRequired, raw.merchantReceipt)
  const netProfit = value('netProfit', profitRequired, raw.netProfit)
  const margin = value('margin', profitRequired, raw.merchantReceipt > 0 ? raw.margin : null)
  let breakEvenListPrice: number | null = null
  let maxShopCoupon: number | null = null
  // Reverse inputs must cover all rules because changing price/coupon may activate
  // a previously inactive layer. Do not invent thresholds or funding for inversion.
  const reverseRequired = Object.keys(defaultModel)
  const inverseMissing = missing(reverseRequired)
  if (inverseMissing.length) {
    missingByMetric.breakEvenListPrice = inverseMissing
    missingByMetric.maxShopCoupon = inverseMissing
  } else if (options.includeInverses !== false) {
    const inverses = skillReverseTargets(model)
    breakEvenListPrice = inverses.breakEvenListPrice
    maxShopCoupon = inverses.maxShopCoupon
  }
  return {
    consumerPrice, merchantReceipt,
    fee: value('fee', [...receiptRequired, 'platformFeeRate'], raw.fee),
    tax: value('tax', [...receiptRequired, 'taxRate'], raw.tax),
    productCost: value('productCost', ['productCost'], settings.productCost ?? null),
    shippingCost: value('shippingCost', ['shippingCost'], settings.shippingCost ?? null),
    netProfit, margin,
    totalDiscount: value('totalDiscount', priceRequired, raw.totalDiscount),
    merchantDiscount: value('merchantDiscount', allFunding, raw.merchantDiscount),
    platformContribution: value('platformContribution', allFunding, raw.platformContribution),
    externalSubsidy: value('externalSubsidy', allFunding, raw.externalSubsidy),
    layers, breakEvenListPrice, maxShopCoupon, fullReductionEligible, shopCouponEligible,
    missingByMetric, status: netProfit === null ? 'partial' : 'complete',
  }
}
