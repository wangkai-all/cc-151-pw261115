// 领域模型与类型定义

/** 单据类型：正向销售 / 退货（负向）/ 其他调整（如补差、手工调账，可正可负） */
export type FactType = 'sale' | 'return' | 'adjustment'

/** 一条最细粒度的经营事实：某期间 × 门店 × 品类 × 商品 × 单据类型 */
export interface SalesFact {
  period: string
  store: string
  category: string
  productId: string
  productName: string
  type: FactType
  /** 数量：sale 为正；return 以正数记录、金额取负；adjustment 通常为 0 数量 */
  quantity: number
  /** 金额（元，含税口径）：return 为负，adjustment 可正可负 */
  amount: number
}

/** 商品在某一期间的聚合口径（仅正向销售参与三因素拆解） */
export interface ProductPeriodAgg {
  productId: string
  productName: string
  category: string
  stores: string[]
  qty: number
  revenue: number
  /** 成交均价 = 正向销售额 / 销量；无销量时为 null */
  price: number | null
}

export type ProductKind = 'common' | 'new' | 'exited'

/** 单个因素（总销量 / 销量占比 / 成交单价）的拆解结果 */
export interface FactorEffect {
  /** volume = 总销量, mix = 销量占比, price = 成交单价 */
  factor: 'volume' | 'mix' | 'price'
  label: string
  /** Shapley 平均边际贡献（元） */
  contribution: number
  /** 6 种替换顺序下该因素的边际贡献，用于点击查看公式与验算 */
  orderMarginals: { order: string[]; marginal: number }[]
}

/** 共同商品逐商品明细 */
export interface ProductDetail {
  productId: string
  productName: string
  category: string
  kind: ProductKind
  qty0: number
  qty1: number
  price0: number | null
  price1: number | null
  rev0: number
  rev1: number
  /** 共同商品：逐商品的三因素 Shapley 贡献（加总 = 该商品收入差） */
  effects?: {
    volume: FactorEffect
    mix: FactorEffect
    price: FactorEffect
  }
  /** 退货与调整金额（负为退货净流出），独立列示，不进入三因素 */
  returnAmount0: number
  returnAmount1: number
  adjustmentAmount0: number
  adjustmentAmount1: number
}

export interface ReconcileItem {
  key: string
  label: string
  amount: number
}

export interface AnalysisResult {
  period0: string
  period1: string
  /** 参与计算的门店/品类筛选范围（全选时为 null） */
  storeFilter: string[] | null
  categoryFilter: string[] | null

  // —— 总量口径（当前筛选范围，全部从原始事实重新聚合，不跨分组相加）——
  totalRevenue0: number
  totalRevenue1: number
  totalNetRevenue0: number
  totalNetRevenue1: number
  totalQty0: number
  totalQty1: number
  avgPrice0: number | null
  avgPrice1: number | null

  // —— 共同商品（两期均有正向销售）——
  common: {
    productIds: string[]
    rev0: number
    rev1: number
    qty0: number
    qty1: number
    /** 三因素总量级贡献，加总严格等于 common.rev1 - common.rev0 */
    effects: { volume: FactorEffect; mix: FactorEffect; price: FactorEffect }
  }

  newProducts: ProductPeriodAgg[]
  exitedProducts: ProductPeriodAgg[]
  newRevenue: number
  exitedRevenue: number

  returns: { period0: number; period1: number; delta: number }
  adjustments: { period0: number; period1: number; delta: number }

  productDetails: ProductDetail[]

  /** 恒等式核对项（正向销售口径与净收入口径两套） */
  reconcile: {
    items: ReconcileItem[]
    /** 组件加总（共同三因素 + 新增 + 退出） */
    sumComponents: number
    /** 共同商品实际收入差 */
    commonActualDelta: number
    /** 残差，正常应在 1e-6 量级以内（浮点误差） */
    residual: number
    netResidual: number
  }
}

export interface AnalysisFilter {
  stores: string[] | null
  categories: string[] | null
}
