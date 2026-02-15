# Guru MCP Server

Stdio-based [MCP](https://modelcontextprotocol.io/) server that wraps the [Guru REST API](https://developer.getguru.com/). Provides tools for listing, reading, updating, and verifying Guru knowledge base cards.

## Tools

| Tool | Description |
|------|-------------|
| `list_cards` | Search/filter cards by verification status, collection, verifier, and search terms. Paginated (50/page). |
| `get_card` | Get a single card's full content and metadata by ID. |
| `create_card` | Create a new card in a specified collection. |
| `update_card` | Update a card's title or HTML content. |
| `delete_card` | Delete a card by ID. |
| `verify_card` | Mark a card as verified, resetting its verification timer. |
| `list_groups` | List all groups in the Guru team. |
| `set_verifier` | Set the verifier for a card to a user or group. Replaces any existing verifier. |

## Setup

### 1. Clone and install

```bash
mkdir -p ~/mcp-servers
git clone git@github.com:InfuseGroup/guru-mcp-server.git ~/mcp-servers/guru
cd ~/mcp-servers/guru
npm install
```

### 2. Get your Guru API token

- Go to Guru > Settings > API Access
- Generate a User Token
- Note your Guru login email

### 3. Add to your project's `.mcp.json`

```json
{
  "mcpServers": {
    "guru": {
      "command": "node",
      "args": ["/Users/<you>/mcp-servers/guru/index.js"],
      "env": {
        "GURU_EMAIL": "your.email@pinpointhq.com",
        "GURU_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

**Important:** `.mcp.json` contains credentials. Make sure it's in your project's `.gitignore`.

### 4. Restart Claude Code

The Guru tools will be available after restart.

## Authentication

Uses Basic Auth with your Guru email and API token. Access is scoped to whatever the authenticated user has permission to see in Guru.
