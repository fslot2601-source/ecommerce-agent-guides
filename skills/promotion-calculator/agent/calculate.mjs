import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { calculatePromotion, formatMoney, formatPercent } from '../src/engine.ts'
import { ASSUMPTIONS, normalizeSettings } from './availability.mjs'

const DEFAULT_PRODUCT_NAME = '待命名促销商品'
const ALLOWED_ROOT_KEYS = new Set(['productName', 'settings'])

function fail(message) {
  throw new Error(message)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function assertNumber(value, location, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${location} 必须是有限数字。`)
  if (exclusiveMin ? value <= min : value < min) fail(`${location} 必须${exclusiveMin ? '大于' : '不小于'} ${min}。`)
  if (value > max) fail(`${location} 必须不大于 ${max}。`)
}

function assertOneOf(value, location, values) {
  if (!values.includes(value)) fail(`${location} 必须是 ${values.join('、')} 之一。`)
}

function validateNormalizedSettings(settings) {
  if (settings.listPrice !== undefined) {
    assertNumber(settings.listPrice, 'settings.listPrice', { min: 0, exclusiveMin: true })
  }
  if (settings.productCost !== undefined) {
    assertNumber(settings.productCost, 'settings.productCost', { min: 0 })
  }
  if (settings.shippingCost !== undefined) {
    assertNumber(settings.shippingCost, 'settings.shippingCost', { min: 0 })
  }
  if (settings.platformFeeRate !== undefined) {
    assertNumber(settings.platformFeeRate, 'settings.platformFeeRate', { min: 0, max: 100 })
  }
  if (settings.taxRate !== undefined) {
    assertNumber(settings.taxRate, 'settings.taxRate', { min: 0, max: 100 })
  }
  if (settings.fullReductionThreshold !== undefined) {
    assertNumber(settings.fullReductionThreshold, 'settings.fullReductionThreshold', { min: 0 })
  }
  if (settings.fullReductionAmount !== undefined) {
    assertNumber(settings.fullReductionAmount, 'settings.fullReductionAmount', { min: 0 })
  }
  if (settings.basketAmount !== undefined) {
    assertNumber(settings.basketAmount, 'settings.basketAmount', { min: 0 })
  }
  if (settings.itemAllocationRate !== undefined) {
    assertNumber(settings.itemAllocationRate, 'settings.itemAllocationRate', { min: 0, max: 100 })
  }
  if (settings.shopCouponKind !== undefined) {
    assertOneOf(settings.shopCouponKind, 'settings.shopCouponKind', ['fixed', 'rate'])
  }
  if (settings.shopCouponThreshold !== undefined) {
    assertNumber(settings.shopCouponThreshold, 'settings.shopCouponThreshold', { min: 0 })
  }
  if (settings.shopCouponValue !== undefined) {
    const isRate = settings.shopCouponKind === 'rate'
    assertNumber(settings.shopCouponValue, 'settings.shopCouponValue', { min: 0, max: isRate ? 100 : Infinity })
  }
  if (settings.newCustomerGift !== undefined) {
    assertNumber(settings.newCustomerGift, 'settings.newCustomerGift', { min: 0 })
  }
  if (settings.newCustomerPlatformRate !== undefined) {
    assertNumber(settings.newCustomerPlatformRate, 'settings.newCustomerPlatformRate', { min: 0, max: 100 })
  }
  if (settings.categoryCouponKind !== undefined) {
    assertOneOf(settings.categoryCouponKind, 'settings.categoryCouponKind', ['fixed', 'rate'])
  }
  if (settings.categoryCouponThreshold !== undefined) {
    assertNumber(settings.categoryCouponThreshold, 'settings.categoryCouponThreshold', { min: 0 })
  }
  if (settings.categoryCouponValue !== undefined) {
    const isRate = settings.categoryCouponKind === 'rate'
    assertNumber(settings.categoryCouponValue, 'settings.categoryCouponValue', { min: 0, max: isRate ? 100 : Infinity })
  }
  if (settings.categoryPlatformRate !== undefined) {
    assertNumber(settings.categoryPlatformRate, 'settings.categoryPlatformRate', { min: 0, max: 100 })
  }
  if (settings.vipCreatorCouponKind !== undefined) {
    assertOneOf(settings.vipCreatorCouponKind, 'settings.vipCreatorCouponKind', ['fixed', 'rate'])
  }
  if (settings.vipCreatorCouponThreshold !== undefined) {
    assertNumber(settings.vipCreatorCouponThreshold, 'settings.vipCreatorCouponThreshold', { min: 0 })
  }
  if (settings.vipCreatorCouponValue !== undefined) {
    const isRate = settings.vipCreatorCouponKind === 'rate'
    assertNumber(settings.vipCreatorCouponValue, 'settings.vipCreatorCouponValue', { min: 0, max: isRate ? 100 : Infinity })
  }
  if (settings.vipCreatorPlatformRate !== undefined) {
    assertNumber(settings.vipCreatorPlatformRate, 'settings.vipCreatorPlatformRate', { min: 0, max: 100 })
  }
}

function parseInput(raw) {
  if (!isPlainObject(raw)) fail('输入 JSON 顶层必须是对象。')
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_ROOT_KEYS.has(key)) fail(`${key} 不是支持的输入字段。`)
  }

  let productName = DEFAULT_PRODUCT_NAME
  if (raw.productName !== undefined) {
    if (typeof raw.productName !== 'string' || raw.productName.trim() === '') fail('productName 必须是非空字符串。')
    productName = raw.productName.trim()
  }

  const provided = raw.settings === undefined ? {} : raw.settings
  if (!isPlainObject(provided)) fail('settings 必须是对象。')
  const settings = normalizeSettings(provided)
  validateNormalizedSettings(settings)

  return { productName, settings }
}

function fmtVal(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `¥${value.toFixed(2)}` : '—'
}

function fmtPct(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}%` : '—'
}

function generateReport(output) {
  const { productName, status, settings, calculation, targets, missingByMetric, assumptions } = output
  const lines = []

  lines.push('# 大促防破价测算报告')
  lines.push('')
  lines.push(`**商品名称**：${productName.replace(/[\r\n]+/g, ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}`)
  lines.push(`**测算状态**：${status === 'complete' ? '完整测算' : '部分测算（仅交付有数据支持的指标）'}`)
  lines.push('')

  // 1. 结论
  lines.push('## 1. 测算结论')
  lines.push('')
  if (calculation.consumerPrice !== null && calculation.netProfit !== null) {
    const profitStatus = calculation.netProfit < 0 ? '当前配置在本模型口径下亏损' : '当前配置在本模型口径下不亏损，未计入退款和投流等费用'
    lines.push(`> **${profitStatus}**。消费者最终到手价 **${fmtVal(calculation.consumerPrice)}**，商家实际到账 **${fmtVal(calculation.merchantReceipt)}**，折后净利润 **${fmtVal(calculation.netProfit)}**（净利率 **${fmtPct(calculation.margin)}**）。`)
    if (targets.breakEvenListPrice !== null) {
      lines.push(`> 按 0.01 元步长，当前规则内的保本最低标价为 **${fmtVal(targets.breakEvenListPrice)}**；店铺券反推结果及适用条件见下表。`)
    }
  } else if (calculation.consumerPrice !== null) {
    lines.push(`> **当前数据支持计算到手价${calculation.merchantReceipt === null ? '，但出资信息不足以确定到账' : '与实际到账'}，尚不能计算净利润**。消费者到手价为 **${fmtVal(calculation.consumerPrice)}**${calculation.merchantReceipt === null ? '。' : `，商家实际到账为 **${fmtVal(calculation.merchantReceipt)}**。`}`)
    lines.push('> 货品成本、履约运费、平台扣点或税率缺失，或出资信息尚不完整；对应结果不使用默认值补齐。')
  } else {
    lines.push('> **当前输入不足以确定最终到手价**。已有标价、成本或部分优惠仍可列示；请确认缺失的优惠内容、类型和门槛，未提供不等于没有优惠。')
  }
  lines.push('')

  // 2. 核心经营与促销指标
  lines.push('## 2. 核心经营与促销指标')
  lines.push('')
  lines.push('| 指标 | 数值 | 说明 |')
  lines.push('| --- | ---: | --- |')
  lines.push(`| 商品标价 | ${fmtVal(settings.listPrice)} | 页面挂牌销售价格 |`)
  lines.push(`| 消费者到手价 | ${fmtVal(calculation.consumerPrice)} | 扣除所有适用优惠后消费者实付 |`)
  lines.push(`| 优惠总减免 | ${fmtVal(calculation.totalDiscount)} | 各层优惠累计减免金额 |`)
  lines.push(`| 商家让利总额 | ${fmtVal(calculation.merchantDiscount)} | 由商家自行承担的促销优惠合计 |`)
  lines.push(`| 平台/外部补贴 | ${fmtVal(calculation.platformContribution)} | 平台或外部出资补贴合计（计入商家到账） |`)
  lines.push(`| 商家实际到账 | ${fmtVal(calculation.merchantReceipt)} | 到手价 + 平台补贴 |`)
  if (calculation.productCost !== null) lines.push(`| 货品成本 | ${fmtVal(calculation.productCost)} | 单件货品采购或直接生产成本 |`)
  if (calculation.shippingCost !== null) lines.push(`| 履约运费 | ${fmtVal(calculation.shippingCost)} | 单件仓储物流包装发货费用 |`)
  if (calculation.fee !== null) lines.push(`| 平台扣点 | ${fmtVal(calculation.fee)} | 平台扣点费率 ${settings.platformFeeRate}%，按商家到账计提 |`)
  if (calculation.tax !== null) lines.push(`| 模型税费 | ${fmtVal(calculation.tax)} | 综合税费比例 ${settings.taxRate}%，按商家到账计提 |`)
  if (calculation.netProfit !== null) lines.push(`| 折后净利润 | ${fmtVal(calculation.netProfit)} | 商家到账 − 成本 − 运费 − 扣点 − 税费 |`)
  if (calculation.margin !== null) lines.push(`| 销售净利率 | ${fmtPct(calculation.margin)} | 折后净利润 ÷ 商家实际到账 |`)
  lines.push('')

  // 3. 各层优惠出资拆分明细
  lines.push('## 3. 各层优惠出资拆分明细')
  lines.push('')
  lines.push('| 优惠层级 | 规则与门槛说明 | 优惠减免 | 商家承担 | 平台补贴 |')
  lines.push('| --- | --- | ---: | ---: | ---: |')
  for (const layer of calculation.layers) {
    const disc = layer.discount === null ? '参数缺失' : `-${fmtVal(layer.discount)}`
    const merch = layer.merchant === null ? '出资缺失' : fmtVal(layer.merchant)
    const plat = layer.platform === null ? '出资缺失' : fmtVal(layer.platform)
    lines.push(`| ${layer.name} | ${layer.note} | ${disc} | ${merch} | ${plat} |`)
  }
  lines.push(`| **合计** | — | **-${fmtVal(calculation.totalDiscount)}** | **${fmtVal(calculation.merchantDiscount)}** | **${fmtVal(calculation.platformContribution)}** |`)
  lines.push('')
  if (calculation.consumerPrice !== null && calculation.platformContribution !== null) {
    lines.push(`> 实际到账核对公式：到手价 **${fmtVal(calculation.consumerPrice)}** + 平台补贴 **${fmtVal(calculation.platformContribution)}** = 商家实际到账 **${fmtVal(calculation.merchantReceipt)}**。`)
    lines.push('')
  }

  // 4. 安全底线反推
  lines.push('## 4. 当前模型内反推（0.01 元 / 0.01 个百分点步长）')
  lines.push('')
  if (targets.breakEvenListPrice !== null || targets.maxShopCoupon !== null) {
    lines.push('| 反推指标 | 数值 | 业务含义 |')
    lines.push('| --- | ---: | --- |')
    lines.push(`| 保本最低标价 | ${fmtVal(targets.breakEvenListPrice)} | 在 0.01 至 1000 万元范围，按分段曲线查找净利润 ≥ 0 的最小分位标价；其他输入保持不变 |`)
    const maxCouponStr = settings.shopCouponKind === 'rate' ? fmtPct(targets.maxShopCoupon) : fmtVal(targets.maxShopCoupon)
    lines.push(`| 最大可发店铺券额 | ${calculation.shopCouponEligible ? maxCouponStr : '未满足门槛'} | 在当前标价与其他优惠不变时，保持净利润 ≥ 0 的店铺券上限 |`)
  } else {
    lines.push('> 暂无可用反推结果；可能是缺少完整规则、不满足店铺券门槛，或搜索范围内没有不亏损解。具体状态见下方说明与缺失项。')
  }
  lines.push('')

  for (const [key, label] of [['breakEvenListPrice', '保本标价'], ['maxShopCoupon', '店铺券上限']]) {
    if (targets[key] === null) lines.push(`- ${label}：${missingByMetric[key]?.length ? '缺少输入，见缺失清单。' : key === 'maxShopCoupon' && !calculation.shopCouponEligible ? '当前不满足店铺券门槛。' : '完整输入下无可用解，不应当成 0 元或 0% 的安全上限。'}`)
  }

  // 5. 缺失项与影响
  const missingEntries = Object.entries(missingByMetric).filter(([, keys]) => keys.length > 0)
  if (missingEntries.length > 0) {
    lines.push('## 5. 缺失数据与影响说明')
    lines.push('')
    for (const [metric, keys] of missingEntries) {
      lines.push(`- **${metric}**：缺少字段 \`${keys.join('`, `')}\`，对应指标保持未计算，未填充默认常识值。`)
    }
    lines.push('')
  }

  // 6. 模型假设与边界
  lines.push('## 6. 模型假设、口径与操作边界')
  lines.push('')
  for (const [index, item] of assumptions.entries()) {
    lines.push(`${index + 1}. ${item}`)
  }
  lines.push('')
  lines.push('## 本次输入')
  lines.push('```json', JSON.stringify(settings, null, 2), '```')

  return lines.join('\n')
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 18)) fail('需要 Node.js 22.18 或更高版本。')
  const [inputPath, outputDir, ...extra] = process.argv.slice(2)
  if (!inputPath || extra.length > 0) {
    fail('用法：node apps/promotion-calculator/agent/calculate.mjs <input.json> [output-directory]')
  }

  const rawText = await readFile(path.resolve(inputPath), 'utf8')
  let rawJson
  try {
    rawJson = JSON.parse(rawText)
  } catch (err) {
    fail(`输入文件不是合法 JSON：${err.message}`)
  }

  const { productName, settings } = parseInput(rawJson)
  const calcResult = calculatePromotion(settings, { includeInverses: true })

  const output = {
    productName,
    status: calcResult.status,
    settings,
    calculation: {
      consumerPrice: calcResult.consumerPrice,
      merchantReceipt: calcResult.merchantReceipt,
      totalDiscount: calcResult.totalDiscount,
      merchantDiscount: calcResult.merchantDiscount,
      platformContribution: calcResult.platformContribution,
      externalSubsidy: calcResult.externalSubsidy,
      fee: calcResult.fee,
      tax: calcResult.tax,
      productCost: calcResult.productCost,
      shippingCost: calcResult.shippingCost,
      netProfit: calcResult.netProfit,
      margin: calcResult.margin,
      fullReductionEligible: calcResult.fullReductionEligible,
      shopCouponEligible: calcResult.shopCouponEligible,
      layers: calcResult.layers,
    },
    targets: {
      breakEvenListPrice: calcResult.breakEvenListPrice,
      maxShopCoupon: calcResult.maxShopCoupon,
    },
    missingByMetric: calcResult.missingByMetric,
    assumptions: ASSUMPTIONS,
  }

  if (outputDir) {
    const resolvedOut = path.resolve(outputDir)
    await mkdir(resolvedOut, { recursive: true })
    await writeFile(path.join(resolvedOut, 'result.json'), JSON.stringify(output, null, 2) + '\n', 'utf8')
    const reportText = generateReport(output)
    await writeFile(path.join(resolvedOut, 'report.md'), reportText + '\n', 'utf8')
  }

  console.log(JSON.stringify(output))
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }))
  process.exitCode = 1
})
