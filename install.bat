@echo off
REM MCP Confluence Server Installation Script
REM This script installs dependencies and builds the project

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0

REM Change to the project directory
cd /d "%SCRIPT_DIR%"

REM Install dependencies
echo Installing dependencies...
npm install

REM Build the project
echo Building project...
npm run build

echo Installation completed successfully!
pause