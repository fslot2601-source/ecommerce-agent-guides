// Dependency gates for ad-roi-calculator.
// Missing inputs are never business assumptions or defaulted to zero.

export const METRIC_DEPENDENCIES = {
  settledRevenue: ['price', 'returnRate'],
  transactionCost: ['price', 'returnRate', 'platformRate'],
  contribution: ['price', 'returnRate', 'platformRate', 'purchaseCost', 'shippingCost'],
  targetProfit: ['price', 'returnRate', 'targetMargin'],
  pureBreakEvenRoi: ['price', 'returnRate', 'platformRate', 'purchaseCost', 'shippingCost'],
  targetRoi: ['price', 'returnRate', 'platformRate', 'purchaseCost', 'shippingCost', 'targetMargin'],
  mixedBreakEvenRoi: ['price', 'returnRate', 'platformRate', 'purchaseCost', 'shippingCost', 'paidShare'],
  maxCpc: ['price', 'returnRate', 'platformRate', 'purchaseCost', 'shippingCost', 'cvr'],
  maxCpm: ['price', 'returnRate', 'platformRate', 'purchaseCost', 'shippingCost', 'cvr', 'ctr'],
  budgetScenarios: ['price', 'returnRate', 'platformRate', 'purchaseCost', 'shippingCost', 'budget'],
}

export function dependencies(settings = {}) {
  const isPresent = (key) => typeof settings[key] === 'number' && Number.isFinite(settings[key])
  const missing = (keys) => [...new Set(keys)].filter((key) => !isPresent(key))

  const fields = {}
  for (const [metric, deps] of Object.entries(METRIC_DEPENDENCIES)) {
    fields[metric] = deps
  }

  return {
    missing,
    fields,
  }
}
