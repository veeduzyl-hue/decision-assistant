export function nowIso(): string {
    return new Date().toISOString();
  }
  
  export function minutesBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / 60000);
  }
  