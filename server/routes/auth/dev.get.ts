import { assertDevAuthEnabled, parseDevAuthPersona, upsertDevPersona } from '../../utils/devAuth'

export default defineEventHandler(async (event) => {
  assertDevAuthEnabled(event)

  const query = getQuery(event)
  const persona = parseDevAuthPersona(query.persona)
  const user = await upsertDevPersona(persona)

  await setUserSession(event, { user })

  return sendRedirect(event, '/')
})
