import type { WorkflowInput } from '@workspace/api-client-react';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

/** Compare editable configuration, never table rows or hydrated display labels. */
export function workflowSnapshot(definition: WorkflowInput): string {
  return JSON.stringify(stableValue({
    ...definition,
    fields: definition.fields.map(field => {
      const { optionLabels: _labels, referenceData: _data, referenceColumns: _columns, ...configuration } = field;
      return { ...configuration, ...(field.sourceTableId ? { options: [] } : {}) };
    }),
  }));
}
