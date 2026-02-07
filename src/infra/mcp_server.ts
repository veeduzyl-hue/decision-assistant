// src/infra/mcp_server.ts
//
// Centralized MCP Server construction shim.
// NOTE: MCP SDK 1.25.1 marks `Server` as deprecated, but it is still the correct class today.
// This file is the ONLY place in the repo allowed to import `Server` directly.
// When the SDK provides a replacement, migrate here without touching orchestration or receipt semantics.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export function createMcpServer(args: { name: string; version: string }) {
  return new Server(
    {
      name: args.name,
      version: args.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );
}
