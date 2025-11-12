# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Excalidraw is an AI-powered diagram generation application that converts natural language descriptions into professional diagrams. It supports two diagram editors: **Draw.io** (default) and **Excalidraw**, with unique intelligent arrow optimization algorithms.

The application is built with Next.js 16 and React 19, supporting both OpenAI and Anthropic API providers.

## Development Commands

```bash
# Install dependencies (use pnpm, not npm)
pnpm install

# Run development server (requires --webpack flag)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linter
pnpm lint
```

**Important**:
- This project uses **pnpm** for package management. Always use `pnpm install` to add dependencies, not npm or yarn.
- This project requires the `--webpack` flag for both dev and build commands due to compatibility requirements.

## Architecture

### Dual Editor System

The application supports two diagram formats with separate routes and components:

1. **Draw.io Editor** (`/drawio` - default route)
   - Generates mxGraph XML format diagrams
   - Component: [DrawioCanvas.jsx](components/DrawioCanvas.jsx)
   - API: [/api/generate/route.js](app/api/generate/route.js)
   - Prompts: [lib/prompts.js](lib/prompts.js)

2. **Excalidraw Editor** (`/excalidraw`)
   - Generates ExcalidrawElementSkeleton JSON format diagrams
   - Component: [ExcalidrawCanvas.jsx](components/ExcalidrawCanvas.jsx)
   - API: [/api/generate/excalidraw/route.js](app/api/generate/excalidraw/route.js)
   - Prompts: [lib/prompts/excalidraw.js](lib/prompts/excalidraw.js) (re-exports from `smart-excalidraw/lib/prompts.js`)

Both editors share the same page structure pattern with [FloatingChat.jsx](components/FloatingChat.jsx) for user interaction.

### Key Architecture Patterns

**LLM Integration** ([lib/llm-client.js](lib/llm-client.js))
- Unified client supporting both OpenAI and Anthropic APIs
- Server-Sent Events (SSE) streaming for real-time diagram generation
- Multimodal support for image inputs (converts images to diagrams)
- Message format normalization between providers

**Access Control**
- Supports both client-side API key configuration and server-side access password authentication
- When `ACCESS_PASSWORD` is set in environment variables, users can use server-provided LLM without their own API keys
- Password validated via `x-access-password` header in API routes
- Priority: Server-side config (with password) > Client-side config

**Conversation Management** ([lib/history-manager.js](lib/history-manager.js) + [lib/indexeddb.js](lib/indexeddb.js))
- IndexedDB-based storage with three object stores: `conversations`, `messages`, `blobs`
- Supports conversation threads with up to 3 messages of history (HISTORY_LIMIT)
- Binary attachments (images/files) stored separately in `blobs` store
- Each conversation has a unique ID and tracks editor type (drawio/excalidraw)

**Arrow Optimization Algorithm**
- Excalidraw diagrams use a proprietary intelligent arrow optimization algorithm
- Located in [smart-excalidraw/lib/optimizeArrows.js](smart-excalidraw/lib/optimizeArrows.js)
- Automatically calculates optimal connection points between elements to avoid overlapping lines
- Uses quadrant-based edge detection to determine best arrow attachment points

### Component Structure

**Shared UI Components**
- [FloatingChat.jsx](components/FloatingChat.jsx): Chat interface with image/file upload, supports 20+ chart types
- [AppHeader.jsx](components/AppHeader.jsx): Navigation header with settings/history buttons
- [HistoryModal.jsx](components/HistoryModal.jsx): Browse and restore previous diagrams
- [CombinedSettingsModal.jsx](components/CombinedSettingsModal.jsx): LLM configuration and access password setup
- [ui/](components/ui/): Radix UI-based components (Button, Dialog, ScrollArea, etc.)

**Canvas Components**
- Both canvas components are dynamically imported with `ssr: false` to avoid SSR issues
- [DrawioCanvas.jsx](components/DrawioCanvas.jsx): Embeds Draw.io editor via iframe
- [ExcalidrawCanvas.jsx](components/ExcalidrawCanvas.jsx): Integrates @excalidraw/excalidraw library

### API Routes

- `/api/generate` - Generate Draw.io XML diagrams
- `/api/generate/excalidraw` - Generate Excalidraw JSON diagrams
- `/api/auth/validate` - Validate access password
- `/api/models` - Fetch available LLM models
- `/api/configs` - Manage LLM configurations

