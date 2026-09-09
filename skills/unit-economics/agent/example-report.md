# 示例商品：轻便收纳包（非真实客户数据）｜单品价值链测算

## 结论

原模型净利润为 ¥30.38，净利率为 17.98%。

## 可提供的结果

| 指标 | 数值 |
| --- | ---: |
| 售价减商品成本（未扣其他费用，非利润） | ¥107.00 |
| 实付成交价（ASP） | ¥169.00 |
| 商品成本 | ¥62.00 |
| 退款后有效成交额 | ¥148.72 |
| 原模型毛利（GP） | ¥86.72 |
| 履约后贡献（CM1） | ¥60.80 |
| 原模型净利润（CM2 / NP） | ¥30.38 |
| 原模型净利率 | 17.98% |
| 广告费 | ¥30.42 |
| 税费 | ¥8.46 |
| 原模型保本 ROAS | 2.69 |
| 原模型保本售价 | ¥114.15 |
| 原模型保本采购成本 | ¥96.04 |
| 目标净利率下最低售价 | ¥139.31 |
| 目标净利率下最高采购成本 | ¥77.10 |

## 已知费用明细

| 科目 | 单笔金额 | 说明 |
| --- | ---: | --- |
| 商品采购成本 / 出厂价 | ¥62.00 |  |
| 物流履约费用 | ¥8.50 |  |
| 退货逆向损耗准备 | ¥1.52 | 按退货率自动计提 |
| 平台综合扣点 | ¥7.44 |  |
| 广告投流（千川/直通车） | ¥30.42 | 广告费率 18.0% |
| 实纳税费（增值税及附加） | ¥8.46 |  |

## 暂不可提供的结果与缺失数据

当前核心测算及目标反推所需数据已齐全。

## 企业费用调整


- 已确认扣除项合计：¥0.00

企业口径利润：¥30.38；利润率：17.98%。

企业调整不改变原模型保本线或目标反推。

## 采用的数据

仅记录用户本次提供的数据与可无歧义识别的输入模式；详见同目录 result.json 的 settings：

```json
{
  "asp": 169,
  "productCost": {
    "mode": "summary",
    "summary": 62,
    "detailed": {
      "bom": 48,
      "packaging": 4,
      "accessories": 2,
      "gifts": 3,
      "inboundFreight": 5
    }
  },
  "fulfillmentCost": {
    "mode": "summary",
    "summary": 8.5,
    "detailed": {
      "delivery": 5,
      "packing": 2.5,
      "shippingInsurance": 1
    }
  },
  "platformFee": {
    "mode": "summary",
    "summary": 0.05,
    "detailed": {
      "commissionRate": 0.05,
      "paymentRate": 0.006,
      "software": 1
    }
  },
  "tax": {
    "mode": "invoice",
    "taxpayerType": "general13",
    "surtaxRate": 0.12,
    "quickRate": 0.02,
    "productInvoice": true,
    "logisticsInvoice": true,
    "logisticsInvoiceRate": 0.09,
    "adInvoice": true
  },
  "marketing": {
    "mode": "rate",
    "gmvRate": 0.18,
    "paidTrafficShare": 0.7,
    "roas": 4,
    "livestreamCommissionRate": 0
  },
  "adjustments": {
    "returnRate": 0.12,
    "discount": 0
  },
  "targetNetMargin": 0.1
}
```

## 口径与执行边界

- 所有金额均按单件发货订单、含税金额试算。
- settings 仅包含本次提供的数据及可无歧义识别的成本输入模式；缺失金额、比例、税务身份不使用示例值或零补齐。
- 售价减商品成本的差额尚未扣除优惠、退货、履约、税费、平台及营销费用，不是毛利或净利润。
- 原模型将 NP 定义为 CM2；退货逆向物流、质检与残损准备按退货率 ×（商品成本 + 履约成本）× 18%计提。
- companyAdjustments 是用户明确提供的单笔企业口径扣除项。它们只影响 company.netProfit 与 company.netMargin，不纳入原模型的保本 ROAS、保本售价或采购成本上限。
- 仅本地读取和计算，不上传数据，不修改原始输入，不执行投放或交易操作；不保证经营决策无风险。
