"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ApprovalsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/data-quality/approvals");
  }, [router]);
  return null;
}
