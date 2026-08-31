export const DIET_TAGS = ['vegetarian', 'vegan', 'pescatarian'] as const
export type DietTag = typeof DIET_TAGS[number]

const DIET_TAG_SET = new Set<string>(DIET_TAGS)

export function isDietTag(tag: string): tag is DietTag {
  return DIET_TAG_SET.has(tag.toLowerCase())
}

export function normalizeDietTags(tags: string[]): DietTag[] {
  const out = new Set<DietTag>()
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    if (isDietTag(lower)) out.add(lower)
  }
  return [...out]
}

export function stripDietTags(tags: string[]): string[] {
  return tags.filter((tag) => !isDietTag(tag))
}

export function applyDietTagSelection(existingTags: string[], selected: DietTag[]): string[] {
  const withoutDiet = stripDietTags(existingTags)
  return [...withoutDiet, ...normalizeDietTags(selected)]
}
