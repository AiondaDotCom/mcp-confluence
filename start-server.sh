#!/bin/bash

# MCP Confluence Server Startup Script
# This script starts the MCP Confluence server

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Change to the project directory
cd "$SCRIPT_DIR" || exit 1

# Check if node_modules exists, if not run npm install
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Check if dist directory exists, if not build the project
if [ ! -d "dist" ]; then
    echo "Building project..."
    npm run build
fi

# Start the MCP server
exec node dist/index.js