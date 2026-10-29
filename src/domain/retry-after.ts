export function retryAfterSeconds(value: string|null): number {
  const seconds=Number(value);
  return value!==null && /^\d+$/.test(value) && seconds>0 ? Math.min(3600,seconds) : 60;
}
