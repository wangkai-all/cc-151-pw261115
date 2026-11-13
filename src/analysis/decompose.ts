// 收入变动三因素拆解引擎
// 模型（对两期均有正向销售的共同商品 i，期 t ∈ {0,1}）：
//   收入 R_t = Q_t × Σ_i w_it × p_it
//   Q_t = Σ_i q_it  总销量
//   w_it = q_it / Q_t  销量占比（结构）
//   p_it = 收入 / 销量  成交单价
// 三个因素：V=总销量 Q、M=结构向量 w、P=价格向量 p
// 对 3! = 6 种全部替换顺序，计算每个因素的边际贡献并取算术平均（Shapley 值），
// 从而消除人为选择计算顺序的影响；三因素加总严格等于共同商品实际收入差。

import type {
  AnalysisFilter,
  AnalysisResult,
  FactorEffect,
  ProductDetail,
  ProductPeriodAgg,
  SalesFact,
} from './types'

export type FactorKey = 'volume' | 'mix' | 'price'

const FACTOR_LABELS: Record<FactorKey, string> = {
  volume: '总销量',
  mix: '商品结构',
  price: '单品价格',
}

/** 三个因素的全部 6 种排列（全替换顺序） */
export const ALL_ORDERS: FactorKey[][] = permutations(['volume', 'mix', 'price'])

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()]
  const out: T[][] = []
  for (let i = 0; i < items.length; i++) {
    const head = items[i]
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const tail of permutations(rest)) out.push([head, ...tail])
  }
  return out
}

export interface DecompInput {
  /** 共同商品两期销量 */
  q0: number[]
  q1: number[]
  /** 共同商品两期成交均价（共同商品两期均有销量，不会为 null） */
  p0: number[]
  p1: number[]
}

/**
 * 给定一组因素的基期/当期取值，计算该组合下的收入。
 * state 中每个因素取 0（基期）或 1（当期）。
 */
function revenue(
  state: Record<FactorKey, 0 | 1>,
  q0: number[],
  q1: number[],
  p0: number[],
  p1: number[],
): number {
  const useQ1 = state.volume === 1
  const useW1 = state.mix === 1
  const useP1 = state.price === 1
  const qBase = useQ1 ? q1 : q0
  const p = useP1 ? p1 : p0
  const Q = qBase.reduce((a, b) => a + b, 0)
  if (Q === 0) return 0
  let rev = 0
  for (let i = 0; i < qBase.length; i++) {
    // 结构 w：用所选期的销量占比，套在所选期的总销量与价格上
    const w = useW1 ? q1[i] / q1.reduce((a, b) => a + b, 0) : q0[i] / q0.reduce((a, b) => a + b, 0)
    rev += Q * w * p[i]
  }
  return rev
}

export interface DecompOutput {
  effects: Record<FactorKey, FactorEffect>
  /** 三因素加总 */
  sum: number
  /** 共同商品实际收入差 R1 - R0 */
  actualDelta: number
  residual: number
}

/**
 * 三因素全排列平均边际贡献拆解（Shapley 分解）。
 * 既可用于总量级（传入全部共同商品），也可用于逐商品（单商品时结构恒为 1，
 * 结构贡献为 0，退化为销量/价格两因素，恒等式依然成立）。
 */
export function decompose(input: DecompInput): DecompOutput {
  const { q0, q1, p0, p1 } = input
  const n = q0.length
  if (q1.length !== n || p0.length !== n || p1.length !== n) {
    throw new Error('拆解输入数组长度不一致')
  }

  const baseState: Record<FactorKey, 0 | 1> = { volume: 0, mix: 0, price: 0 }
  const marginals: Record<FactorKey, number[]> = { volume: [], mix: [], price: [] }
  const orderRecords: Record<FactorKey, { order: string[]; marginal: number }[]> = {
    volume: [],
    mix: [],
    price: [],
  }

  for (const order of ALL_ORDERS) {
    const state: Record<FactorKey, 0 | 1> = { ...baseState }
    let prev = revenue(state, q0, q1, p0, p1)
    for (const factor of order) {
      const nextState: Record<FactorKey, 0 | 1> = { ...state, [factor]: 1 }
      const next = revenue(nextState, q0, q1, p0, p1)
      const marginal = next - prev
      marginals[factor].push(marginal)
      orderRecords[factor].push({
        order: order.map((f) => FACTOR_LABELS[f]),
        marginal,
      })
      state[factor] = 1
      prev = next
    }
  }

  const effects = {} as Record<FactorKey, FactorEffect>
  let sum = 0
  ;(Object.keys(FACTOR_LABELS) as FactorKey[]).forEach((factor) => {
    const contribution = marginals[factor].reduce((a, b) => a + b, 0) / ALL_ORDERS.length
    sum += contribution
    effects[factor] = {
      factor,
      label: FACTOR_LABELS[factor],
      contribution,
      orderMarginals: orderRecords[factor],
    }
  })

  const r0 = revenue(baseState, q0, q1, p0, p1)
  const r1 = revenue({ volume: 1, mix: 1, price: 1 }, q0, q1, p0, p1)
  const actualDelta = r1 - r0
  return { effects, sum, actualDelta, residual: sum - actualDelta }
}

