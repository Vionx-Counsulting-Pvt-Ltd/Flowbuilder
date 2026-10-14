import { useQueryClient } from "@tanstack/react-query";
import { getListUsersQueryKey, useResendUserInvitation } from "@workspace/api-client-react";

export default function ResendInvitationButton({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const resend = useResendUserInvitation();
  return <div className="mt-2">
    <button type="button" className="button button-outline inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      data-testid={`resend-invitation-${userId}`} disabled={resend.isPending}
      onClick={() => { resend.reset(); resend.mutate({ userId }, {
        onSuccess: () => { void qc.invalidateQueries({ queryKey: getListUsersQueryKey() }); },
      }); }}>
      {resend.isPending ? "Sending…" : "Resend invitation"}
    </button>
    {resend.isSuccess && <p className="mt-1 text-xs text-primary" role="status">A fresh invitation has been emailed.</p>}
    {resend.isError && <p className="form-error mt-1" role="alert">{resend.error.message || "The invitation could not be resent. Try again."}</p>}
  </div>;
}
