export function unavailableCopy(reason: string | null | undefined): { title: string; description: string } {
  if (reason === 'expired') {
    return {
      title: 'This invite has expired',
      description: 'Ask an admin for a new link. Invites last 7 days.'
    }
  }
  if (reason === 'used') {
    return {
      title: 'This invite has already been used',
      description: 'If you already have an account, sign in. Otherwise ask an admin for a new link.'
    }
  }
  if (reason === 'revoked') {
    return {
      title: 'This invite was revoked',
      description: 'Ask an admin for a new link.'
    }
  }
  return {
    title: 'This invite is not valid',
    description: 'Ask an admin for a new link. If you already have an account, you can sign in.'
  }
}
