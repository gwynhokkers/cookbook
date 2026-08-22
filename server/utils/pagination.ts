export function parsePaginationQuery(query: Record<string, unknown>, defaultLimit = 9) {
  const hasPagination = query.page !== undefined || query.limit !== undefined
  if (!hasPagination) {
    return null
  }

  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(Math.max(Number(query.limit) || defaultLimit, 1), 50)
  const offset = (page - 1) * pageSize

  return { page, pageSize, offset }
}

export function buildPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0
  }
}