// ————————————————————————————————————————————————
// 数据聚合与分析主流程
// ————————————————————————————————————————————————

function aggregate(
  facts: SalesFact[],
  period: string,
): Map<string, ProductPeriodAgg> {
  const map = new Map<
    string,
    {
      productId: string
      productName: string
      category: string
      stores: Set<string>
      qty: number
      revenue: number
    }
  >()
  for (const f of facts) {
    if (f.period !== period || f.type !== 'sale') continue
    const cur =
      map.get(f.productId) ??
      {
        productId: f.productId,
        productName: f.productName,
        category: f.category,
        stores: new Set<string>(),
        qty: 0,
        revenue: 0,
      }
    cur.qty += f.quantity
    cur.revenue += f.amount
    cur.stores.add(f.store)
    map.set(f.productId, cur)
  }
  const out = new Map<string, ProductPeriodAgg>()
  for (const [id, v] of map) {
    out.set(id, {
      productId: id,
      productName: v.productName,
      category: v.category,
      stores: [...v.stores].sort(),
      qty: v.qty,
      revenue: v.revenue,
      price: v.qty > 0 ? v.revenue / v.qty : null,
    })
  }
  return out
}

function sumType(facts: SalesFact[], period: string, type: SalesFact['type']): number {
  return facts
    .filter((f) => f.period === period && f.type === type)
    .reduce((a, f) => a + f.amount, 0)
}

/**
 * 主入口：对给定事实数据（已按门店/品类筛选）执行两期拆解。
 * 注意：筛选后必须从原始事实重新聚合，禁止把不兼容分组的贡献直接相加。
 */
