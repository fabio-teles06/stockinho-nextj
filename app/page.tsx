import StockApp from "@/components/stock/stock-app";
import { seed } from "@/modules/stock/model";
export const dynamic = "force-dynamic";
export default function Page() {
  return <StockApp initialData={seed()} />;
}
