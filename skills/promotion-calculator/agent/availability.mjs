export const ASSUMPTIONS = [
  '优惠按跨店满减、店铺券、新客礼金、品类券、88VIP/达人券的固定顺序作用于剩余价格；这是当前模型规则，不是平台实时官方规则。',
  '百分比券表示优惠扣减比例，例如 20 表示减 20%（八折）；不是实付比例。',
  '未包含退款损耗、广告、达人佣金、资金及企业管理费用，利润仅是本模型口径，不能称完整经营安全线。',
  '缺失优惠不等于没有优惠。只有用户明确某项优惠金额为 0 时，才按无该优惠处理；费用与出资缺失不补默认值。',
  '反推按 0.01 元或 0.01 个百分点的输入步长分段查找，并代回原计算核对；保本标价搜索范围为 0.01 至 1000 万元，缺完整规则时不反推。',
  '改变标价或店铺券时，其他规则（含 basketAmount 与分摊比例）保持输入值；如订单总额也应随价格变化，需要用户先校准任务口径。',
]

const groups = {
  fullReduction: { threshold: 'fullReductionThreshold', amount: 'fullReductionAmount', basketAmount: 'basketAmount', itemAllocationRate: 'itemAllocationRate', allocationRate: 'itemAllocationRate' },
  shopCoupon: { kind: 'shopCouponKind', threshold: 'shopCouponThreshold', value: 'shopCouponValue' },
  newCustomerGift: { amount: 'newCustomerGift', platformRate: 'newCustomerPlatformRate' },
  categoryCoupon: { kind: 'categoryCouponKind', threshold: 'categoryCouponThreshold', value: 'categoryCouponValue', platformRate: 'categoryPlatformRate' },
  vipCreatorCoupon: { kind: 'vipCreatorCouponKind', threshold: 'vipCreatorCouponThreshold', value: 'vipCreatorCouponValue', platformRate: 'vipCreatorPlatformRate' },
}
const flatKeys = new Set(['listPrice', 'productCost', 'shippingCost', 'platformFeeRate', 'taxRate', ...Object.values(groups).flatMap((group) => Object.values(group))])

export function normalizeSettings(provided) {
  if (provided === null || typeof provided !== 'object' || Array.isArray(provided)) throw new Error('settings 必须是对象。')
  const normalized = {}
  const assign = (key, value) => {
    if (Object.hasOwn(normalized, key) && normalized[key] !== value) throw new Error(`settings.${key} 的平铺或分组输入冲突。`)
    normalized[key] = value
  }
  for (const [key, value] of Object.entries(provided)) {
    const group = Object.hasOwn(groups, key) ? groups[key] : undefined
    if (group && !(key === 'newCustomerGift' && typeof value === 'number')) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`settings.${key} 必须是对象。`)
      for (const [field, amount] of Object.entries(value)) {
        if (!Object.hasOwn(group, field)) throw new Error(`settings.${key}.${field} 不是支持的输入字段。`)
        assign(group[field], amount)
      }
    } else {
      if (!flatKeys.has(key)) throw new Error(`settings.${key} 不是支持的输入字段。`)
      assign(key, value)
    }
  }
  return normalized
}
