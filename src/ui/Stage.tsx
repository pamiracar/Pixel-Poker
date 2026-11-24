import { useEffect, useState, type ReactNode } from 'react';
import { STAGE_H, STAGE_W, fitScale } from './layout';

/** Fixed 1280x720 design stage, scaled uniformly to fit the window so proportions never change. */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(() => fitScale(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const onResize = () => setScale(fitScale(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <div className="viewport">
      <div className="stage" style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>{children}</div>
    </div>
  );
}
