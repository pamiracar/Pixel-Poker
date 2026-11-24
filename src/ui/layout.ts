/** Everything is designed on a 1280x720 stage that is scaled uniformly to fit the window (letterboxed). */
export const STAGE_W = 1280, STAGE_H = 720;
export const fitScale = (vw: number, vh: number, w = STAGE_W, h = STAGE_H): number => Math.max(0.1, Math.min(vw / w, vh / h));
