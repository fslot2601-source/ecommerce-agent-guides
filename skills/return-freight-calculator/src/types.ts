export interface Model {
  price: number
  freight: number
  returnRate: number
  packagingLoss: number
  insurancePremium: number
  insurancePayout: number
  batchQuantity: number
}

export type ReturnFreightModel = Model

export interface PartialModel {
  price?: number
  freight?: number
  returnRate?: number
  packagingLoss?: number
  insurancePremium?: number
  insurancePayout?: number
  batchQuantity?: number
}

export interface Result {
  withInsurance: number
  withoutInsurance: number
  difference: number
  breakEvenRate: number | null
  reimbursement: number
}

export type ReturnFreightResult = Result

export interface ExtendedCalculationResult {
  reimbursement: number | null
  breakEvenRate: number | null
  difference: number | null
  withInsurance: number | null
  withoutInsurance: number | null
  batchDifference: number | null
  batchWithInsurance: number | null
  batchWithoutInsurance: number | null
  lossRatioToPrice: number | null
}

export type DecisionTone = 'safe' | 'warning' | 'neutral' | 'unknown'
export type Recommendation = 'open' | 'do_not_open' | 'neutral' | 'not_applicable' | 'insufficient_data'

export interface DecisionResult {
  recommendation: Recommendation
  tone: DecisionTone
  title: string
  detail: string
}

export interface SensitivityRow {
  returnRate: number
  difference: number | null
  withInsurance: number | null
  withoutInsurance: number | null
}
