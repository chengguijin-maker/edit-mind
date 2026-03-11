# Edit Mind API 概览

当前仓库没有单独生成的 OpenAPI / Swagger 文档。

这份文件只提供“入口导航”，源码仍然是最终事实来源。

## 1. Web API

主要位于 `apps/web/app/routes/`：

- `api.folders.ts`：文件夹创建 / 列表
- `api.folders.$id._index.ts`：单个文件夹读取 / 删除
- `api.folders.$id.rescan.ts`：触发重扫
- `api.folders.$id.jobs.ts`：按文件夹查看任务
- `api.videos._index.ts`、`api.videos.$id.ts`：视频列表 / 详情
- `api.search._index.ts`、`api.search.suggestions.ts`：搜索与搜索建议

这些路由直接服务 Web 前端，也是当前用户最常接触的 API 面。

## 2. Background Jobs 内部 API

主要位于 `apps/background-jobs/src/routes/`：

- `folders.ts`：扫描文件夹、删除文件夹、创建索引任务
- `indexer.ts`：视频索引相关内部入口
- `retry.ts`：任务重试
- `health.ts`：健康检查

这部分更偏服务间调用，不建议把它理解成稳定公开 API。

## 3. Python ML 服务接口

当前 Python 侧主要通过 WebSocket 通信，不是传统 REST API。

相关源码：

- `packages/shared/src/services/pythonService.ts`
- `python/services/websocket/server.py`

它负责：

- 音频转录
- 帧分析
- 模型调用结果回传

## 4. 阅读顺序建议

如果你要快速理解接口：

1. 先看 `docs/技术概念详解.md`
2. 再看 `apps/web/app/routes/` 下的 `api.*` 路由
3. 如果涉及任务流转，再看 `apps/background-jobs/src/routes/`
4. 如果涉及 ML 通信，再看 Python WebSocket 相关代码
