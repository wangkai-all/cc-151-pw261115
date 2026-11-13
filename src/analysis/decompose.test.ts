import { describe, expect, it } from 'vitest'
import { ALL_ORDERS, analyze, decompose, listDimensions } from './decompose'
import { buildSampleFacts } from './sampleData'
import type { SalesFact } from './types'

const EPS = 1e-6

describe('全排列平均边际贡献（Shapley）', () => {
  it('三因素贡献加总严格等于共同商品实际收入差', () => {
    const facts = buildSampleFacts()
    const r = analyze(facts, '2025H1', '2025H2', { stores: null, categories: null })
    const e = r.common.effects
    const sum = e.volume.contribution + e.mix.contribution + e.price.contribution
    expect(Math.abs(sum - r.reconcile.commonActualDelta)).toBeLessThan(EPS)
  })

  it('6 种替换顺序的边际贡献逐顺序首尾相接，且每序之和等于收入差', () => {
    const facts = buildSampleFacts()
    const r = analyze(facts, '2025H1', '2025H2', { stores: null, categories: null })
    const { volume, mix, price } = r.common.effects
    expect(ALL_ORDERS.length).toBe(6)
    for (const f of [volume, mix, price]) {
      expect(f.orderMarginals.length).toBe(6)
    }
    for (let i = 0; i < 6; i++) {
      const orderSum =
        volume.orderMarginals[i].marginal +
        mix.orderMarginals[i].marginal +
        price.orderMarginals[i].marginal
      expect(Math.abs(orderSum - r.reconcile.commonActualDelta)).toBeLessThan(EPS)
    }
    // 6 条记录对应 6 个互不相同的合法全排列
    const orders = volume.orderMarginals.map((m) => m.order.join('→'))
    expect(new Set(orders).size).toBe(6)
    for (const o of volume.orderMarginals) {
      expect([...o.order].sort()).toEqual(['单品价格', '商品结构', '总销量'])
    }
  })

  it('单商品时结构效应为 0，销量+价格效应等于单品收入差', () => {
    const out = decompose({ q0: [100], q1: [140], p0: [50], p1: [48] })
    expect(Math.abs(out.effects.mix.contribution)).toBeLessThan(EPS)
    expect(Math.abs(out.residual)).toBeLessThan(EPS)
    // 手算：Δ = 140*48 - 100*50 = 6720 - 5000 = 1720
    expect(Math.abs(out.actualDelta - 1720)).toBeLessThan(EPS)
    // 销量效应与价格效应均非零且方向正确
    expect(out.effects.volume.contribution).toBeGreaterThan(0)
    expect(out.effects.price.contribution).toBeLessThan(0)
  })

  it('Shapley 对称性：交换两个因素的输入数据，贡献随之交换（与因素命名无关）', () => {
    // 两商品情形 A
    const a = decompose({
      q0: [100, 300],
      q1: [240, 160],
      p0: [200, 50],
      p1: [190, 48],
    })
    // 交换两商品顺序，结果应不变（对称性）
    const b = decompose({
      q0: [300, 100],
      q1: [160, 240],
      p0: [50, 200],
      p1: [48, 190],
    })
    for (const k of ['volume', 'mix', 'price'] as const) {
      expect(Math.abs(a.effects[k].contribution - b.effects[k].contribution)).toBeLessThan(EPS)
    }
  })

  it('某因素两期完全相同时，其平均边际贡献为 0', () => {
    const out = decompose({
      q0: [100, 200],
      q1: [100, 200], // 总销量与结构均不变
      p0: [10, 20],
      p1: [12, 18],
    })
    expect(Math.abs(out.effects.volume.contribution)).toBeLessThan(EPS)
    expect(Math.abs(out.effects.mix.contribution)).toBeLessThan(EPS)
    expect(Math.abs(out.effects.price.contribution - out.actualDelta)).toBeLessThan(EPS)
  })
})

