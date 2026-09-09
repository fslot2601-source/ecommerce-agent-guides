import type { ModelSettings } from './types'

export function createDefaultSettings(): ModelSettings {
  return {
    asp: 169,
    productCost: { mode: 'summary', summary: 62, detailed: { bom: 48, packaging: 4, accessories: 2, gifts: 3, inboundFreight: 5 } },
    fulfillmentCost: { mode: 'summary', summary: 8.5, detailed: { delivery: 5, packing: 2.5, shippingInsurance: 1 } },
    platformFee: { mode: 'summary', summary: 0.05, detailed: { commissionRate: 0.05, paymentRate: 0.006, software: 1 } },
    tax: {
      mode: 'invoice',
      taxpayerType: 'general13',
      surtaxRate: 0.12,
      quickRate: 0.02,
      productInvoice: true,
      logisticsInvoice: true,
      logisticsInvoiceRate: 0.09,
      adInvoice: true,
    },
    marketing: { mode: 'rate', gmvRate: 0.18, paidTrafficShare: 0.7, roas: 4, livestreamCommissionRate: 0 },
    adjustments: { returnRate: 0.12, discount: 0 },
    targetNetMargin: 0.1,
  }
}
