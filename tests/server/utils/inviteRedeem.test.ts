import { describe, expect, it, vi } from 'vitest'
import { redeemInviteAccount } from '~~/server/utils/inviteRedeem'

describe('redeemInviteAccount', () => {
  it('inserts an env-admin account without claiming an invite', async () => {
    const claim = vi.fn()
    const insertUser = vi.fn().mockResolvedValue(undefined)
    const release = vi.fn()

    await expect(redeemInviteAccount({
      inviteId: null,
      claim,
      insertUser,
      release
    })).resolves.toBe('created')

    expect(claim).not.toHaveBeenCalled()
    expect(insertUser).toHaveBeenCalledOnce()
    expect(release).not.toHaveBeenCalled()
  })

  it('does not insert when the claim loses the race', async () => {
    const insertUser = vi.fn()
    await expect(redeemInviteAccount({
      inviteId: 'inv-1',
      claim: vi.fn().mockResolvedValue(false),
      insertUser,
      release: vi.fn()
    })).resolves.toBe('unclaimed')
    expect(insertUser).not.toHaveBeenCalled()
  })

  it('releases the claim if the insert throws', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const error = new Error('unique email')
    await expect(redeemInviteAccount({
      inviteId: 'inv-1',
      claim: vi.fn().mockResolvedValue(true),
      insertUser: vi.fn().mockRejectedValue(error),
      release
    })).rejects.toBe(error)
    expect(release).toHaveBeenCalledWith('inv-1')
  })
})
