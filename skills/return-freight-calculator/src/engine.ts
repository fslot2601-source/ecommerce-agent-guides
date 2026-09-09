import type {
  DecisionResult,
  ExtendedCalculationResult,
  Model,
  PartialModel,
  Result,
  SensitivityRow,
} from './types'

export type {
  DecisionResult,
  DecisionTone,
  ExtendedCalculationResult,
  Model,
  PartialModel,
  Recommendation,
  Result,
  ReturnFreightModel,
  ReturnFreightResult,
  SensitivityRow,
} from './types'

const money = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const defaultModel: Model = {
  price: 159,
  freight: 10,
  returnRate: 28,
  packagingLoss: 3,
  insurancePremium: 2.8,
  insurancePayout: 10,
  batchQuantity: 1000,
}

export const presets: Array<{ name: string; description: string; model: Model }> = [
  {
    name: '女装高退',
    description: '退货率 38%',
    model: {
      price: 189,
      freight: 10,
      returnRate: 38,
      packagingLoss: 5,
      insurancePremium: 3.2,
      insurancePayout: 10,
      batchQuantity: 1000,
    },
  },
  {
    name: '标品低退',
    description: '退货率 6%',
    model: {
      price: 99,
      freight: 7,
      returnRate: 6,
      packagingLoss: 1.5,
      insurancePremium: 2.1,
      insurancePayout: 7,
      batchQuantity: 1000,
    },
  },
  {
    name: '鞋包中退',
    description: '退货率 18%',
    model: {
      price: 269,
      freight: 12,
      returnRate: 18,
      packagingLoss: 4,
      insurancePremium: 3.5,
      insurancePayout: 12,
      batchQuantity: 1000,
    },
  },
]

export function finite(value: number): boolean {
  return Number.isFinite(value)
}

export function formatMoney(value: number | null): string {
  return value === null || !finite(value) ? '—' : money.format(value)
}

export function formatPercent(value: number | null): string {
  return value === null || !finite(value) ? '—' : `${value.toFixed(1)}%`
}

export function calculateReimbursement(freight: number, insurancePayout: number): number {
  return Math.min(Math.max(0, freight), Math.max(0, insurancePayout))
}

export function calculateBreakEvenRate(insurancePremium: number, reimbursement: number): number | null {
  return reimbursement > 0 ? (insurancePremium / reimbursement) * 100 : null
}

export function calculateDifference(
  insurancePremium: number,
  returnRatePercent: number,
  reimbursement: number,
): number {
  const rate = returnRatePercent / 100
  return insurancePremium - rate * reimbursement
}

export function calculateWithoutInsurance(
  freight: number,
  returnRatePercent: number,
  packagingLoss: number,
): number {
  const rate = returnRatePercent / 100
  return freight + rate * (freight + packagingLoss)
}

export function calculateWithInsurance(
  freight: number,
  insurancePremium: number,
  returnRatePercent: number,
  reimbursement: number,
  packagingLoss: number,
): number {
  const rate = returnRatePercent / 100
  return freight + insurancePremium + rate * (freight - reimbursement + packagingLoss)
}

export function validate(model: Model): string | null {
  if (Object.values(model).some((value) => !finite(value))) return '请补全所有输入项。'
  if (model.price <= 0) return '售价必须大于 0。'
  if (model.freight < 0 || model.packagingLoss < 0 || model.insurancePremium < 0 || model.insurancePayout < 0) {
    return '成本与赔付金额不能小于 0。'
  }
  if (model.returnRate < 0 || model.returnRate > 100) return '预估退货率必须在 0% 至 100% 之间。'
  if (model.batchQuantity <= 0 || !Number.isInteger(model.batchQuantity)) return '发货批次总量必须是正整数。'
  return null
}

export function calculate(model: Model): Result {
  const reimbursement = calculateReimbursement(model.freight, model.insurancePayout)
  const withoutInsurance = calculateWithoutInsurance(model.freight, model.returnRate, model.packagingLoss)
  const withInsurance = calculateWithInsurance(
    model.freight,
    model.insurancePremium,
    model.returnRate,
    reimbursement,
    model.packagingLoss,
  )
  return {
    withInsurance,
    withoutInsurance,
    difference: withInsurance - withoutInsurance,
    breakEvenRate: calculateBreakEvenRate(model.insurancePremium, reimbursement),
    reimbursement,
  }
}

