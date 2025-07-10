@echo off
REM MCP Confluence Server Startup Script
REM This script starts the MCP Confluence server

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0

REM Change to the project directory
cd /d "%SCRIPT_DIR%"

REM Check if node_modules exists, if not run npm install
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

REM Check if dist directory exists, if not build the project
if not exist "dist" (
    echo Building project...
    npm run build
)

REM Start the MCP server
node dist/index.js