# MCP Confluence Server

A TypeScript MCP (Model Context Protocol) server for integration with Atlassian Confluence.

## Features

- 🔧 **Automatic Configuration**: Interactive setup without manual configuration files
- 🔐 **Secure Authentication**: API token-based authentication with automatic renewal
- 🔍 **Complete Search Functions**: CQL-based search and full-text search
- 📄 **Page and Space Management**: Access to Confluence content and structures
- 🚀 **STDIO Transport**: Runs over Standard Input/Output for MCP compatibility
- ⚡ **Rate Limiting**: Built-in protection against API overload
- ✍️ **Write Operations**: Create and update pages with Atlassian Markup Format validation

## Installation

### Option 1: NPX (Recommended)

The easiest way to use the MCP Confluence server is with npx. The configuration is automatically saved in your home directory and persists between runs.

#### Prerequisites
- Install [Node.js](https://nodejs.org/en/download) (version 18 or higher)

#### Setup Steps

1. **Add to Claude Desktop configuration:**
   - Open your Claude Desktop config file:
     - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
     - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
     - **Linux**: `~/.config/Claude/claude_desktop_config.json`
   
   - Add the "confluence" entry to your `mcpServers` configuration:
   ```json
   {
     "mcpServers": {
       "confluence": {
         "command": "npx",
         "args": ["@aiondadotcom/mcp-confluence-server"]
       }
     }
   }
   ```

2. **Restart Claude Desktop:**
   - Close Claude Desktop completely
   - On Windows, also end the Claude process in Task Manager (it runs in the background)
   - Restart Claude Desktop

3. **Configure your Confluence credentials:**
   - The MCP server will prompt you for your credentials on first use
   - You'll need to create an API token in Confluence:
     - Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
     - Click "Create API token"
     - Give it a name (e.g., "MCP")
     - Copy the token
   - The AI will ask for:
     - Your Confluence URL (e.g., `https://your-company.atlassian.net`)
     - Your email address
     - Your API token
   - The configuration will be automatically saved in `~/.mcp-confluence-config.json`

That's it! The server will now work with Claude Desktop and your configuration will persist between sessions.

### Option 2: Manual Installation (Alternative)

Alternative installation method for users who prefer manual setup:

1. **Install the package globally:**
   ```cmd
   npm install -g @aiondadotcom/mcp-confluence-server
   ```

2. **Create a directory for the server:**
   ```cmd
   mkdir C:\mcp-confluence
   cd C:\mcp-confluence
   ```

3. **Create a batch file `start-server.bat`:**
   ```batch
   @echo off
   mcp-confluence-server
   ```

4. **Add to Claude Desktop configuration** (`%APPDATA%\Claude\claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "confluence": {
         "command": "C:\\mcp-confluence\\start-server.bat",
         "cwd": "C:\\mcp-confluence",
         "args": [],
         "env": {}
       }
     }
   }
   ```

5. **Initial setup:**
   - Start Claude Desktop
   - Use the `setup_confluence` tool to configure your Confluence credentials
   - The `config.json` will be saved in `C:\mcp-confluence` and persist between runs

### Option 3: Local Development

```bash
git clone https://github.com/AiondaDotCom/mcp-confluence.git
cd mcp-confluence
npm install
npm run build
```

## Usage

### MCP Integration with NPX

Add the server to your MCP configuration using npx:

```json
{
  "mcpServers": {
    "confluence": {
      "command": "npx",
      "args": ["@aiondadotcom/mcp-confluence-server"],
      "env": {}
    }
  }
}
```

### Local Development Setup

1. **Copy the `mcp.json` to your MCP configuration directory**
2. **Or add the server to your existing MCP configuration:**

```json
{
  "mcpServers": {
    "confluence": {
      "command": "/path/to/mcp-confluence/start-server.sh",
      "cwd": "/path/to/mcp-confluence",
      "args": [],
      "env": {}
    }
  }
}
```

### Direct Start (for testing)

```bash
# NPX
npx @aiondadotcom/mcp-confluence-server

# Local development
./start-server.sh
```

### Configuration

The server automatically handles configuration through the `setup_confluence` tool. Configuration is saved in `~/.mcp-confluence-config.json` and persists between sessions.

#### Automatic Setup
When you first use the server, it will prompt you for:
- Your Confluence URL (e.g., `https://your-company.atlassian.net`)
- Your email address
- Your API token

The configuration is automatically validated and saved.

#### Manual Configuration (Optional)
You can also manually create `~/.mcp-confluence-config.json`:

```json
{
  "confluenceBaseUrl": "https://your-company.atlassian.net",
  "confluenceEmail": "your.email@example.com",
  "confluenceApiToken": "Your-API-Token"
}
```

## MCP Tools

### Configuration

- `setup_confluence`: Set up or update configuration
  - `action: "setup"`: Initial configuration
  - `action: "update_token"`: Renew token
  - `action: "validate"`: Validate configuration

### Search

- `search_confluence`: CQL-based search
- `search_pages`: Full-text search in pages
- `get_recent_pages`: Recently modified pages

### Content

- `get_page`: Retrieve specific page
- `get_space`: Space information
- `list_spaces`: All available spaces

### Write Operations

- `create_page`: Create new Confluence pages
  - **⚠️ IMPORTANT**: Content MUST be in Atlassian Markup Format!
- `update_page`: Update existing Confluence pages
  - **⚠️ IMPORTANT**: Content MUST be in Atlassian Markup Format!

#### Atlassian Markup Format Examples

```
h1. Heading
*bold text*
_italic text_
{info}This is an info box{info}
{panel}This is a panel{panel}
{code}code block{code}
```

## MCP Resources

- `confluence://spaces`: All available spaces
- `confluence://recent-pages`: Recently modified pages
- `confluence://user`: Current user information

## Configuration Storage

The configuration is automatically saved in `~/.mcp-confluence-config.json` in your home directory. This ensures the configuration persists between sessions and works with npx. No manual editing required.

## Creating API Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give the token a descriptive name
4. Copy the token (it will only be displayed once)
5. Use the token when configuring the server

## Development

```bash
# Development mode
npm run dev

# Build
npm run build

# Tests
npm test

# Linting
npm run lint
```

## Troubleshooting

### Token Issues

The server automatically detects expired or invalid tokens and prompts you to renew them.

### Configuration Issues

Delete `~/.mcp-confluence-config.json` and restart the server for reconfiguration.

### API Errors

Check:
- Your permissions for the Confluence instance
- The validity of the Base URL
- Your network connection

### Markup Format Errors

If you encounter errors when creating or updating pages:
- Ensure content is in Atlassian Markup Format, not Markdown
- The tools will automatically detect common Markdown syntax and provide helpful error messages
- Refer to the Atlassian Markup Format examples above

## NPM Package

This server is published as `@aiondadotcom/mcp-confluence-server` on NPM.

- **Package**: https://www.npmjs.com/package/@aiondadotcom/mcp-confluence-server
- **Repository**: https://github.com/AiondaDotCom/mcp-confluence

### Installation Options

1. **NPX (No installation)**: `npx @aiondadotcom/mcp-confluence-server`
2. **Global installation**: `npm install -g @aiondadotcom/mcp-confluence-server`
3. **Local installation**: `npm install @aiondadotcom/mcp-confluence-server`

## License

MIT