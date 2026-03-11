<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-10 | Updated: 2026-03-10 -->

# python

## Purpose
Python 服务目录，包含视频分析、转录、嵌入生成等 ML 功能。通过 WebSocket 提供服务。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `services/` | Python 服务 (见 `services/AGENTS.md`) |
| `utils/` | Python 工具函数 |
| `monitoring/` | 监控工具 |
| `plugins/` | 插件系统 |

## Key Files

| File | Description |
|------|-------------|
| `main.py` | Python 主服务入口 |
| `requirements.txt` | Python 依赖 |
| `requirements-cuda.txt` | CUDA 相关依赖 |
| `requirements-dev.txt` | 开发依赖 |

## For AI Agents

### Working In This Directory
- 使用 Python 进行 AI/ML 处理
- 通过 WebSocket 与 Node.js 服务通信
- 支持 CUDA 加速
- 使用 OpenCV 进行视频处理
- 使用 Whisper 进行转录
- 使用 PyTorch 进行深度学习

<!-- MANUAL: 自定义项目说明可以添加在下方 -->
