import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FasTrac",
};

export default function FasTracLayout({ children }: { children: React.ReactNode }) {
  return children;
}
