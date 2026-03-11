# docs 文档导航

这个目录现在按 3 类口径来阅读，避免把“当前实现”“外部调研”和“审计问题”混在一起。

## 1. 当前实现 / 运维口径

这些文档优先反映当前仓库和当前代码默认值：

- `docs/installation-conflict-resolution.md`
- `docs/COMPLETE_ENVIRONMENT_ANALYSIS.md`
- `docs/技术概念详解.md`
- `docs/api.md`

当前最重要的默认事实：

- 视频索引入口是“添加文件夹 / Rescan / watcher”，不是直接上传单个视频
- 默认分析采样间隔是 `5s`
- 可通过 `.env.system` 的 `ANALYSIS_SAMPLE_INTERVAL_SECONDS` 或 Python 服务参数 `--sample-interval` 覆盖
- `audio / visual embedding` 默认 worker 并发是 `2`
- 当前默认向量存储仍是 ChromaDB

## 2. 外部调研 / benchmark 口径

这些文档主要用于方案比较、公开 benchmark 和行业资料汇总：

- `docs/性能基准对比分析报告.md`
- `docs/媒体管理平台视频搜索功能对比报告.md`
- `docs/视频搜索领域竞品与技术方案深度调研报告.md`
- `docs/调研报告执行摘要.md`
- `docs/Edit_Mind_调研执行摘要.md`

阅读时请默认理解为：

- 表格里的很多数字是公开 benchmark 或外部经验区间
- 它们不能直接当成当前仓库版本的端到端承诺
- 涉及 Qdrant / Milvus / 分布式架构的内容，多数是未来扩展方向，不是当前仓库已内置能力

## 3. 审计 / backlog 口径

这些文档更接近“问题清单”和“工程待办”：

- `docs/report/README.md`
- `docs/report/深度源码审计报告_R1-R70.md`
- `docs/report/2026-03-10-project-bottleneck-analysis-report.md`

如果你只想先看一份：

- 安装与环境问题：先看 `docs/installation-conflict-resolution.md`
- 系统原理与主流程：先看 `docs/技术概念详解.md`
- API 概览：先看 `docs/api.md`
- 审计问题总览：先看 `docs/report/深度源码审计报告_R1-R70.md`
