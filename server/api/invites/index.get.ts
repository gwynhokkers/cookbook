import { manageUsers } from '~~/shared/utils/abilities'
import { listPendingInvites } from '../../utils/invites'

export default defineEventHandler(async (event) => {
  await authorize(event, manageUsers)
  return listPendingInvites()
})
