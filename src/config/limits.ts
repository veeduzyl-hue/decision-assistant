// src/config/limits.ts

/**
 * Hard limits to protect MCP server from pathological inputs
 * (e.g. ReDoS / DoS via extremely long strings)
 */
export const LIMITS = {
    /**
     * Max length for any incoming text field (characters)
     * 20k chars ≈ 20KB UTF-8 in most cases
     */
    MAX_TEXT_LENGTH: 20_000,
  } as const;
  