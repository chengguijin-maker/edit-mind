<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# services

## Purpose
Python 运行时服务实现层，包括帧分析、语音转录、通用处理基类和 WebSocket 协议处理。

## Key Files

| File | Description |
|------|-------------|
| `base_service.py` | 分析/转录共用处理基类 |
| `analysis/service.py` | 视频分析服务 |
| `transcription/service.py` | 语音转录服务 |
| `websocket/server.py` | WebSocket 服务器 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `analysis/` | AI 驱动的视频分析 |
| `transcription/` | 语音到文本转换 |
| `websocket/` | 实时通信服务 |

## For AI Agents

### Working In This Directory
- Python 异步服务使用 asyncio
- 与 Node.js 服务通过 WebSocket 通信
- 结果通过 WebSocket 消息返回给上游调用方

## WebSocket Message Flow

```mermaid
flowchart TB
    NodeJS[Node.js Client] -->|WebSocket Connect| Server[websocket/server.py]
    Server -->|Route| Handlers[handlers.py]
    Handlers -->|analyze| Analysis[analysis/service.py]
    Handlers -->|transcribe| Transcription[transcription/service.py]
    Handlers -->|health| HealthCheck[Health Check]
    Analysis -->|Frame Processing| Plugins[plugins.py]
    Transcription -->|Whisper Model| Whisper[faster-whisper]
    Plugins -->|Result| Server
    Whisper -->|Segments| Server
    Server -->|Progress/Result| NodeJS
```

## Service Inheritance

```mermaid
flowchart LR
    Base[base_service.py<br/>BaseService] --> Analysis[analysis/service.py<br/>AnalysisService]
    Base --> Transcription[transcription/service.py<br/>TranscriptionService]

    subgraph Shared
        Base --> ProcessFrame[process_frame]
        Base --> HandleError[handle_error]
        Base --> SendProgress[send_progress]
    end
```

<!-- MANUAL: -->
