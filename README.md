# MCP Confluence Server

Ein TypeScript MCP (Model Context Protocol) Server für die Integration mit Confluence von Atlassian.

## Features

- 🔧 **Automatische Konfiguration**: Interaktives Setup ohne manuelle Konfigurationsdateien
- 🔐 **Sichere Authentifizierung**: API-Token-basierte Authentifizierung mit automatischer Erneuerung
- 🔍 **Vollständige Suchfunktionen**: CQL-basierte Suche und Volltext-Suche
- 📄 **Seiten- und Bereichsverwaltung**: Zugriff auf Confluence-Inhalte und -Strukturen
- 🚀 **STDIO-Transport**: Läuft über Standard-Input/Output für MCP-Kompatibilität
- ⚡ **Rate Limiting**: Eingebauter Schutz vor API-Überlastung

## Installation

```bash
npm install
npm run build
```

## Verwendung

### MCP-Integration

1. **Kopieren Sie die `mcp.json` in Ihr MCP-Konfigurationsverzeichnis**
2. **Oder fügen Sie den Server zu Ihrer bestehenden MCP-Konfiguration hinzu:**

```json
{
  "mcpServers": {
    "confluence": {
      "command": "/pfad/zu/mcp-confluence/start-server.sh",
      "cwd": "/pfad/zu/mcp-confluence",
      "args": [],
      "env": {}
    }
  }
}
```

### Direkter Start (für Tests)

```bash
./start-server.sh
```

### Erste Konfiguration

Der Server startet ohne Konfiguration. Es gibt zwei Möglichkeiten zur Konfiguration:

#### Option 1: Über die KI (Sicherheitshinweis)
1. Verwenden Sie das `setup_confluence` Tool
2. Geben Sie Ihre Confluence-URL, E-Mail und API-Token an
3. Der Server validiert und speichert die Konfiguration automatisch

**⚠️ Sicherheitshinweis:** Das Übermitteln von API-Tokens über die KI stellt ein potentielles Sicherheitsrisiko dar, falls Sie der KI nicht vollständig vertrauen. Wenn Sie Sicherheitsbedenken haben, sollten Sie auch nicht wollen, dass die KI Ihre Confluence-Daten einsehen kann.

#### Option 2: Manuelle Konfiguration
Erstellen Sie eine `config.json` Datei im Projektverzeichnis:

```json
{
  "confluenceBaseUrl": "https://ihr-unternehmen.atlassian.net",
  "confluenceEmail": "ihre.email@beispiel.com",
  "confluenceApiToken": "Ihr-API-Token"
}
```

## MCP-Tools

### Konfiguration

- `setup_confluence`: Konfiguration einrichten oder aktualisieren
  - `action: "setup"`: Erstkonfiguration
  - `action: "update_token"`: Token erneuern
  - `action: "validate"`: Konfiguration validieren

### Suche

- `search_confluence`: CQL-basierte Suche
- `search_pages`: Volltext-Suche in Seiten
- `get_recent_pages`: Kürzlich geänderte Seiten

### Inhalte

- `get_page`: Spezifische Seite abrufen
- `get_space`: Bereich-Informationen
- `list_spaces`: Alle verfügbaren Bereiche

## MCP-Resources

- `confluence://spaces`: Alle verfügbaren Bereiche
- `confluence://recent-pages`: Kürzlich geänderte Seiten
- `confluence://user`: Aktuelle Benutzer-Informationen

## Konfiguration

Die Konfiguration wird automatisch in `config.json` gespeichert. Diese Datei ist in `.gitignore` enthalten und wird nicht versioniert. Keine manuelle Bearbeitung erforderlich.

## API-Token erstellen

1. Gehen Sie zu https://id.atlassian.com/manage-profile/security/api-tokens
2. Klicken Sie auf "Create API token"
3. Geben Sie dem Token einen beschreibenden Namen
4. Kopieren Sie den Token (er wird nur einmal angezeigt)
5. Verwenden Sie den Token bei der Konfiguration des Servers

## Entwicklung

```bash
# Entwicklungsmodus
npm run dev

# Build
npm run build

# Tests
npm test

# Linting
npm run lint
```

## Troubleshooting

### Token-Probleme

Der Server erkennt automatisch abgelaufene oder ungültige Token und fordert Sie zur Erneuerung auf.

### Konfigurationsprobleme

Löschen Sie `config.json` und starten Sie den Server neu für eine Neukonfiguration.

### API-Fehler

Überprüfen Sie:
- Ihre Berechtigung für die Confluence-Instanz
- Die Gültigkeit der Base-URL
- Ihre Netzwerkverbindung

## Lizenz

MIT
