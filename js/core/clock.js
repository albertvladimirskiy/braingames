// Wall-clock access in one place so tests and ?debug can fake "now".
let override = null;
export const now = () => (override ?? Date.now());
export const setNow = (ms) => {
  override = ms;
};
