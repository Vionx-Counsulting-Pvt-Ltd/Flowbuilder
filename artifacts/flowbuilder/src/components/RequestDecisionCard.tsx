import { Check, CircleHelp, XCircle } from "lucide-react";
import type { RequestDetail } from "@workspace/api-client-react";

export default function RequestDecisionCard({ request, pending, onEdit, onAction }: {
  request: RequestDetail;
  pending: boolean;
  onEdit: () => void;
  onAction: (action: "approve" | "reject" | "request_clarification") => void;
}) {
  const reason = [...request.audit].reverse().find(event =>
    event.action === "Request sent back for correction" || event.action === "Clarification requested")?.comment;
  return <section className="surface decision-card">
    <span className="section-label">{request.canEdit || request.canApprove ? "YOUR TURN" : "REQUEST STATUS"}</span>
    {request.status === "needs_clarification" ? <>
      <h2>Returned for correction.</h2>
      <p>{request.canEdit ? "Correct the form and resubmit it for a new approval round." : "Only the original requester or a workspace admin can edit this request."}</p>
      {reason && <p className="rounded-lg bg-muted p-3 text-sm" data-testid="return-reason">{reason}</p>}
      {request.canEdit && <button className="button button-primary w-full" data-testid="button-edit-returned-request" disabled={pending} onClick={onEdit}>Edit and resubmit <CircleHelp size={16} /></button>}
    </> : request.canApprove ? <>
      <h2>Help this move forward.</h2>
      <p>Review the request, or send it back with a clear correction note.</p>
      <button className="button button-primary w-full" disabled={pending} onClick={() => onAction("approve")}><Check size={16} /> Approve request</button>
      <button className="button button-outline mt-2 w-full" data-testid="button-send-back-request" disabled={pending} onClick={() => onAction("request_clarification")}><CircleHelp size={16} /> Send back for correction</button>
      <button className="button button-danger mt-2 w-full" disabled={pending} onClick={() => onAction("reject")}><XCircle size={16} /> Reject request</button>
    </> : ["approved", "completed", "rejected"].includes(request.status) ? <>
      <h2>{request.status === "rejected" ? "Request rejected." : request.status === "completed" ? "Request completed." : "Request approved."}</h2>
      <p>This request is closed for editing. Its details and activity history remain available.</p>
    </> : <><h2>Waiting on the next owner.</h2><p>The assigned approver can make a decision when it is their turn. Requests are editable only after being sent back.</p></>}
  </section>;
}
