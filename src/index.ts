#!/usr/bin/env node

import { ConfluenceMCPServer } from './server.js';

async function main() {
  const server = new ConfluenceMCPServer();
  await server.start();
}

main().catch((error) => {
  console.error('❌ Fehler beim Starten des MCP-Servers:', error);
  process.exit(1);
});