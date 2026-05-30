import type { MainCanvasProps } from '../../types';

export function MainCanvas({ children }: MainCanvasProps) {
  return (
    <main className="flex-1 overflow-auto p-8 max-w-[1440px] mx-auto w-full">
      {children}
    </main>
  );
}
