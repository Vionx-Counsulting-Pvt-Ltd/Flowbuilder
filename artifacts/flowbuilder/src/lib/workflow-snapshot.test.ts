import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkflowInput } from '@workspace/api-client-react';
import { workflowSnapshot } from './workflow-snapshot.ts';

const initial: WorkflowInput = {
  name: 'Test form', category: 'Operations', description: '', routing: 'sequential',
  fields: [{ id: 'f1', label: 'Branch', type: 'select', required: false, sourceTableId: 't1', sourceLabelColumn: 'name', options: [] }],
  stages: [{ id: 's1', name: 'Review', order: 1, assigneeType: 'manager', assigneeLabel: 'Manager', slaHours: 24 }],
};

test('hydrated table choices, labels, rows and columns never mark a form dirty', () => {
  const hydrated = structuredClone(initial);
  Object.assign(hydrated.fields[0], {
    options: ['row1'], optionLabels: { row1: 'London' },
    referenceData: { row1: { region: 'UK' } },
    referenceColumns: [{ key: 'region', label: 'Region' }],
  });
  assert.equal(workflowSnapshot(hydrated), workflowSnapshot(initial));
});

test('all editable definition sections change the snapshot and reverting makes it clean', () => {
  const edits: Array<(definition: WorkflowInput) => void> = [
    d => { d.name = 'Other name'; }, d => { d.description = 'Description'; },
    d => { d.category = 'Finance'; }, d => { d.routing = 'parallel'; },
    d => { d.fields[0].label = 'Office'; }, d => { d.fields[0].appFormula = '[Branch].[Region]'; },
    d => { d.fields[0].showIf = 'FALSE'; }, d => { d.fields[0].requiredIf = 'TRUE'; },
    d => { d.fields[0].initialValueExpression = '"row1"'; },
    d => { d.fields[0].validIf = 'TRUE'; },
    d => { d.fields[0].sourceLabelColumn = 'code'; }, d => { d.fields[0].sourceTableId = 't2'; },
    d => { d.fields.push({ id: 'f2', label: 'Reason', type: 'text', required: false }); },
    d => { d.fields = []; }, d => { d.stages[0].name = 'Finance review'; },
    d => { d.stages[0].slaHours = 48; }, d => { d.stages[0].assigneeType = 'user'; d.stages[0].assigneeId = 'u1'; },
    d => { d.stages[0].conditionFieldId = 'f1'; d.stages[0].conditionValue = 'row1'; },
    d => { d.stages.push({ ...d.stages[0], id: 's2', order: 2 }); }, d => { d.stages = []; },
  ];
  for (const edit of edits) {
    const changed = structuredClone(initial);
    edit(changed);
    assert.notEqual(workflowSnapshot(changed), workflowSnapshot(initial));
    Object.assign(changed, structuredClone(initial));
    assert.equal(workflowSnapshot(changed), workflowSnapshot(initial));
  }
});

test('manual choices remain editable and property order has no effect', () => {
  const manual = structuredClone(initial);
  manual.fields[0].sourceTableId = null;
  const changed = structuredClone(manual);
  changed.fields[0].options = ['A', 'B'];
  assert.notEqual(workflowSnapshot(changed), workflowSnapshot(manual));
  const reordered = Object.fromEntries(Object.entries(manual).reverse()) as WorkflowInput;
  assert.equal(workflowSnapshot(reordered), workflowSnapshot(manual));
});