export function analyze(
  facts: SalesFact[],
  period0: string,
  period1: string,
  filter: AnalysisFilter,
): AnalysisResult {
  const scoped = facts.filter(
    (f) =>
      (filter.stores === null || filter.stores.includes(f.store)) &&
      (filter.categories === null || filter.categories.includes(f.category)),
  )

  const agg0 = aggregate(scoped, period0)
  const agg1 = aggregate(scoped, period1)

  const ids0 = new Set(agg0.keys())
  const ids1 = new Set(agg1.keys())
  const commonIds = [...ids0].filter((id) => ids1.has(id)).sort()
  const newIds = [...ids1].filter((id) => !ids0.has(id)).sort()
  const exitedIds = [...ids0].filter((id) => !ids1.has(id)).sort()

  // 总量级（全部正向销售，含新增/退出）
  const totalRevenue0 = [...agg0.values()].reduce((a, v) => a + v.revenue, 0)
  const totalRevenue1 = [...agg1.values()].reduce((a, v) => a + v.revenue, 0)
  const totalQty0 = [...agg0.values()].reduce((a, v) => a + v.qty, 0)
  const totalQty1 = [...agg1.values()].reduce((a, v) => a + v.qty, 0)

  // 共同商品
  const q0 = commonIds.map((id) => agg0.get(id)!.qty)
  const q1 = commonIds.map((id) => agg1.get(id)!.qty)
  const p0 = commonIds.map((id) => agg0.get(id)!.price!)
  const p1 = commonIds.map((id) => agg1.get(id)!.price!)
  const commonRev0 = commonIds.reduce((a, id) => a + agg0.get(id)!.revenue, 0)
  const commonRev1 = commonIds.reduce((a, id) => a + agg1.get(id)!.revenue, 0)
  const commonQty0 = q0.reduce((a, b) => a + b, 0)
  const commonQty1 = q1.reduce((a, b) => a + b, 0)

  const decomp = decompose({ q0, q1, p0, p1 })

  // 新增 / 退出：单独列示，不补零混入同品涨价
  const newProducts = newIds.map((id) => agg1.get(id)!)
  const exitedProducts = exitedIds.map((id) => agg0.get(id)!)
  const newRevenue = newProducts.reduce((a, v) => a + v.revenue, 0)
  const exitedRevenue = exitedProducts.reduce((a, v) => a + v.revenue, 0)

  // 退货与其他调整独立核对
  const return0 = sumType(scoped, period0, 'return')
  const return1 = sumType(scoped, period1, 'return')
  const adj0 = sumType(scoped, period0, 'adjustment')
  const adj1 = sumType(scoped, period1, 'adjustment')

  // 逐商品明细
  const productDetails: ProductDetail[] = commonIds.map((id) => {
    const a0 = agg0.get(id)!
    const a1 = agg1.get(id)!
    // 单商品拆解：其结构占比 w≡1，结构贡献为 0，销量/价格贡献之和 = 单品收入差
    const single = decompose({
      q0: [a0.qty],
      q1: [a1.qty],
      p0: [a0.price!],
      p1: [a1.price!],
    })
    return {
      productId: id,
      productName: a1.productName,
      category: a1.category,
      kind: 'common',
      qty0: a0.qty,
      qty1: a1.qty,
      price0: a0.price,
      price1: a1.price,
      rev0: a0.revenue,
      rev1: a1.revenue,
      effects: single.effects,
      returnAmount0: sumByProduct(scoped, period0, id, 'return'),
      returnAmount1: sumByProduct(scoped, period1, id, 'return'),
      adjustmentAmount0: sumByProduct(scoped, period0, id, 'adjustment'),
      adjustmentAmount1: sumByProduct(scoped, period1, id, 'adjustment'),
    }
  })
  for (const id of newIds) {
    const a1 = agg1.get(id)!
    productDetails.push({
      productId: id,
      productName: a1.productName,
      category: a1.category,
      kind: 'new',
      qty0: 0,
      qty1: a1.qty,
      price0: null,
      price1: a1.price,
      rev0: 0,
      rev1: a1.revenue,
      returnAmount0: 0,
      returnAmount1: sumByProduct(scoped, period1, id, 'return'),
      adjustmentAmount0: 0,
      adjustmentAmount1: sumByProduct(scoped, period1, id, 'adjustment'),
    })
  }
  for (const id of exitedIds) {
    const a0 = agg0.get(id)!
    productDetails.push({
      productId: id,
      productName: a0.productName,
      category: a0.category,
      kind: 'exited',
      qty0: a0.qty,
      qty1: 0,
      price0: a0.price,
      price1: null,
      rev0: a0.revenue,
      rev1: 0,
      returnAmount0: sumByProduct(scoped, period0, id, 'return'),
      returnAmount1: 0,
      adjustmentAmount0: sumByProduct(scoped, period0, id, 'adjustment'),
      adjustmentAmount1: 0,
    })
  }

  const commonActualDelta = commonRev1 - commonRev0
  const sumComponents =
    decomp.effects.volume.contribution +
    decomp.effects.mix.contribution +
    decomp.effects.price.contribution +
    newRevenue -
    exitedRevenue
  const grossDelta = totalRevenue1 - totalRevenue0
  const residual = sumComponents - grossDelta

  const totalNetRevenue0 = totalRevenue0 + return0 + adj0
  const totalNetRevenue1 = totalRevenue1 + return1 + adj1
  const netDelta = totalNetRevenue1 - totalNetRevenue0
  const netResidual =
    sumComponents + (return1 - return0) + (adj1 - adj0) - netDelta

  return {
    period0,
    period1,
    storeFilter: filter.stores,
    categoryFilter: filter.categories,
    totalRevenue0,
    totalRevenue1,
    totalNetRevenue0,
    totalNetRevenue1,
    totalQty0,
    totalQty1,
    avgPrice0: totalQty0 > 0 ? totalRevenue0 / totalQty0 : null,
    avgPrice1: totalQty1 > 0 ? totalRevenue1 / totalQty1 : null,
    common: {
      productIds: commonIds,
      rev0: commonRev0,
      rev1: commonRev1,
      qty0: commonQty0,
      qty1: commonQty1,
      effects: decomp.effects,
    },
    newProducts,
    exitedProducts,
    newRevenue,
    exitedRevenue,
    returns: { period0: return0, period1: return1, delta: return1 - return0 },
    adjustments: { period0: adj0, period1: adj1, delta: adj1 - adj0 },
    productDetails,
    reconcile: {
      items: [
        { key: 'volume', label: '总销量效应（共同商品）', amount: decomp.effects.volume.contribution },
        { key: 'mix', label: '商品结构效应（共同商品）', amount: decomp.effects.mix.contribution },
        { key: 'price', label: '单品价格效应（共同商品）', amount: decomp.effects.price.contribution },
        { key: 'new', label: `新增商品收入（${newProducts.length} 个）`, amount: newRevenue },
        { key: 'exited', label: `退出商品收入（${exitedProducts.length} 个）`, amount: -exitedRevenue },
        { key: 'return', label: '退货变动', amount: return1 - return0 },
        { key: 'adjustment', label: '其他调整变动', amount: adj1 - adj0 },
      ],
      sumComponents,
      commonActualDelta,
      residual,
      netResidual,
    },
  }
}

function sumByProduct(
  facts: SalesFact[],
  period: string,
  productId: string,
  type: SalesFact['type'],
): number {
  return facts
    .filter((f) => f.period === period && f.productId === productId && f.type === type)
    .reduce((a, f) => a + f.amount, 0)
}

/** 可选维度清单（供筛选器使用） */
export function listDimensions(facts: SalesFact[]): {
  stores: string[]
  categories: string[]
  periods: string[]
} {
  const stores = new Set<string>()
  const categories = new Set<string>()
  const periods = new Set<string>()
  for (const f of facts) {
    stores.add(f.store)
    categories.add(f.category)
    periods.add(f.period)
  }
  return {
    stores: [...stores].sort(),
    categories: [...categories].sort(),
    periods: [...periods].sort(),
  }
}
