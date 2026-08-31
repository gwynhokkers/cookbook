import { describe, expect, it } from 'vitest'
import { parseAiRecipeJson, structureFromTranscript } from '../../../../server/extraction/structure'

describe('structureFromTranscript', () => {
  it('builds an extracted draft from transcript parts', () => {
    const draft = structureFromTranscript({
      title: 'mapo tofu',
      description: 'Sichuan classic',
      ingredientsText: '2 tbsp doubanjiang\n400g soft tofu',
      methodText: '1. Fry the doubanjiang.\n2. Add tofu and simmer.',
      servings: 4,
      tags: ['sichuan'],
      source: 'page 10'
    })

    expect(draft.title).toBeTruthy()
    expect(draft.ingredients.length).toBeGreaterThanOrEqual(1)
    expect(draft.steps.length).toBeGreaterThanOrEqual(1)
    expect(draft.servings).toBe(4)
  })
})

describe('parseAiRecipeJson', () => {
  it('unwraps a plain recipe JSON object', () => {
    const recipe = parseAiRecipeJson({
      response: JSON.stringify({
        title: 'Pillow Cake',
        ingredients: [{ amount: '1', unit: 'cup', ingredientName: 'flour' }],
        steps: [{ title: 'Mix', content: 'Mix flour and water.' }]
      })
    })

    expect(recipe.title).toMatch(/Pillow/i)
    expect(recipe.ingredients[0]?.ingredientName).toMatch(/flour/i)
  })

  it('extracts JSON embedded in prose', () => {
    const recipe = parseAiRecipeJson({
      response: 'Here is the recipe:\n{"title":"Soup","ingredients":[{"amount":"1","unit":"l","ingredientName":"stock"}],"steps":[{"title":"Heat","content":"Bring to a boil."}]}\nDone.'
    })

    expect(recipe.title).toMatch(/Soup/i)
    expect(recipe.ingredients.length).toBeGreaterThanOrEqual(1)
  })
})