All generation endpoints support:
- SSE streaming responses
- Access password authentication
- Conversation history (last 3 messages)
- Multimodal inputs (text + images)
- Context-aware regeneration (for iterative editing)

### Data Flow

1. User enters description in [FloatingChat.jsx](components/FloatingChat.jsx)
2. Request sent to appropriate `/api/generate/*` endpoint with config, userInput, chartType, history
3. LLM client ([lib/llm-client.js](lib/llm-client.js)) streams response via SSE
4. Response parsed and displayed in Canvas component
5. History saved to IndexedDB via [history-manager.js](lib/history-manager.js)

## Environment Variables

Server-side LLM configuration (optional, see [.env.example](.env.example)):

```bash
ACCESS_PASSWORD=your-secure-password       # Required for server-side auth
SERVER_LLM_TYPE=openai|anthropic          # Provider type
SERVER_LLM_BASE_URL=https://api.*/v1      # API endpoint
SERVER_LLM_API_KEY=sk-***                 # API key
SERVER_LLM_MODEL=claude-sonnet-4-5-20250929  # Model name
```

## Important Implementation Details

**XML/JSON Fixing Utilities**
- [lib/fixUnclosed.js](lib/fixUnclosed.js): Fixes malformed XML/JSON from LLM responses
- Default export for XML (Draw.io), named export `fixJSON` for Excalidraw

**Prompt Engineering**
- System prompts are highly detailed and specify exact output format constraints
- Prompts emphasize layout spacing (400px+ for Draw.io, 800px+ for Excalidraw) to avoid overlapping
- Special handling for image inputs: analyze visual elements and convert to diagram format
- Draw.io prompts focus on mxGraph XML structure with proper ID management
- Excalidraw prompts focus on ExcalidrawElementSkeleton API with binding/container mechanisms

**Message History**
- Conversation history is limited to last 3 messages to control token usage
- History is filtered to include only 'user' and 'assistant' roles with string content
- Messages stored with role, content, type (xml/json/text), and attachments

**Smart Excalidraw Directory**
- The [smart-excalidraw/](smart-excalidraw/) directory contains the original standalone Excalidraw version
- Current implementation re-exports utilities from this directory (e.g., optimizeArrows, prompts)
- Some modules like [lib/prompts/excalidraw.js](lib/prompts/excalidraw.js) simply re-export from smart-excalidraw

**Webpack Configuration**
- Must use `--webpack` flag for Next.js commands due to dependencies requiring webpack mode
- This is specified in [package.json](package.json) scripts

## Supported Chart Types

The application supports 20+ diagram types (see [FloatingChat.jsx:80-100](components/FloatingChat.jsx#L80-L100)):
- Flowchart, Mind Map, Org Chart, Sequence Diagram, UML Class Diagram
- ER Diagram, Gantt Chart, Timeline, Tree Diagram, Network Topology
- Architecture Diagram, Data Flow Diagram, State Diagram, Swimlane Diagram
- Concept Map, Fishbone Diagram, SWOT Analysis, Pyramid, Funnel, Infographic, etc.

Users can select a specific type or use "auto" to let the AI choose the most appropriate type.

## Common Workflows

**Adding a New Chart Type**
1. Add to `chartTypeOptions` in [FloatingChat.jsx](components/FloatingChat.jsx)
2. Update system prompts in [lib/prompts.js](lib/prompts.js) or [smart-excalidraw/lib/prompts.js](smart-excalidraw/lib/prompts.js) if special handling needed

**Modifying LLM Behavior**
- Edit system prompts in [lib/prompts.js](lib/prompts.js) (Draw.io) or [smart-excalidraw/lib/prompts.js](smart-excalidraw/lib/prompts.js) (Excalidraw)
- Adjust HISTORY_LIMIT in generation routes if more/less context needed
- Modify streaming logic in [lib/llm-client.js](lib/llm-client.js) for different providers

**Debugging Generation Issues**
1. Check browser console for SSE parsing errors
2. Verify LLM response format matches expected XML/JSON structure
3. Test fix functions ([lib/fixUnclosed.js](lib/fixUnclosed.js)) with malformed output
4. For Excalidraw: check arrow optimization in [smart-excalidraw/lib/optimizeArrows.js](smart-excalidraw/lib/optimizeArrows.js)

## Development Workflow Guidelines

**Testing and Verification**
- After making code changes, **do not** run tests or verify functionality yourself
- Simply complete the implementation and let the user test and verify the changes
- The user is responsible for testing and validation
