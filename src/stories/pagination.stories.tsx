import { Pagination } from "../components/ui/pagination";

const meta = {
  title: "ui/Pagination",
  component: Pagination,
  tags: ["autodocs"],
  argTypes: {},
};
export default meta;

export const Base = {
  render: (args: any) => (
    <Pagination
      page={1}
      limit={20}
      total={100}
      totalPages={5}
      hasNext={true}
      hasPrev={false}
      onPageChange={(page) => console.log('Page changed:', page)}
      showLimitSelector={true}
      onLimitChange={(limit) => console.log('Limit changed:', limit)}
    />
  ),
  args: {},
};
