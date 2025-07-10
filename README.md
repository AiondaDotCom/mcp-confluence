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

No installation required! Use npx to run the server directly:

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

### Option 2: Local Development

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

### Initial Configuration

The server starts without configuration. There are two ways to configure it:

#### Option 1: Via AI (Security Notice)
1. Use the `setup_confluence` tool
2. Provide your Confluence URL, email, and API token
3. The server validates and saves the configuration automatically

**⚠️ Security Notice:** Transmitting API tokens via AI poses a potential security risk if you don't fully trust the AI. If you have security concerns, you probably also don't want the AI to access your Confluence data.

#### Option 2: Manual Configuration
Create a `config.json` file in the project directory:

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

## Configuration

The configuration is automatically saved in `config.json`. This file is included in `.gitignore` and is not versioned. No manual editing required.

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

Delete `config.json` and restart the server for reconfiguration.

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