export function calculateExtended(input: PartialModel): ExtendedCalculationResult {
  const { freight, insurancePayout, insurancePremium, returnRate, packagingLoss, batchQuantity, price } = input

  const hasFreight = typeof freight === 'number' && finite(freight)
  const hasPayout = typeof insurancePayout === 'number' && finite(insurancePayout)
  const hasPremium = typeof insurancePremium === 'number' && finite(insurancePremium)
  const hasRate = typeof returnRate === 'number' && finite(returnRate)
  const hasLoss = typeof packagingLoss === 'number' && finite(packagingLoss)
  const hasBatch = typeof batchQuantity === 'number' && finite(batchQuantity) && batchQuantity > 0 && Number.isInteger(batchQuantity)
  const hasPrice = typeof price === 'number' && finite(price) && price > 0

  const reimbursement = hasFreight && hasPayout ? calculateReimbursement(freight, insurancePayout) : null
  const breakEvenRate = hasPremium && reimbursement !== null ? calculateBreakEvenRate(insurancePremium, reimbursement) : null
  const difference = hasPremium && hasRate && reimbursement !== null ? calculateDifference(insurancePremium, returnRate, reimbursement) : null

  const withoutInsurance = hasFreight && hasRate && hasLoss ? calculateWithoutInsurance(freight, returnRate, packagingLoss) : null
  const withInsurance = hasFreight && hasPremium && hasRate && hasLoss && reimbursement !== null
    ? calculateWithInsurance(freight, insurancePremium, returnRate, reimbursement, packagingLoss)
    : null

  const batchDifference = hasBatch && difference !== null ? difference * batchQuantity : null
  const batchWithInsurance = hasBatch && withInsurance !== null ? withInsurance * batchQuantity : null
  const batchWithoutInsurance = hasBatch && withoutInsurance !== null ? withoutInsurance * batchQuantity : null

  const lossRatioToPrice = hasPrice && withoutInsurance !== null ? (withoutInsurance / price) * 100 : null

  return {
    reimbursement,
    breakEvenRate,
    difference,
    withInsurance,
    withoutInsurance,
    batchDifference,
    batchWithInsurance,
    batchWithoutInsurance,
    lossRatioToPrice,
  }
}

export function evaluateDecision(
  difference: number | null,
  batchQuantity?: number | null,
): DecisionResult {
  if (difference === null) {
    return {
      recommendation: 'insufficient_data',
      tone: 'unknown',
      title: '暂无法对比方案成本',
      detail: '缺少计算保费差额所需的数据。',
    }
  }

  const absDiff = Math.abs(difference)
  const formattedDiff = absDiff > 1e-9 && absDiff < 0.005 ? `¥${absDiff.toPrecision(4)}` : formatMoney(absDiff)
  const hasBatch = typeof batchQuantity === 'number' && finite(batchQuantity) && batchQuantity > 0
  const batchSavings = hasBatch ? `，本批次预计节省 ${formatMoney(absDiff * batchQuantity)}。` : '。'

  if (difference < -1e-9) {
    return {
      recommendation: 'open',
      tone: 'safe',
      title: '仅按成本比较：建议开通运费险',
      detail: `每单预计节省 ${formattedDiff}${batchSavings}`,
    }
  }

  if (difference > 1e-9) {
    return {
      recommendation: 'do_not_open',
      tone: 'warning',
      title: '仅按成本比较：建议不开通运费险',
      detail: `每单预计节省 ${formattedDiff}${batchSavings}`,
    }
  }

  return {
    recommendation: 'neutral',
    tone: 'neutral',
    title: '两种方案成本持平',
    detail: '可按售后体验与平台规则决定是否开通。',
  }
}

export function calculateSensitivity(
  model: PartialModel,
  baseRates: number[] = [5, 10, 15, 20, 25, 30, 40],
): SensitivityRow[] {
  const currentRate = typeof model.returnRate === 'number' && finite(model.returnRate) ? model.returnRate : null
  const rates = currentRate !== null
    ? [...new Set([...baseRates, currentRate])].sort((a, b) => a - b)
    : [...new Set(baseRates)].sort((a, b) => a - b)

  const { freight, insurancePremium, insurancePayout, packagingLoss } = model
  const hasFreight = typeof freight === 'number' && finite(freight)
  const hasPayout = typeof insurancePayout === 'number' && finite(insurancePayout)
  const hasPremium = typeof insurancePremium === 'number' && finite(insurancePremium)
  const hasLoss = typeof packagingLoss === 'number' && finite(packagingLoss)

  const reimbursement = hasFreight && hasPayout ? calculateReimbursement(freight, insurancePayout) : null

  return rates.map((rate) => {
    const diff = hasPremium && reimbursement !== null ? calculateDifference(insurancePremium, rate, reimbursement) : null
    const without = hasFreight && hasLoss ? calculateWithoutInsurance(freight, rate, packagingLoss) : null
    const withIns = hasFreight && hasPremium && hasLoss && reimbursement !== null
      ? calculateWithInsurance(freight, insurancePremium, rate, reimbursement, packagingLoss)
      : null

    return {
      returnRate: rate,
      difference: diff,
      withInsurance: withIns,
      withoutInsurance: without,
    }
  })
}
