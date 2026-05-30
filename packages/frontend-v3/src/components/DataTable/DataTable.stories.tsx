import type { Meta, StoryObj } from '@storybook/react';
import { DataTable } from './DataTable';

interface Row { id: string; name: string; value: number; status: string }

const meta: Meta<typeof DataTable<Row>> = { component: DataTable, title: 'Primitives/DataTable' };
export default meta;
type Story = StoryObj<typeof DataTable<Row>>;

const data: Row[] = [
  { id: '1', name: 'DOD Cloud Migration', value: 2500000, status: 'Pursuing' },
  { id: '2', name: 'VA Health IT', value: 4800000, status: 'Qualified' },
  { id: '3', name: 'USAF Cyber', value: 1200000, status: 'Submitted' },
];

const columns = [
  { key: 'name', header: 'Opportunity', sortable: true, render: (r: Row) => r.name },
  { key: 'value', header: 'Value', sortable: true, align: 'right' as const, render: (r: Row) => `$${(r.value / 1e6).toFixed(1)}M` },
  { key: 'status', header: 'Status', render: (r: Row) => r.status },
];

export const Default: Story = { args: { columns, data, rowKey: (r: Row) => r.id } };
export const Empty: Story = { args: { columns, data: [], rowKey: (r: Row) => r.id, emptyState: 'No opportunities found.' } };
export const Loading: Story = { args: { columns, data: [], rowKey: (r: Row) => r.id, loading: true } };
