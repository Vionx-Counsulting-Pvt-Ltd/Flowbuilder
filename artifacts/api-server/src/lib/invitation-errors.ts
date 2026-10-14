export function invitationCreationError(error: unknown): string {
  const errors = error && typeof error === "object" && "errors" in error ? error.errors : null;
  if (Array.isArray(errors) && errors.some(item => item?.code === "form_identifier_exists")) {
    return "This email address already has a FlowBuilder account. A new-account invitation cannot be sent. Use the existing account; access to another workspace must be arranged separately.";
  }
  return "The invitation could not be sent. Please try again, or check whether this email already has an account or pending invitation.";
}
