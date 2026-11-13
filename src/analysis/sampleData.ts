// 演示样本数据
// 设计要点（结构悖论）：共同商品的成交单价全部下降，但高单价商品的销量占比
// 大幅上升，导致整体均价反而上升——用于展示商品结构变化与单品价格变化的区别。

import type { SalesFact } from './types'

export const PERIODS = [
  { id: '2025H1', label: '2025 年上半年（基期）' },
  { id: '2025H2', label: '2025 年下半年（当期）' },
] as const

export const STORES = [
  { id: 'S1', label: '上海旗舰店' },
  { id: 'S2', label: '北京朝阳店' },
  { id: 'S3', label: '广州天河店' },
] as const

export const CATEGORIES = [
  { id: 'coffee', label: '咖啡' },
  { id: 'tea', label: '茶饮' },
  { id: 'bakery', label: '烘焙' },
  { id: 'retail', label: '零售器具' },
] as const

interface ProductSpec {
  productId: string
  productName: string
  category: string
  /** 每期：各门店销量分布与成交单价；缺期即新增/退出商品 */
  periods: Partial<
    Record<
      string,
      { dist: Record<string, number>; price: number }
    >
  >
}

const PRODUCT_SPECS: ProductSpec[] = [
  {
    productId: 'P001',
    productName: '精品咖啡豆（200g）',
    category: 'coffee',
    // 高单价商品：单价 200 → 190（下降 5%），销量 100 → 240
    periods: {
      '2025H1': { dist: { S1: 50, S2: 30, S3: 20 }, price: 200 },
      '2025H2': { dist: { S1: 120, S2: 70, S3: 50 }, price: 190 },
    },
  },
  {
    productId: 'P002',
    productName: '挂耳咖啡包（10 片）',
    category: 'coffee',
    // 低单价商品：单价 50 → 48（下降 4%），销量 300 → 160
    periods: {
      '2025H1': { dist: { S1: 150, S2: 90, S3: 60 }, price: 50 },
      '2025H2': { dist: { S1: 80, S2: 50, S3: 30 }, price: 48 },
    },
  },
  {
    productId: 'P003',
    productName: '抹茶拿铁酱',
    category: 'tea',
    periods: {
      '2025H1': { dist: { S1: 60, S2: 40, S3: 20 }, price: 80 },
      '2025H2': { dist: { S1: 70, S2: 45, S3: 25 }, price: 78 },
    },
  },
  {
    productId: 'P004',
    productName: '黄油曲奇礼盒',
    category: 'bakery',
    periods: {
      '2025H1': { dist: { S1: 40, S2: 30, S3: 20 }, price: 60 },
      '2025H2': { dist: { S1: 35, S2: 25, S3: 20 }, price: 57 },
    },
  },
  {
    productId: 'P007',
    productName: '手冲壶',
    category: 'retail',
    periods: {
      '2025H1': { dist: { S1: 15, S2: 10, S3: 5 }, price: 350 },
      '2025H2': { dist: { S1: 12, S2: 8, S3: 5 }, price: 330 },
    },
  },
  {
    productId: 'P008',
    productName: '巴斯克芝士蛋糕',
    category: 'bakery',
    periods: {
      '2025H1': { dist: { S1: 50, S2: 30, S3: 20 }, price: 45 },
      '2025H2': { dist: { S1: 60, S2: 35, S3: 25 }, price: 43 },
    },
  },
  // 当期新增：只在 2025H2 有销售，不补基期零价，不进入同品价格效应
  {
    productId: 'P005',
    productName: '冷萃咖啡液（新品）',
    category: 'coffee',
    periods: {
      '2025H2': { dist: { S1: 30, S2: 20, S3: 10 }, price: 150 },
    },
  },
  // 当期退出：只在 2025H1 有销售
  {
    productId: 'P006',
    productName: '陈年茶饼（退市）',
    category: 'tea',
    periods: {
      '2025H1': { dist: { S1: 20, S2: 12, S3: 8 }, price: 120 },
    },
  },
]

/** 退货与其他调整（金额口径；退货为负，调整可正可负） */
interface ExtraSpec {
  period: string
  store: string
  productId: string
  type: 'return' | 'adjustment'
  quantity: number
  amount: number
}

const EXTRA_SPECS: ExtraSpec[] = [
  // 退货：当期咖啡豆退回 10 件
  { period: '2025H2', store: 'S1', productId: 'P001', type: 'return', quantity: 10, amount: -1900 },
  { period: '2025H1', store: 'S2', productId: 'P004', type: 'return', quantity: 10, amount: -600 },
  { period: '2025H2', store: 'S3', productId: 'P008', type: 'return', quantity: 5, amount: -215 },
  // 其他调整：当期抹茶酱渠道补差（正）；基期蛋糕临期折让调账（负）
  { period: '2025H2', store: 'S1', productId: 'P003', type: 'adjustment', quantity: 0, amount: 520 },
  { period: '2025H1', store: 'S2', productId: 'P008', type: 'adjustment', quantity: 0, amount: -300 },
]

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

export function buildSampleFacts(): SalesFact[] {
  const nameAndCategory = new Map(
    PRODUCT_SPECS.map((p) => [p.productId, { name: p.productName, category: p.category }]),
  )
  const facts: SalesFact[] = []

  for (const spec of PRODUCT_SPECS) {
    for (const [period, cell] of Object.entries(spec.periods) as [
      string,
      { dist: Record<string, number>; price: number },
    ][]) {
      for (const [store, qty] of Object.entries(cell.dist)) {
        facts.push({
          period,
          store,
          category: spec.category,
          productId: spec.productId,
          productName: spec.productName,
          type: 'sale',
          quantity: qty,
          amount: round2(qty * cell.price),
        })
      }
    }
  }

  for (const e of EXTRA_SPECS) {
    const meta = nameAndCategory.get(e.productId)!
    facts.push({
      period: e.period,
      store: e.store,
      category: PRODUCT_SPECS.find((p) => p.productId === e.productId)!.category,
      productId: e.productId,
      productName: meta.name,
      type: e.type,
      quantity: e.quantity,
      amount: e.amount,
    })
  }

  return facts
}

/** 结构悖论说明（样本内置，便于页面直接引用） */
export const SIMPSON_NOTE = {
  title: '整体均价上升，但每个单品都在降价',
  description:
    '本样本中 6 个共同商品的成交单价全部低于基期，但高单价的精品咖啡豆销量占比由 13.5% 升至 31.4%，' +
    '低单价的挂耳咖啡包占比由 40.5% 降至 20.9%，结构向高价商品倾斜，使共同商品整体均价反而上升。' +
    '均价变化不能直接等同于涨价，三因素拆解把结构效应与价格效应分开计量。',
}
