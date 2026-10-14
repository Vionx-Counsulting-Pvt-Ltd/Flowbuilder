import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListUsersQueryKey, useResendUserInvitation } from "@workspace/api-client-react";
import { invitationDeliveryError, shouldRetryInvitation } from "../lib/invitation-delivery";

export default function ResendInvitationButton({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const operation = useRef<string | null>(null);
  const resend = useResendUserInvitation({
    request: { credentials: "same-origin" },
    mutation: { retry: shouldRetryInvitation, retryDelay: 800 },
  });
  return <div className="mt-2">
    <button type="button" className="button button-outline inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      data-testid={`resend-invitation-${userId}`} disabled={resend.isPending}
      onClick={() => {
        operation.current ??= crypto.randomUUID();
        resend.reset(); resend.mutate({ userId, data: { idempotencyKey: operation.current } }, {
        onSuccess: () => { operation.current = null; void qc.invalidateQueries({ queryKey: getListUsersQueryKey() }); },
      }); }}>
      {resend.isPaused ? "Waiting for connection…" : resend.isPending ? "Sending…" : "Resend invitation"}
    </button>
    {resend.isSuccess && <p className="mt-1 text-xs text-primary" role="status">A fresh invitation has been emailed.</p>}
    {resend.isError && <p className="form-error mt-1" role="alert">{invitationDeliveryError(resend.error)}</p>}
  </div>;
}
