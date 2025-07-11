@echo off
REM MCP Confluence Server Inspector
REM This script starts the MCP Inspector to test and debug the Confluence server

echo Starting MCP Inspector for Confluence Server...
echo This will open a web interface to test the MCP server tools and resources.
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Start the MCP Inspector
npx @modelcontextprotocol/inspector start-server.bat