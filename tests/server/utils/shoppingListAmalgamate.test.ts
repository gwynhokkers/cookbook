import { describe, expect, it } from 'vitest'
import { amalgamateContributions } from '../../../server/utils/shoppingListAmalgamate'

describe('amalgamateContributions', () => {
  it('merges convertible volume contributions for the same ingredient', () => {
    const result = amalgamateContributions([
      {
        recipeId: 'r1',
        title: 'Cake',
        amount: '500',
        unit: 'ml',
        notes: null,
        ingredientId: 'flour-1',
        ingredientName: 'flour'
      },
      {
        recipeId: 'r2',
        title: 'Bread',
        amount: '0.5',
        unit: 'l',
        notes: null,
        ingredientId: 'flour-1',
        ingredientName: 'flour'
      }
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      ingredientId: 'flour-1',
      name: 'flour',
      totalAmount: '1000',
      totalUnit: 'ml',
      needsReview: false
    })
    expect(result[0]!.contributions).toHaveLength(2)
  })

  it('merges convertible weight contributions into one shopping-list line', () => {
    const result = amalgamateContributions([
      {
        recipeId: 'r1',
        title: 'Stew',
        amount: '500',
        unit: 'g',
        notes: null,
        ingredientId: 'butter-1',
        ingredientName: 'butter'
      },
      {
        recipeId: 'r2',
        title: 'Sauce',
        amount: '0.5',
        unit: 'kg',
        notes: null,
        ingredientId: 'butter-1',
        ingredientName: 'butter'
      }
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      ingredientId: 'butter-1',
      name: 'butter',
      totalAmount: '1000',
      totalUnit: 'g',
      needsReview: false
    })
  })

  it('keeps different ingredients as separate amalgamated lines', () => {
    const result = amalgamateContributions([
      {
        recipeId: 'r1',
        title: 'Soup',
        amount: '1',
        unit: 'cup',
        notes: null,
        ingredientId: 'stock-1',
        ingredientName: 'stock'
      },
      {
        recipeId: 'r1',
        title: 'Soup',
        amount: '2',
        unit: 'tsp',
        notes: null,
        ingredientId: 'salt-1',
        ingredientName: 'salt'
      }
    ])

    expect(result).toHaveLength(2)
    expect(result.map(row => row.name).sort()).toEqual(['salt', 'stock'])
    expect(result.every(row => row.needsReview === false)).toBe(true)
  })
})
