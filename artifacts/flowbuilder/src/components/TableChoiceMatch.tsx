import type { WorkflowField } from "@workspace/api-client-react";

export default function TableChoiceMatch({ field, value, onChange, testId }: {
  field?: WorkflowField;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  if (!field?.sourceTableId) return <input className="input-control" value={value} onChange={event => onChange(event.target.value)} placeholder="Match value" data-testid={testId} />;
  return <select className="input-control" value={value} onChange={event => onChange(event.target.value)} data-testid={testId}>
    <option value="">Choose a table value</option>
    {value && !field.options?.includes(value) && <option value={value}>Unavailable selection — choose another</option>}
    {(field.options || []).map(option => <option key={option} value={option}>{field.optionLabels?.[option] ?? option}</option>)}
  </select>;
}
