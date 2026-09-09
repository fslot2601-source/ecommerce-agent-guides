// Dependency gates for return freight cost comparison engine.
// Missing inputs are never business assumptions or defaulted to zero.

export const fieldLabels = {
  price: '售价 (price)',
  freight: '发货单程运费 (freight)',
  returnRate: '预估退货率 (returnRate)',
  packagingLoss: '包装破损折旧成本 (packagingLoss)',
  insurancePremium: '运费险保费 (insurancePremium)',
  insurancePayout: '单笔赔付金额 (insurancePayout)',
  batchQuantity: '发货批次总量 (batchQuantity)',
}

export const metricLabels = {
  reimbursement: '有效运费赔付',
  breakEvenRate: '盈亏平衡临界退货率',
  difference: '开通方案单均差额',
  withInsurance: '开通运费险单均成本',
  withoutInsurance: '不开通运费险单均成本',
  batchDifference: '开通方案批次差额',
  batchWithInsurance: '开通运费险批次总成本',
  batchWithoutInsurance: '不开通运费险批次总成本',
  lossRatioToPrice: '不开通方案物流成本占售价比（含正向运费）',
}

export const metricDependencies = {
  reimbursement: ['freight', 'insurancePayout'],
  breakEvenRate: ['freight', 'insurancePayout', 'insurancePremium'],
  difference: ['freight', 'insurancePayout', 'insurancePremium', 'returnRate'],
  withoutInsurance: ['freight', 'returnRate', 'packagingLoss'],
  withInsurance: ['freight', 'insurancePayout', 'insurancePremium', 'returnRate', 'packagingLoss'],
  batchDifference: ['freight', 'insurancePayout', 'insurancePremium', 'returnRate', 'batchQuantity'],
  batchWithInsurance: ['freight', 'insurancePayout', 'insurancePremium', 'returnRate', 'packagingLoss', 'batchQuantity'],
  batchWithoutInsurance: ['freight', 'returnRate', 'packagingLoss', 'batchQuantity'],
  lossRatioToPrice: ['freight', 'returnRate', 'packagingLoss', 'price'],
}

export function checkMissingMetrics(inputs) {
  const missingByMetric = {}
  for (const [metric, deps] of Object.entries(metricDependencies)) {
    const missingFields = deps.filter((field) => inputs[field] === undefined)
    if (missingFields.length > 0) {
      missingByMetric[metric] = missingFields.map((field) => fieldLabels[field] || field)
    }
  }
  return missingByMetric
}
