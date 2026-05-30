import type { Meta, StoryObj } from "@storybook/react";
import { DataTable } from "./DataTable";

interface Row { id: string; title: string; value: number; stage: number }

const meta: Meta<typeof DataTable<Row>> = { title: "Components/DataTable", component: DataTable };
export default meta;
type Story = StoryObj<typeof DataTable<Row>>;

const data: Row[] = [
  { id: "1", title: "NGEN-R Task Order", value: 12500000, stage: 3 },
  { id: "2", title: "OASIS SB Pool 1", value: 8000000, stage: 1 },
  { id: "3", title: "Army RS3 Cyber", value: 2500000, stage: 5 },
];

export const Default: Story = {
  args: {
    columns: [
      { key: "title", header: "Opportunity", sortable: true, render: (r: Row) => r.title },
      { key: "value", header: "Value", align: "right", sortable: true, render: (r: Row) => `$${(r.value / 1e6).toFixed(1)}M` },
      { key: "stage", header: "Stage", render: (r: Row) => `Stage ${r.stage}` },
    ],
    data,
    rowKey: (r: Row) => r.id,
    sortKey: "value",
    sortDir: "desc",
  },
};
