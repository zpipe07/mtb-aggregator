import { Suspense } from "react";
import { DealsPage } from "@/views/DealsPage";
import { LoadingState } from "@/components/LoadingState";

export default function Deals() {
  return (
    <Suspense fallback={<LoadingState />}>
      <DealsPage />
    </Suspense>
  );
}
