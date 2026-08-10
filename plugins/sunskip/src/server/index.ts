import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCodexRunServer } from "./create-game-server.js";

const server = createCodexRunServer();
const transport = new StdioServerTransport();

await server.connect(transport);
process.stderr.write("Codex Run MCP server ready on stdio.\n");
