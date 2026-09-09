// Dependency gates for the existing live-taoke engine.
// Missing inputs are never treated as zero or business defaults.
// Structural values only allow the engine/validator to run without runtime exceptions;
// no metric is exposed unless every input required for that metric is explicitly supplied.

export function structuralSettings() {
  return {
    scenario: 'influencerSlot',
    productName: '结构基准',
    listPrice: 100,
    coupon: 0,
    units: 0,
    expectedUnits: 1,
    bomCost: 0,
    packagingCost: 0,
    shippingCost: 0,
    returnRate: 0,
    platformFeeRate: 0,
    taxMode: 'inclusive',
    taxRate: 0,
    paidTrafficShare: 0,
    roi: 1,
    commissionRate: 0,
    leaderFeeRate: 0,
    slotFee: 0,
    sampleCost: 0,
  }
}

export function dependencies(settings) {
  const has = (key) => settings[key] !== undefined
  const missing = (keys) => [...new Set(keys)].filter((key) => !has(key))

  const paidPrice = ['listPrice', 'coupon']
  const netSettlement = [...paidPrice, 'returnRate']
  const expectedRefund = [...paidPrice, 'returnRate']
  const bomCost = ['bomCost', 'packagingCost']
  const fulfilmentCost = ['shippingCost']
  const platformFee = [...paidPrice, 'platformFeeRate']
  const commission = [...paidPrice, 'commissionRate']
  const leaderFee = [...paidPrice, 'leaderFeeRate']

  const slotAllocation = settings.slotFee === 0 ? ['slotFee'] : ['slotFee', 'expectedUnits']
  const sampleAllocation = settings.sampleCost === 0 ? ['sampleCost'] : ['sampleCost', 'expectedUnits']
  const commercialPromotion = [...paidPrice, 'commissionRate', 'leaderFeeRate', ...slotAllocation, ...sampleAllocation]

  const adSpend = settings.paidTrafficShare === 0
    ? ['paidTrafficShare']
    : [...paidPrice, 'paidTrafficShare', 'roi']

  const tax = [...paidPrice, 'taxMode', 'taxRate']
  const grossProfit = [...paidPrice, ...bomCost]
  const contributionMargin1 = [...grossProfit, ...fulfilmentCost, 'platformFeeRate']
  const contributionBeforeFixed = [
    ...contributionMargin1,
    'returnRate',
    'commissionRate',
    'leaderFeeRate',
    ...adSpend,
    ...tax,
  ]
  const fixedCosts = ['slotFee', 'sampleCost']
  const unitProfit = [...contributionBeforeFixed, ...slotAllocation, ...sampleAllocation]
  const margin = [...unitProfit, ...paidPrice]
  const totalProfit = [...contributionBeforeFixed, ...fixedCosts, 'units']
  const breakEvenUnits = [...contributionBeforeFixed, ...fixedCosts]
  const maxCommissionRate = [...unitProfit]
  const maxSlotFee = [...unitProfit, 'expectedUnits']
  const breakEvenRoi = [...unitProfit, 'paidTrafficShare']
  const safetyMargin = settings.paidTrafficShare > 0
    ? [...unitProfit, 'paidTrafficShare', 'roi']
    : [...unitProfit]

  const gmv = [...paidPrice, 'units']
  const totalNetSettlement = [...netSettlement, 'units']
  const totalAdSpend = settings.paidTrafficShare === 0
    ? ['paidTrafficShare', 'units']
    : [...paidPrice, 'paidTrafficShare', 'roi', 'units']

  const totalCost = [
    ...bomCost,
    ...fulfilmentCost,
    ...expectedRefund,
    ...platformFee,
    ...commercialPromotion,
    ...adSpend,
    ...tax,
  ]

  const fields = {
    paidPrice,
    netSettlement,
    expectedRefund,
    bomCost,
    fulfilmentCost,
    platformFee,
    commission,
    leaderFee,
    slotAllocation,
    sampleAllocation,
    commercialPromotion,
    adSpend,
    tax,
    grossProfit,
    contributionMargin1,
    operatingProfit: unitProfit,
    unitProfit,
    margin,
    totalProfit,
    breakEvenUnits,
    maxCommissionRate,
    maxSlotFee,
    breakEvenRoi,
    safetyMargin,
    gmv,
    totalNetSettlement,
    totalAdSpend,
    totalCost,
  }

  const costLines = {
    returns: expectedRefund,
    bom: bomCost,
    fulfilment: fulfilmentCost,
    platform: platformFee,
    promotion: commercialPromotion,
    ads: adSpend,
    tax,
  }

  const priceLessBom = ['listPrice', 'bomCost']
  const sensitivityRequired = [...unitProfit, 'units']

  return {
    missing,
    fields,
    costLines,
    priceLessBom,
    sensitivityRequired,
  }
}