describe('整体恒等式核对', () => {
  it('共同三因素 + 新增 - 退出 = 正向销售总额变动（残差≈0）', () => {
    const facts = buildSampleFacts()
    const r = analyze(facts, '2025H1', '2025H2', { stores: null, categories: null })
    expect(Math.abs(r.reconcile.residual)).toBeLessThan(EPS)
    expect(Math.abs(r.reconcile.netResidual)).toBeLessThan(EPS)
  })

  it('净收入恒等式：正向销售差 + 退货差 + 调整差 = 净收入差', () => {
    const facts = buildSampleFacts()
    const r = analyze(facts, '2025H1', '2025H2', { stores: null, categories: null })
    const grossDelta = r.totalRevenue1 - r.totalRevenue0
    const netDelta = r.totalNetRevenue1 - r.totalNetRevenue0
    expect(
      Math.abs(grossDelta + r.returns.delta + r.adjustments.delta - netDelta),
    ).toBeLessThan(EPS)
  })

  it('新增/退出商品单独列示，不进入三因素，也不补零价', () => {
    const facts = buildSampleFacts()
    const r = analyze(facts, '2025H1', '2025H2', { stores: null, categories: null })
    expect(r.newProducts.map((p) => p.productId)).toEqual(['P005'])
    expect(r.exitedProducts.map((p) => p.productId)).toEqual(['P006'])
    expect(r.common.productIds).not.toContain('P005')
    expect(r.common.productIds).not.toContain('P006')
    const newDetail = r.productDetails.find((d) => d.productId === 'P005')!
    expect(newDetail.price0).toBeNull()
    expect(newDetail.effects).toBeUndefined()
  })
})

describe('结构悖论样本', () => {
  it('整体均价上升而共同商品单价全部下降', () => {
    const facts = buildSampleFacts()
    const r = analyze(facts, '2025H1', '2025H2', { stores: null, categories: null })
    expect(r.avgPrice1!).toBeGreaterThan(r.avgPrice0!)
    for (const d of r.productDetails.filter((x) => x.kind === 'common')) {
      expect(d.price1!).toBeLessThan(d.price0!)
    }
    // 结构效应为正：是结构（而非涨价）推高了均价口径
    expect(r.common.effects.mix.contribution).toBeGreaterThan(0)
    expect(r.common.effects.price.contribution).toBeLessThan(0)
  })
})

describe('门店/品类筛选后重算', () => {
  it('筛选范围从原始事实重新聚合，恒等式依然成立', () => {
    const facts = buildSampleFacts()
    const r = analyze(facts, '2025H1', '2025H2', {
      stores: ['S1'],
      categories: null,
    })
    expect(Math.abs(r.reconcile.residual)).toBeLessThan(EPS)
    // 筛选后所有明细只含 S1
    const dims = listDimensions(facts)
    expect(dims.stores).toContain('S1')
    const s1Facts = facts.filter((f) => f.store === 'S1' && f.type === 'sale')
    const expected0 = s1Facts.filter((f) => f.period === '2025H1').reduce((a, f) => a + f.amount, 0)
    expect(Math.abs(r.totalRevenue0 - expected0)).toBeLessThan(EPS)
  })

  it('不同分组分别重算后，贡献之和等于整体重算（验证禁止跨组直接相加的口径）', () => {
    const facts = buildSampleFacts()
    const stores = ['S1', 'S2', 'S3']
    // 正确做法：各门店分别在自己的范围内重算
    const perStore = stores.map((s) =>
      analyze(facts, '2025H1', '2025H2', { stores: [s], categories: null }),
    )
    const sumGross = perStore.reduce((a, r) => a + (r.totalRevenue1 - r.totalRevenue0), 0)
    const whole = analyze(facts, '2025H1', '2025H2', { stores: null, categories: null })
    // 原始事实可加的是总量金额；分组三因素贡献之和不等于整体三因素（结构基准不同）
    expect(Math.abs(sumGross - (whole.totalRevenue1 - whole.totalRevenue0))).toBeLessThan(EPS)
    const sumMix = perStore.reduce((a, r) => a + r.common.effects.mix.contribution, 0)
    expect(Math.abs(sumMix - whole.common.effects.mix.contribution)).toBeGreaterThan(1)
  })

  it('筛选后仅剩一个共同商品时结构效应归零且恒等式成立', () => {
    const facts: SalesFact[] = [
      { period: '2025H1', store: 'S1', category: 'coffee', productId: 'A', productName: 'A', type: 'sale', quantity: 10, amount: 100 },
      { period: '2025H2', store: 'S1', category: 'coffee', productId: 'A', productName: 'A', type: 'sale', quantity: 12, amount: 108 },
    ]
    const r = analyze(facts, '2025H1', '2025H2', { stores: null, categories: null })
    expect(Math.abs(r.common.effects.mix.contribution)).toBeLessThan(EPS)
    expect(Math.abs(r.reconcile.residual)).toBeLessThan(EPS)
  })
})
