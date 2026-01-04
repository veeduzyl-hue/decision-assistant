export function safeJsonParse<T = unknown>(s: string): { ok: true; value: T } | { ok: false; error: string } {
    try {
      return { ok: true, value: JSON.parse(s) as T };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "JSON parse error" };
    }
  }
  
  export function stableStringify(obj: unknown, space = 2): string {
    return JSON.stringify(obj, Object.keys(obj as any).sort(), space);
  }
  