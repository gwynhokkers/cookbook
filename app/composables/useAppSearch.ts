export function useAppSearch() {
  const open = useState('app-search-open', () => false)
  const term = useState('app-search-term', () => '')

  return { open, term }
}
