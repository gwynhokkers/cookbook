import type { IngredientRowModel } from '~/components/IngredientRow.vue'
import { COUNT_UNIT } from '~~/shared/utils/formatIngredient'

let rowIdCounter = 0

export const createRowId = (prefix: 'ingredient' | 'step') => `${prefix}-${rowIdCounter++}`

export const createEmptyIngredient = (): IngredientRowModel => ({
  rowId: createRowId('ingredient'),
  lineText: '',
  amount: '',
  unit: COUNT_UNIT,
  ingredientName: '',
  notes: '',
  parseStatus: 'idle'
})

export const createEmptyStep = () => ({
  rowId: createRowId('step'),
  title: '',
  content: ''
})

export type RecipeStepRow = ReturnType<typeof createEmptyStep>
