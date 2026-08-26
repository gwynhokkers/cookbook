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
})
