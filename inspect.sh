#!/bin/bash

# MCP Confluence Server Inspector
# This script starts the MCP Inspector to test and debug the Confluence server

echo "Starting MCP Inspector for Confluence Server..."
echo "This will open a web interface to test the MCP server tools and resources."
echo ""

# Check if the MCP inspector is installed
if ! command -v npx &> /dev/null; then
    echo "Error: npx is not installed. Please install Node.js first."
    exit 1
fi

# Start the MCP Inspector
npx @modelcontextprotocol/inspector ./start-server.sh