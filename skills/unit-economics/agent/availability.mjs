// Dependency gates for the existing engine. Missing inputs are never business assumptions.
// Structural values only allow the full-settings engine/validator to run; no result is
// exposed unless every input used by that result is explicitly supplied.
import { createDefaultSettings } from '../src/defaultSettings.ts'

export function structuralSettings() {
  const clear = (value) => {
    if (typeof value === 'number') return 0
    if (typeof value === 'boolean') return false
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clear(item)]))
    return value
  }
  const settings = clear(createDefaultSettings())
  settings.asp = 1
  settings.marketing.roas = 1
  settings.tax.logisticsInvoiceRate = 0.09
  return settings
}

export function inferCostModes(settings) {
  const result = structuredClone(settings)
  for (const key of ['productCost', 'fulfillmentCost', 'platformFee']) {
    const group = result[key]
    if (group && typeof group === 'object' && !Array.isArray(group) && group.mode === undefined) {
      if (group.summary !== undefined && group.detailed === undefined) group.mode = 'summary'
      if (group.detailed !== undefined && group.summary === undefined) group.mode = 'detailed'
    }
  }
  return result
}

export function dependencies(settings) {
  const get = (key) => key.split('.').reduce((value, part) => value?.[part], settings)
  const missing = (keys) => [...new Set(keys)].filter((key) => get(key) === undefined)
  const group = (name, fields) => get(`${name}.mode`) === 'detailed'
    ? [`${name}.mode`, ...fields.map((field) => `${name}.detailed.${field}`)]
    : [`${name}.mode`, `${name}.summary`]
  const asp = ['asp']
  const product = group('productCost', ['bom', 'packaging', 'accessories', 'gifts', 'inboundFreight'])
  const fulfillment = group('fulfillmentCost', ['delivery', 'packing', 'shippingInsurance'])
  const platform = group('platformFee', ['commissionRate', 'paymentRate', 'software'])
  const settled = [...asp, 'adjustments.discount']
  const netSales = [...settled, 'adjustments.returnRate']
  const adRate = get('marketing.mode') === 'shareRoas'
    ? ['marketing.mode', 'marketing.paidTrafficShare', 'marketing.roas']
    : ['marketing.mode', 'marketing.gmvRate']
  const ad = [...asp, ...adRate]
  const commission = [...netSales, 'marketing.livestreamCommissionRate']
  const provision = ['adjustments.returnRate', ...product, ...fulfillment]
  let tax = ['tax.mode', ...netSales]
  if (get('tax.mode') === 'quick') tax.push('tax.quickRate')
  else {
    tax.push('tax.taxpayerType', 'tax.surtaxRate')
    if (get('tax.taxpayerType') === 'general13') {
      tax.push('tax.productInvoice', 'tax.logisticsInvoice', 'tax.adInvoice')
      if (get('tax.productInvoice') === true) tax.push(...product)
      if (get('tax.logisticsInvoice') === true) tax.push(...fulfillment, 'tax.logisticsInvoiceRate')
      if (get('tax.adInvoice') === true) tax.push(...ad)
    }
  }
  const gross = [...netSales, ...product]
  const cm1 = [...gross, ...fulfillment, ...provision, ...platform, ...tax]
  const profit = [...cm1, ...ad, ...commission]
  const fields = {
    asp, gmv: asp, discount: ['adjustments.discount'], settledSales: settled, netSales,
    returnRate: ['adjustments.returnRate'], productCost: product,
    fulfillmentCost: [...fulfillment, ...provision], platformCost: [...netSales, ...platform],
    adCost: ad, livestreamCommission: commission, marketingCost: [...ad, ...commission],
    returnProvision: provision, grossProfit: gross, cm1, cm2: profit, netProfit: profit,
    grossMargin: gross, cm1Margin: cm1, cm2Margin: profit, netMargin: profit,
    breakEvenRoas: profit, breakEvenPrice: profit, breakEvenCogs: profit,
    adSpendRate: adRate, actualAdCostRate: [...netSales, ...ad],
  }
  for (const key of ['taxCost', 'outputVat', 'productInputVat', 'logisticsInputVat', 'adInputVat', 'inputVat', 'payableVat', 'surtax', 'operationsCost']) fields[key] = tax
  const lines = {
    '1001': ['adjustments.discount'], '2000': product,
    '3000': fulfillment, '3009': provision, '4001': fields.platformCost,
    '5001': ad, '5002': commission, '6001': tax,
  }
  for (const [index, name] of ['bom', 'packaging', 'accessories', 'gifts', 'inboundFreight'].entries()) lines[String(2001 + index)] = ['productCost.mode', `productCost.detailed.${name}`]
  for (const [index, name] of ['delivery', 'packing', 'shippingInsurance'].entries()) lines[String(3001 + index)] = ['fulfillmentCost.mode', `fulfillmentCost.detailed.${name}`]
  return {
    missing,
    fields,
    lines,
    priceLessProductCost: [...asp, ...product],
    targets: [...profit, 'targetNetMargin'],
  }
}
