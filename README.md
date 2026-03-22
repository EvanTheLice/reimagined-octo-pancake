# Open Connection Manager (Essential Protocol Implementation)

A high-performance, persistent private backend implementation designed to interface with the Essential Mod, built with Bun and SQLite.

**Note:** This project does not contain, use, or derive from any official source code. All protocol implementation is strictly based on the public documentation and packet research provided by the independent [ThnksCJ/essential.gg](https://github.com/ThnksCJ/essential.gg) project (including insights from their P.I.G. tool).

## Features

- **Protocol Compliance**: Full implementation of the Binary/JSON packet protocol as documented by the `ThnksCJ/essential.gg` reverse-engineering team.
- **Persistence**: SQLite-backed storage for users, friends, chat history, and cosmetic states.
- **Social System**:
  - Global friend requests and bidirectional relationship management.
  - Real-time online/offline status broadcasting.
  - Profile activity tracking.
- **Multiplayer Bridge**: P2P signaling relay (ICE/STUN) enabling friend-to-friend world joining.
- **Cosmetic Management**:
  - Independent local hosting of cosmetic geometry and textures.
  - Custom catalog population capabilities.
  - Mock Store checkout system for persistent local unlocks testing.
- **Messaging**: Persistent chat channels with history retrieval support.
- **Logging**: Structured, colorized logging provided by Pino.

## Prerequisites

- **Bun runtime**: [https://bun.sh](https://bun.sh)

## Setup

1. **Install Dependencies**:
   ```bash
   bun install
   ```

2. **Initialize Database**:

   Populate the database with initial data schemas:

   ```bash
   bun run seed
   ```

3. **Start the Server**:

   ```bash
   bun start
   ```

   The server listens on port `8080` by default.

## Client Configuration

To route network traffic to this local server for testing, set the following environment variable before launching the client:

```powershell
# Windows (PowerShell)
$env:ESSENTIAL_CM_HOST="wss://127.0.0.1:8080/v1"

# Linux/macOS
export ESSENTIAL_CM_HOST="wss://127.0.0.1:8080/v1"
```

## Environment Variables

| **Variable** | **Description** | **Default** |
|---|---|---|
| `PORT` | Server listening port | `8080` |
| `ESSENTIAL_PATH` | WebSocket endpoint path | `/v1` |
| `MEDIA_BASE_URL` | Base URL for media assets and uploads | `http://127.0.0.1:8080` |

## Disclaimer

**Educational & Testing Purposes Only.** This project is an independent, clean-room implementation based on third-party protocol documentation. It is not affiliated with, authorized, maintained, sponsored, or endorsed by ModCore Inc. or the official Essential Mod team.

This software is designed for local network testing and private environments. The author does not condone bypassing official monetization systems and is not responsible for any misuse, account bans, or data loss.
