import type { ShoppingListDto } from '~~/shared/utils/shoppingListTypes'

export function localDateIso(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function useShoppingList(initialDate?: MaybeRefOrGetter<string | undefined>) {
  const toast = useToast()
  const listDate = ref(toValue(initialDate) || localDateIso())
  const list = ref<ShoppingListDto | null>(null)
  const pending = ref(false)
  const generating = ref(false)
  const error = ref<string | null>(null)

  async function refresh() {
    pending.value = true
    error.value = null
    try {
      list.value = await $fetch<ShoppingListDto>('/api/shopping-lists/today', {
        query: { date: listDate.value }
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load shopping list'
      throw err
    } finally {
      pending.value = false
    }
  }

  async function setDate(date: string) {
    listDate.value = date
    await refresh()
  }

  async function setRecipes(recipeIds: string[]) {
    if (!list.value) {
      await refresh()
    }
    if (!list.value) {
      return
    }
    list.value = await $fetch<ShoppingListDto>(`/api/shopping-lists/${list.value.id}/recipes`, {
      method: 'PUT',
      body: { recipeIds }
    })
  }

  async function addRecipes(recipeIds: string[]) {
    if (!list.value) {
      await refresh()
    }
    if (!list.value) {
      return
    }
    list.value = await $fetch<ShoppingListDto>(`/api/shopping-lists/${list.value.id}/recipes`, {
      method: 'POST',
      body: { recipeIds }
    })
  }

  async function removeRecipe(recipeId: string) {
    if (!list.value) {
      return
    }
    list.value = await $fetch<ShoppingListDto>(
      `/api/shopping-lists/${list.value.id}/recipes/${recipeId}`,
      { method: 'DELETE' }
    )
  }

  async function generate() {
    if (!list.value) {
      await refresh()
    }
    if (!list.value) {
      return
    }
    generating.value = true
    try {
      list.value = await $fetch<ShoppingListDto>(`/api/shopping-lists/${list.value.id}/generate`, {
        method: 'POST'
      })
      if (list.value.warning) {
        toast.add({
          title: 'List ready with fallback',
          description: list.value.warning,
          color: 'warning'
        })
      } else {
        toast.add({
          title: 'Shopping list generated',
          description: 'Aisle groups and package suggestions are ready.',
          color: 'success'
        })
      }
    } finally {
      generating.value = false
    }
  }

  async function toggleChecked(itemId: string, checked: boolean) {
    if (!list.value) {
      return
    }
    const updated = await $fetch(`/api/shopping-lists/${list.value.id}/items/${itemId}`, {
      method: 'PATCH',
      body: { checked }
    })
    list.value = {
      ...list.value,
      items: list.value.items.map(item =>
        item.id === itemId
          ? { ...item, checked: Boolean((updated as { checked?: boolean }).checked) }
          : item
      )
    }
  }

  async function copyText() {
    if (!list.value) {
      return ''
    }
    const result = await $fetch<{ text: string }>(`/api/shopping-lists/${list.value.id}/copy-text`)
    if (import.meta.client && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(result.text)
      toast.add({
        title: 'Copied',
        description: 'Shopping list copied to clipboard.',
        color: 'success'
      })
    }
    return result.text
  }

  watch(
    () => toValue(initialDate),
    (next) => {
      if (next && next !== listDate.value) {
        setDate(next)
      }
    }
  )

  return {
    listDate,
    list,
    pending,
    generating,
    error,
    refresh,
    setDate,
    setRecipes,
    addRecipes,
    removeRecipe,
    generate,
    toggleChecked,
    copyText
  }
}
