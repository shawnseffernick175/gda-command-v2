import { type ReactNode } from "react";

export interface MainCanvasProps {
  children: ReactNode;
}

export function MainCanvas({ children }: MainCanvasProps) {
  return (
    <main className="flex-1 overflow-y-auto p-8 max-w-[1440px] mx-auto w-full">
      {children}
    </main>
  );
}
