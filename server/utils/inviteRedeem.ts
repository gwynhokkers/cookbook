export async function redeemInviteAccount(input: {
  inviteId: string | null
  claim: (inviteId: string) => Promise<boolean>
  insertUser: () => Promise<void>
  release: (inviteId: string) => Promise<void>
}): Promise<'created' | 'unclaimed'> {
  if (input.inviteId) {
    const claimed = await input.claim(input.inviteId)
    if (!claimed) return 'unclaimed'
  }

  try {
    await input.insertUser()
    return 'created'
  } catch (error) {
    if (input.inviteId) await input.release(input.inviteId)
    throw error
  }
}
