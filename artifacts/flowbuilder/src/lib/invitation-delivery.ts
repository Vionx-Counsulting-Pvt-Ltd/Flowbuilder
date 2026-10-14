// Only retry transport failures, never rejected authentication or delivery.
// The caller must reuse the same server-side idempotency key on every retry.
export function shouldRetryInvitation(failureCount: number, error: unknown): boolean {
  return error instanceof TypeError && failureCount < 2;
}

export function invitationDeliveryError(error: unknown): string {
  if (error instanceof TypeError) {
    return "Connection interrupted. Check your connection, then retry. Retrying this attempt will not send a duplicate email.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "The invitation could not be resent. Try again.";
}
