# Edit Mind 项目现网架构、视频处理瓶颈与优化报告

- 报告日期：2026-03-10
- 分析范围：`docs/`、仓库源码、现网运行进程、端口探测、Postgres `Job` 数据、Redis/BullMQ 队列状态、Chroma 集合状态、GPU/CPU/内存快照
- 结论口径：以当前仓库真实实现和当前环境真实运行数据为准，不以口头假设、泛化经验或“显卡应该很快”的直觉为准
- 说明：本文同时保留了排障起点时的历史观察和文末“已修改的内容”。如果某处与当前代码默认值冲突，请以当前代码和第 19.1 节为准。

---

## 0. 执行摘要

本次分析确认：

1. 当前“视频处理很慢”的主因，不是 `Gemini` 或 `Ollama`。
2. 当前“视频处理很慢”的主因，也不是机器硬件不够。
3. 真正的主瓶颈，是视频索引流水线本身的结构设计、排队方式、scene 数量膨胀、以及 `frame-analysis` 与 `audio/visual embedding` 的吞吐不匹配。
4. 当前现网还叠加了一个运行问题：分析时刻 `background-jobs` 服务没有在 `4000` 端口监听，说明新任务当前并不会继续推进。

这套系统当前的视频索引主链路是：

`transcription -> frame-analysis -> scene-creation -> text/audio/visual embedding -> video-finalization`

其中最重要的结论如下：

| 编号 | 结论 | 判断 |
|---|---|---|
| 1 | 视频主链路的主耗时不在聊天模型，而在视频索引本身 | 明确成立 |
| 2 | `frame-analysis` 里最重的不是 YOLO，而是 `FaceRecognitionPlugin` 和 `DescriptorPlugin` | 明确成立 |
| 3 | `scene-creation` 实际上是“每个采样帧直接变成一个 scene”，会把后半段 embedding 成本线性放大 | 明确成立 |
| 4 | `visual-embedding` 和 `audio-embedding` 在排障起点时并发曾是 `1`，后续已提升到 `2`；后半段吞吐仍需持续压测 | 明确成立 |
| 5 | worker 外层并发与 Python 内层真实吞吐没有打通，并发一高就容易放大等待时间 | 明确成立 |
| 6 | 当前数据库统计已经证明，很多“慢”不是执行慢，而是排队/等待慢 | 明确成立 |
| 7 | 当前失败热点集中在 `embedding_visual`，不是随机失败 | 明确成立 |
| 8 | 当前机器没有被 Edit Mind 全面吃满，资源利用非常不均衡 | 明确成立 |
| 9 | 当前现网存在 `background-jobs` 未监听 `4000` 的运行问题 | 明确成立 |

一句话总结：

**Edit Mind 现在慢，不是因为模型“太笨”，而是因为流水线把一个视频拆成了过多的 scene，又让最重的分析插件逐帧执行，同时把后半段 embedding 长时间排队；结果是前半段重计算、后半段重等待，最终让总耗时被严重拉长。**

---

## 1. 分析方法与证据来源

本次分析使用了以下证据：

1. 仓库文档：
   - `docs/COMPLETE_ENVIRONMENT_ANALYSIS.md`
   - `docs/installation-conflict-resolution.md`
   - `docs/report/2026-03-10-project-bottleneck-analysis-report.md`（旧版）
2. 核心实现源码：
   - `apps/background-jobs/`
   - `python/`
   - `packages/embedding-*`
   - `packages/media-utils/`
   - `packages/shared/`
3. 现网运行态：
   - `ps`
   - `ss`
   - `curl --noproxy '*'`
   - `nvidia-smi`
   - `free -h`
   - `df -h`
4. 运行数据面：
   - Postgres 中 `Job` 表真实任务记录
   - Redis 中 BullMQ 队列状态
   - Chroma 集合信息与集合计数

需要说明的边界：

1. 本次会话未直接读取 root 用户下的 Docker stdout/stderr 日志，因为当前终端会话未提供可直接使用的 sudo 密码。
2. 但本次已经通过 `Job` 表阶段时间、BullMQ 队列状态、端口监听、GPU/CPU 快照、Chroma 集合信息拿到了足够强的现网证据，足以定位瓶颈。
3. 因此，本报告对“主瓶颈在哪里、为什么慢、先改什么最值”的判断把握很高；对“某一个容器内最后一条异常堆栈是什么”则仍建议后续补 docker logs 复核。

---

## 2. 当前环境与服务现状

### 2.1 机器资源快照

从当前机器状态看，硬件不是主短板。

#### CPU

- 96 逻辑核
- 2 路 Intel Xeon Gold 6248R
- 当前系统负载约 `1.33 / 1.54 / 2.36`

结论：

- 整体 CPU 并没有被打满。
- 这说明当前“慢”不是整机算力耗尽，更像是流水线设计和局部串行导致的吞吐不足。

#### 内存

- 总内存：`313Gi`
- 可用内存：约 `285Gi`

结论：

- 内存也不是当前主瓶颈。

#### 存储

- 根分区：`438G`
- 已用：`346G`
- 剩余：`70G`
- 使用率：`84%`

结论：

- 磁盘空间已经偏紧。
- 这还不是当前“慢”的直接主因，但会放大临时文件、模型缓存、向量库增长带来的风险。

### 2.2 GPU 使用快照

采样时 GPU 状态如下：

- GPU 0：被 Python ML 进程占用约 `1056 MiB`
- GPU 1：被 Ollama runner 占用约 `22524 MiB`，利用率约 `77%`
- 其余 GPU 基本空闲

结论：

1. Edit Mind 并没有把多卡资源真正用起来。
2. Ollama 确实在持续占用一整张大卡，但它不是视频索引主链路的根因。
3. 从资源分布看，当前更像“流水线没有把 GPU 正确喂满”，而不是“GPU 不够用”。

### 2.3 端口与服务状态

本次探测到：

- `3745`：Web 正常响应
- `8765`：Python ML WebSocket 服务正常响应升级提示
- `8000`：Chroma 正常响应 heartbeat
- `11435`：Ollama 正常响应
- `5432`：Postgres 可连接
- `6379`：Redis 可连接
- `4000`：未监听

结论：

1. 当前前端、ML、Redis、Postgres、Chroma 都活着。
2. 但 `background-jobs` 当前不在 `4000` 端口监听。
3. 这意味着此刻如果继续提交新视频任务，链路大概率不会继续推进。

这不是“性能问题”，而是“服务可用性问题”。

---

## 3. 项目真实处理架构

### 3.1 视频主链路

视频索引入口来自：

- `apps/background-jobs/src/routes/indexer.ts`
- `apps/background-jobs/src/services/videoIndexer.ts`

任务真正入队的位置在：

- `apps/background-jobs/src/services/videoIndexer.ts:72`

处理主链路如下：

1. `transcription`
   - `apps/background-jobs/src/jobs/transcription.ts`
2. `frame-analysis`
   - `apps/background-jobs/src/jobs/frameAnalysis.ts`
3. `scene-creation`
   - `apps/background-jobs/src/jobs/sceneCreation.ts`
4. `text-embedding`
   - `apps/background-jobs/src/jobs/textEmbedding.ts`
5. `audio-embedding`
   - `apps/background-jobs/src/jobs/audioEmbedding.ts`
6. `visual-embedding`
   - `apps/background-jobs/src/jobs/visualEmbedding.ts`
7. `video-finalization`
   - `apps/background-jobs/src/jobs/videoFinalization.ts`

### 3.2 控制面与数据面

当前架构不是“把分析结果全走 WebSocket 回传”，而是：

1. Node.js 通过一个持久 WebSocket 向 Python ML 服务下发任务
   - `packages/shared/src/services/pythonService.ts:106`
2. Python 侧把分析/转录结果写到共享 JSON 文件
3. Node 后续阶段从这些 JSON 文件继续处理

这意味着：

- WebSocket 是控制面
- JSON 文件是数据面

这条设计本身没有错，但如果中间任一阶段失败或文件损坏，后续阶段就会大量重建或报错。

### 3.3 scene 生成方式

这是整条链路最关键的结构点。

`scene-creation` 当前并不是“基于镜头边界合并成 scene”，而是：

- 遍历 `analysis.frame_analysis`
- 每个采样帧都直接生成一个 scene

对应实现：

- `packages/media-utils/src/utils/scenes.ts:128`

这意味着：

- 一个长视频采样出多少帧
- 后面就会有多少 scene

也就是说，当前 scene 数量是被采样帧数直接决定的，而不是被真实镜头数决定的。

这是后半段成本爆炸的核心原因。

---

## 4. 当前真实并发与配置

### 4.1 Node worker 并发

#### 转录

- `apps/background-jobs/src/jobs/transcription.ts:95`
- 并发来自 `MAX_CONCURRENT_TRANSCRIPTIONS`

#### 帧分析

- `apps/background-jobs/src/jobs/frameAnalysis.ts:89`
- 并发来自 `MAX_CONCURRENT_ANALYSES`

#### scene 创建

- `apps/background-jobs/src/jobs/sceneCreation.ts:113`
- 并发固定为 `3`

#### text embedding

- `apps/background-jobs/src/jobs/textEmbedding.ts`
- 并发固定为 `3`

#### audio embedding

- `apps/background-jobs/src/jobs/audioEmbedding.ts:46`
- 当前默认并发为 `2`

#### visual embedding

- `apps/background-jobs/src/jobs/visualEmbedding.ts:50`
- 当前默认并发为 `2`

### 4.2 Python 侧配置

Python 分析配置：

- `python/core/config.py:10`
- `sample_interval_seconds = 5.0`
- `max_workers = 2`
- `frame_buffer_limit = 2`

而真正进入分析服务后：

- `python/services/analysis/service.py:29`
- `super().__init__(max_workers=self.config.max_workers // 2, ...)`

默认 `max_workers = 2` 被除以 2 后，实际分析线程默认只有 `1`。

这点非常重要。

它意味着：

1. 即使 Node 外层允许更多并发
2. Python 真正的分析侧默认也几乎是单线程吞吐

### 4.3 Node 与 Python 吞吐没有真正对齐

从设计上看：

- Node worker 并发是 BullMQ 层的“可同时接多少任务”
- Python 侧实际吞吐是“ML 真正能同时吃多少任务”

现在的问题是：

1. 两边都能配置
2. 但默认值非常保守
3. 而且并没有统一的端到端限流模型

结果就是：

- 外层看起来可并发
- 内层仍可能实际串行
- 并发稍一拉高，等待时间就会放大

---

## 5. 真实任务数据分析

### 5.1 Job 总体情况

从 Postgres `Job` 表统计得到：

- 总任务数：`77`
- 完成：`55`
- 失败：`22`
- 总失败率：`28.57%`

这已经说明：

- 当前不是“慢但稳定”
- 而是“慢，并且批量时明显不稳定”

### 5.2 失败分布

按失败 stage 统计：

- `embedding_visual`：`14`
- `embedding_text`：`3`
- `transcribing`：`3`
- `frame_analysis`：`1`
- `starting`：`1`

结论：

**失败热点最集中的是 `embedding_visual`。**

这和代码层的结构风险是吻合的：

1. 排障起点时全局 worker 并发为 `1`
2. 内部 batch 又 `Promise.all`
3. 每个 scene 还要 ffmpeg 抽 5 张图再跑 CLIP

### 5.3 最近批次表现

按创建小时聚合后，任务表现如下：

| 批次小时 | 任务数 | 完成 | 失败 | 平均总耗时 | 平均阶段耗时和 | 平均等待/排队 |
|---|---:|---:|---:|---:|---:|---:|
| 2026-03-10 07:00 | 34 | 12 | 22 | 5203.67s | 1478.41s | 3725.25s |
| 2026-03-09 14:00 | 2 | 2 | 0 | 41640.94s | 7275.50s | 34365.44s |
| 2026-03-09 13:00 | 21 | 21 | 0 | 22229.18s | 8117.67s | 14111.51s |
| 2026-03-09 10:00 | 2 | 2 | 0 | 6641.06s | 5365.00s | 1276.06s |
| 2026-03-09 06:00 | 5 | 5 | 0 | 8297.04s | 3655.60s | 4641.44s |
| 2026-03-06 14:00 | 12 | 12 | 0 | 167473.02s | 3242.75s | 164230.27s |

这里有两个结论非常关键：

1. **很多慢，不是执行慢，而是等待慢。**
2. 某些批次的总墙钟时间，远大于阶段执行时间本身。

### 5.4 最近完成任务的等待时间

最近 12 个完成任务中，典型情况如下：

| Job | 阶段耗时和 | 总墙钟时间 | 等待/排队时间 |
|---|---:|---:|---:|
| `p8QKkUYeBjiCZhSV3Wwio` | 1696s | 10772.81s | 9076.81s |
| `fNGjFq3TYXyZkO-ONqlTL` | 1617s | 10550.33s | 8933.33s |
| `W5qec8WWXPucDEaiIGDpp` | 1634s | 10318.49s | 8684.49s |
| `G783qReBsNWQK_F5gak3N` | 1677s | 9742.01s | 8065.01s |
| `7ch_z9rriJREmGpwIwKtx` | 1662s | 8958.81s | 7296.81s |

注意：

- 这里的“阶段耗时和”仍然偏保守高估，因为 `text/audio/visual` 在 `scene-creation` 后是并行子任务，不应直接机械相加。
- 这意味着真实的“纯执行时间占比”只会比现在看到的更低。

结论：

**用户感知的“很慢”，很大一部分其实是排队和等待，而不是某个模型本身在连续算那么久。**

---

## 6. frame-analysis 实际瓶颈

### 6.1 平均处理规模

从 `frameAnalysisPlugins` 字段统计得到：

- 有插件性能数据的任务样本数：`72`
- 平均每视频处理采样帧数：约 `959.78`

这与默认采样策略是吻合的：

- 排障起点时的长视频样本按 `2.5s` 一帧采样
- 一条约 40~45 分钟视频落在 900~1100 个采样点是正常的

### 6.2 插件级耗时

从插件指标统计得到：

| 插件 | 平均耗时 | P50 | P95 | 平均处理帧数 |
|---|---:|---:|---:|---:|
| `FaceRecognitionPlugin` | 340.49s | 339.29s | 411.03s | 959.78 |
| `DescriptorPlugin` | 327.26s | 326.17s | 362.45s | 959.78 |
| `DominantColorPlugin` | 69.17s | 67.54s | 88.75s | 959.78 |
| `TextDetectionPlugin` | 67.53s | 67.27s | 76.30s | 959.78 |
| `ObjectDetectionPlugin` | 8.96s | 8.91s | 9.88s | 959.78 |
| `ShotTypePlugin` | 0.06s | 0.06s | 0.06s | 959.78 |

这组数据非常关键。

它证明：

1. 当前帧分析最重的不是 `ObjectDetectionPlugin`
2. 真正的大头是：
   - `FaceRecognitionPlugin`
   - `DescriptorPlugin`

也就是说：

**当前阶段最值得优化的不是 YOLO，而是人脸链路和图像描述链路。**

### 6.3 为什么 frame-analysis 慢

#### 原因 1：seek-per-sample 解码

在 `python/services/analysis/processor.py:101`：

- 每个采样点都会 `seek`
- 然后 `decode` 到目标时间

这不是顺序 decode。

原理上会导致：

1. 大量随机访问
2. 频繁重新定位解码位置
3. 对长视频尤其低效

#### 原因 2：每帧串行跑插件

在 `python/services/analysis/plugins.py:93`：

- 每个 frame 进入 `process_frame`
- 插件按顺序执行

且在 `python/services/analysis/plugins.py:123`：

- `FaceRecognitionPlugin`
- `ObjectDetectionPlugin`

被视为 critical plugin，几乎每帧必跑。

#### 原因 3：重插件本身太重

`FaceRecognitionPlugin` 背后的人脸链路本身包含：

1. 人脸检测
2. 人脸识别
3. embedding
4. 情绪分析
5. 未知脸时可能回读原视频高分辨率帧

`DescriptorPlugin` 则会在大量采样帧上持续生成图像描述。

#### 原因 4：Python 实际分析并发很低

默认配置下：

- `AnalysisConfig.max_workers = 2`
- 进入服务后实际为 `2 // 2 = 1`

所以当前 frame-analysis 本质上是：

- 重计算
- 低并发
- 长视频顺序慢跑

---

## 7. scene 与 embedding 实际瓶颈

### 7.1 scene 数量膨胀

这是当前最核心的结构性放大器。

在 `packages/media-utils/src/utils/scenes.ts:128`：

- `for (const frame of analysis.frame_analysis)`
- 每个采样帧直接生成一个 scene

如果一条视频有约 `960` 个采样帧：

- 就会生成约 `960` 个 scene

后面带来的成本是：

1. 文本 embedding 要做约 `960` 条
2. 音频 embedding 要切约 `960` 段音频
3. 视觉 embedding 要抽约 `960 * 5 = 4800` 张关键帧图

### 7.2 scene-creation 后的并发结构

在 `apps/background-jobs/src/jobs/sceneCreation.ts:124`：

- `text-embedding`
- `audio-embedding`
- `visual-embedding`

三个子任务会一起派发。

这看起来是并行优化，但问题在于：

- 排障起点时 `audio-embedding` worker 并发固定为 `1`
- 排障起点时 `visual-embedding` worker 并发固定为 `1`

对应代码：

- `apps/background-jobs/src/jobs/audioEmbedding.ts:46`
- `apps/background-jobs/src/jobs/visualEmbedding.ts:50`

这意味着：

1. 单个视频内部，三路会一起开始
2. 但多个视频同时处理时，音频和视觉都只能单车道通行

所以一批视频导入后，后半段必然形成长队列。

### 7.3 visual embedding 为什么重

在 `packages/embedding-media/src/utils/visualEmbedding.ts:21`：

- 每个 batch 处理 10 个 scene
- 用 `Promise.all` 同时处理

而每个 scene 在 `packages/embedding-media/src/utils/visualEmbedding.ts:24`：

- 会抽 `5` 张关键帧
- 然后再做视觉 embedding

并且在 `packages/shared/src/constants/embedding.ts:2`：

- `VISUAL_BATCH_SIZE = 10`

所以一个 batch 实际上会触发：

- 10 个 scene
- 每个 scene 5 帧
- 一共约 50 张图
- 再叠加 10 路并发抽帧/清理/模型推理

这会带来：

1. ffmpeg 子进程暴增
2. 临时文件增多
3. 磁盘 I/O 和 GPU/CPU 瞬时峰值放大
4. 失败概率上升

### 7.4 audio embedding 为什么重

在 `packages/embedding-media/src/utils/audioEmbedding.ts:31`：

- 同样是 batch 内 `Promise.all`
- 每个 scene 都要切一段音频再做 CLAP

再叠加：

- `AUDIO_BATCH_SIZE = 10`

就会导致：

- 10 段音频同时切
- 10 路临时 wav 文件读写

### 7.5 后半段为什么既慢又容易失败

当前后半段是一个典型的“双层反模式”：

1. 排障起点时，全局上 `audio/visual` worker 只有 `1`
   - 导致多视频排长队
2. 单个 worker 内，又对一个 batch 的 10 个 scene `Promise.all`
   - 导致单 worker 内部瞬时高峰过大

结果是：

- 吞吐低
- 波峰高
- 平均延迟高
- 失败率高

这也解释了为什么失败会集中在 `embedding_visual`。

---

## 8. 统计口径与观测问题

### 8.1 `updatedAt` 被同时承担状态与时间含义

当前很多分析都是通过：

- `createdAt`
- `updatedAt`

去反推总耗时。

但 `updatedAt` 在每个阶段都会被刷新，来源是：

- `apps/background-jobs/src/services/videoIndexer.ts:35`

这会带来两个问题：

1. 它能说明“最后一次更新发生在什么时候”
2. 但不能说明“每个阶段到底排了多久队、执行了多久”

### 8.2 `updateJob()` 用 truthy 判断字段

在 `apps/background-jobs/src/services/videoIndexer.ts:41` 之后：

- `if (data.progress) ...`
- `if (data.overallProgress) ...`
- `if (data.sceneCreationTime) ...`

这会导致值为 `0` 的更新丢失。

虽然这不是当前最主要性能瓶颈，但它会让统计更不准确。

### 8.3 `video-finalization` 没有设置最终 stage

在 `apps/background-jobs/src/jobs/videoFinalization.ts` 中：

- 只更新了 `status = done`
- 没有更新最终 `stage`

所以数据库里会出现大量：

- `status = done`
- `stage = embedding_visual`

这会让“按 stage 看完成状态”产生误导。

### 8.4 Python stage metrics 有重叠与失真

在 `python/services/analysis/service.py:99`：

- `frame_generator` 创建后马上读取 extraction metrics

而真正的 frame 提取是在后续迭代过程中发生的。

这意味着：

- 某些 stage metrics 的口径存在重叠或时序偏差

因此：

- 插件级统计可信度更高
- stage 级统计只能辅助参考，不能直接机械相加归因

---

## 9. 为什么慢：原理层解释

### 9.1 不是真镜头，而是“采样点爆炸”

当前系统没有把视频切成少量“有意义的镜头段”，而是把采样点本身当成 scene。

原理后果：

- 采样越细
- scene 越多
- 后续 embedding 成本线性上涨

### 9.2 前半段慢在重分析

frame-analysis 慢的本质是：

1. `seek -> decode`
2. 每帧跑多插件
3. 最重的是人脸与图像描述

原理后果：

- 这不是单个模型“快不快”的问题
- 而是一次分析里被串了很多重步骤

### 9.3 后半段慢在排队

后半段慢的本质是：

1. 任务数大
2. worker 并发低
3. 同时又有 batch 内局部峰值

原理后果：

- 单任务执行时间不一定夸张
- 但总墙钟时间会被排队严重放大

### 9.4 硬件没有被真正喂饱

虽然机器很强：

- 96 线程
- 多张 3090
- 大内存

但当前架构没有把吞吐打平：

- Python 分析有效并发很低
- embedding GPU 初始化存在 race
- 多卡没有被合理利用

所以不是“硬件不够”，而是“架构没把硬件转成吞吐”。

---

## 10. 当前主瓶颈排序

综合代码与现网数据，本项目当前主瓶颈排序如下：

### P0：`background-jobs` 当前未监听 `4000`

这是当前现网第一阻塞项。

如果 `background-jobs` 不工作：

- 新任务不会继续推进
- BullMQ worker 不会消费
- 任何性能改动都没法在现网验证

### P1：scene 数量膨胀

这是结构性最大放大器。

根因：

- 采样帧直接变 scene

影响：

- 把后半段文本、音频、视觉 embedding 成本全部线性放大

### P1：frame-analysis 的人脸与描述链路过重

根因：

- 每个采样帧都跑重插件

影响：

- 前半段持续高耗时

### P1：排障起点时的 `audio/visual embedding` 单 worker 队列瓶颈

根因：

- 排障起点时全局并发固定为 `1`

影响：

- 多视频批量导入时，后半段排队显著

### P1：worker 内 batch `Promise.all` 过猛

根因：

- 单个 batch 内 10 个 scene 同时抽帧/切音频/推理

影响：

- 容易制造局部 I/O 和模型推理峰值
- 稳定性下降

### P1：Node/Python 并发不匹配

根因：

- Node 队列并发和 Python 实际吞吐没有统一治理

影响：

- 一旦并发拉高，等待会快速放大

### P2：GPU 初始化竞态

根因：

- `USE_GPU` 异步初始化
- 模型第一次加载时就缓存 device

影响：

- 某些 embedding 任务可能悄悄跑到 CPU

### P2：观测与统计口径不准

根因：

- `updatedAt` 复用
- 0 值更新丢失
- 最终 stage 不准确

影响：

- 容易误判真正瓶颈

---

## 11. 优化建议与优先级

下面按“收益/风险/实施顺序”给出建议。

### 11.1 第一阶段：先恢复可运行、可观测

#### 1. 恢复 `background-jobs` 服务

目标：

- 先让任务链路重新可跑

建议：

1. 检查容器是否退出
2. 检查启动命令与端口映射
3. 检查环境变量是否完整
4. 检查 `SESSION_SECRET / DATABASE_URL / REDIS` 相关配置

预期收益：

- 恢复新任务推进能力

#### 2. 拆分排队时间与执行时间

目标：

- 不再用 `createdAt -> updatedAt` 粗糙推理阶段耗时

建议：

为 `Job` 增加：

- `transcriptionQueuedAt / StartedAt / FinishedAt`
- `frameAnalysisQueuedAt / StartedAt / FinishedAt`
- `sceneCreationQueuedAt / StartedAt / FinishedAt`
- `textEmbeddingQueuedAt / StartedAt / FinishedAt`
- `audioEmbeddingQueuedAt / StartedAt / FinishedAt`
- `visualEmbeddingQueuedAt / StartedAt / FinishedAt`
- `finalizationQueuedAt / StartedAt / FinishedAt`

原理：

- 先把“排队慢”和“执行慢”拆开
- 后续所有优化才能评估真实收益

#### 3. 修正状态写入与观测

建议：

1. `updateJob()` 改为 `!== undefined` 判断
2. `video-finalization` 写最终 stage
3. 明确每个阶段开始和结束事件

预期收益：

- 监控可信度显著提升

### 11.2 第二阶段：先砍最大放大器

#### 4. 不要再让“采样帧 = scene”

这是最高收益项。

建议有两条路线：

##### 路线 A：快速止血

- 把 `sample_interval_seconds` 从 `2.5` 提高到 `5` 或 `10`

优点：

- 改动最小
- 立刻减少 scene 数

缺点：

- 会牺牲一定细粒度召回

##### 路线 B：正确演进

- 做真正的镜头合并
- 多个连续采样帧合成一个 scene

优点：

- 保留更合理的语义分段

缺点：

- 开发成本更高

原理：

- 后半段成本基本与 scene 数成线性关系
- scene 数砍半，text/audio/visual 的总成本大致也会跟着大幅下降

### 11.3 第三阶段：压缩 frame-analysis 成本

#### 5. 对重插件做跳帧

建议优先级：

1. `FaceRecognitionPlugin`
2. `DescriptorPlugin`
3. `TextDetectionPlugin`

建议策略：

- `FaceRecognitionPlugin`：每 `3~5` 个采样帧跑一次
- `DescriptorPlugin`：每 `3~5` 个采样帧跑一次
- `TextDetectionPlugin`：每 `3~5` 个采样帧跑一次
- `ObjectDetectionPlugin`：可保持高频

原理：

- 现在最重的不是 YOLO，而是人脸与图像描述
- 对它们降频，收益会远大于优化轻插件

#### 6. 改顺序 decode，减少 seek

建议：

- 将 `processor.py` 从“每采样点 seek”改成“顺序 decode + 条件采样”

原理：

- 顺序 decode 更符合视频解码器特性
- 尤其适合长视频

#### 7. 人脸链路二阶段处理

建议：

第一阶段：

- 只做人脸检测与基本聚类

第二阶段：

- 只对高价值 scene 或抽样帧做精细识别与情绪分析

原理：

- 人脸链路现在太重，不应该无差别全量逐帧执行

### 11.4 第四阶段：优化 embedding 吞吐

#### 8. 提高 `audio/visual` worker 并发，但不要猛拉

当前：

- `audio = 1`
- `visual = 1`

建议初值：

- `audio = 2`
- `visual = 2`

不要一口气提到很高。

原理：

- 先验证可稳定提升吞吐
- 再逐步扩容

#### 9. 把 batch 内部 `Promise.all` 改成受控并发

当前：

- `VISUAL_BATCH_SIZE = 10`
- `AUDIO_BATCH_SIZE = 10`
- batch 内对 10 个 scene 全并发

建议：

1. batch size 先降到 `4`
2. 内部并发改成 `2~3`

原理：

- 降低局部峰值
- 提高稳定性
- 让吞吐更平滑

#### 10. 把视觉抽帧数量从 5 降到 3 做 A/B 测试

当前：

- 每个 scene 抽 5 帧

建议：

- 先试 3 帧版本

原理：

- 视觉成本和抽帧数接近线性相关
- 在语义冗余较高的短 scene 中，5 帧不一定显著优于 3 帧

#### 11. 音频 embedding 增加更强的跳过策略

建议：

1. 没有音轨直接跳
2. 超短 scene 可跳
3. 静音段可跳

原理：

- 音频 embedding 的业务价值通常不是每个 scene 都一样高

### 11.5 第五阶段：打通 GPU 与多卡利用

#### 12. 修 GPU 初始化竞态

建议：

1. 不要异步设置全局 `USE_GPU`
2. 在模型第一次加载时同步判断设备
3. 启动时显式记录模型到底加载到了 CPU 还是 CUDA

原理：

- 避免静默跑到 CPU

#### 13. 让视频索引与 Ollama 隔离 GPU

建议：

1. 给 Ollama 固定 GPU
2. 给 Python ML / embedding 固定另一张或多张 GPU

原理：

- 避免推理服务互抢同一张卡

#### 14. 逐步验证多卡策略

建议顺序：

1. 先确认 embedding 是否已稳定用上单卡 GPU
2. 再做多 worker、多 GPU 分配

原理：

- 先把单卡利用跑顺
- 再做多卡扩展

---

## 12. 不建议优先做的事

### 12.1 不建议先换聊天模型

原因：

- `Gemini/Ollama` 不是视频索引主链路的主耗时
- 先换模型对当前“处理很慢”帮助不大

### 12.2 不建议先盲目猛拉 worker 并发

原因：

- 当前瓶颈不是单纯“并发不够”
- 如果在 scene 数量和 batch 峰值不改的前提下猛拉并发，只会让局部资源竞争更严重

### 12.3 不建议先做检索效果调优

原因：

- 现阶段更紧迫的是：
  - 不要卡住
  - 不要大量失败
  - 阶段耗时要可解释

---

## 13. 推荐实施顺序

建议按下面顺序推进：

### 第 1 批

1. 恢复 `background-jobs`
2. 增加阶段级 `queuedAt/startedAt/finishedAt`
3. 修正 `updateJob()` 的 0 值更新
4. 给 `video-finalization` 写最终 stage

目标：

- 先恢复可运行与可观测

### 第 2 批

1. 把采样间隔从 `2.5s` 提高到 `5s`
2. `FaceRecognitionPlugin / DescriptorPlugin / TextDetectionPlugin` 改跳帧
3. 验证 frame-analysis 耗时下降比例

目标：

- 先砍掉前半段和 scene 数膨胀的大头

### 第 3 批

1. `audio/visual` worker 并发调到 `2`
2. batch size 从 `10` 改为 `4`
3. `Promise.all` 改为受控并发
4. 视觉抽帧从 `5` 试到 `3`

目标：

- 先把后半段从“高排队+高失败”拉回可控区间

### 第 4 批

1. 把 seek-per-sample 改为顺序 decode
2. 做真正的 scene 合并
3. 打通 GPU 初始化与多卡调度

目标：

- 做中长期正确架构

---

## 14. 最终结论

本项目当前的慢，已经可以明确归因为以下组合问题：

1. **scene 数量设计错误**
   - 采样帧直接变 scene
2. **frame-analysis 过重**
   - 尤其是人脸和图像描述
3. **后半段吞吐过低**
   - `audio/visual` 全局 worker 默认并发虽已提升到 `2`，但仍容易形成排队
4. **batch 峰值过高**
   - worker 内部又对 10 个 scene 全并发
5. **上下游并发没打通**
   - Node 和 Python 吞吐不一致
6. **GPU 没有稳定被正确利用**
7. **现网当前还存在 `background-jobs` 服务未监听的问题**

因此，当前最正确的策略不是“先换模型”，而是：

1. 先恢复调度服务
2. 先把观察口径做准
3. 先把 scene 数量砍下来
4. 先把最重插件降频
5. 再治理 embedding 吞吐
6. 最后再做更深的架构升级

如果按这个顺序推进，项目会先从：

- “慢、容易堆积、还容易失败”

变成：

- “能稳定跑、耗时可解释、吞吐逐步提升”

这才是后续做效果优化、模型替换、检索优化的正确基础。

---

## 15. 双实例运行冲突分析

本节回答一个单独但非常实际的问题：

**如果在同一台机器上同时运行两套 Edit Mind，会不会冲突？**

答案是：

**会，而且不只是端口冲突。**

如果“原样复制一份仓库再启动第二套”，第二套大概率会：

1. 直接因为端口或容器名冲突而启动失败；
2. 或者虽然能启动，但和第一套实例共享数据库、队列、向量集合、缓存或文件目录，最终变成“数据混在一起跑”。

也就是说：

- “两套都能启动”
- 不等于
- “两套是独立实例”

### 15.1 当前仓库对多实例不友好的设计点

#### 1. `container_name` 被写死

在 `docker-compose.yml` 中：

- `edit-mind-background-jobs`
- `edit-mind-web`
- `edit-mind-chroma`
- `edit-mind-redis`
- `edit-mind-postgres`
- `edit-mind-ml`

都被固定写死。

这意味着：

1. 即使第二套使用不同的 Compose project name
2. 只要还是用同一份 compose 文件
3. 就会直接因为容器名冲突而失败

结论：

**如果要并行跑两套，当前 compose 文件必须先去掉或参数化 `container_name`。**

#### 2. 宿主机端口默认固定

当前默认端口是：

- Web: `3745`
- Background Jobs: `4000`
- Postgres: `5432`
- Redis: `6379`
- Chroma: `8000`
- ML: `8765`

这已经在 `docs/installation-conflict-resolution.md` 中被明确指出过。

结论：

**第二套实例如果不改宿主机映射端口，会直接端口冲突。**

#### 3. 浏览器 session cookie 名固定

在 `apps/web/app/services/session.ts`：

- 生产环境 cookie 名固定为 `__session`
- 开发环境固定为 `__session_dev`

这意味着：

1. 如果两套实例都从同一域名访问
2. 哪怕只是不同端口
3. 浏览器 cookie 也可能互相覆盖

后果包括：

1. 登录态串用
2. 一套登录后另一套异常登出
3. 如果 `SESSION_SECRET` 或数据库不同，则 session 可能直接失效

结论：

**当前仓库并没有为双实例提供可配置的 session cookie name。**

#### 4. BullMQ 队列名固定

在 `apps/background-jobs/src/queue.ts`，队列名全部是固定字符串：

- `transcription`
- `frame-analysis`
- `scene-creation`
- `text-embedding`
- `audio-embedding`
- `visual-embedding`
- `video-finalization`
- 以及聊天、导出、人脸相关队列

这意味着：

1. 如果两套实例共用同一个 Redis
2. 两套 worker 会连接到同一组 BullMQ 队列
3. 它们不会保持隔离，而会互相消费同一批任务

这时系统的真实语义就不再是：

- “两套独立实例”

而会变成：

- “一个共享 Redis 队列的多 worker 集群”

这不一定错，但这不是两套独立环境。

#### 5. 搜索缓存 key 也没有实例前缀

当前搜索缓存 key 使用固定前缀，例如：

- `search:suggestions:v1:`
- `search:suggestions:stats:v1`
- `search:suggestions:popular:v1`

如果两套实例共用一个 Redis：

- 搜索缓存也会互相污染或覆盖

#### 6. Chroma 集合名固定

在 `packages/vector/src/constants/index.ts`：

- `COLLECTION_NAME = 'video_content'`

在 `packages/vector/src/services/client.ts` 中，会固定创建：

- `video_content`
- `video_content_visual`
- `video_content_audio`

这意味着：

1. 如果两套实例共用同一个 Chroma
2. 默认一定写进同一组集合

后果包括：

1. 文本向量混在一起
2. 视觉向量混在一起
3. 音频向量混在一起
4. 一套实例做删除、重建或重索引时，会影响另一套实例的向量数据

尤其在 `apps/background-jobs/src/jobs/sceneCreation.ts` 中：

- 每次 scene 创建后，会调用 `deleteByVideoSource(videoPath)`

而 `deleteByVideoSource()` 在 `packages/vector/src/services/db.ts` 中会直接按 `source` 删除：

- 文本集合
- 视觉集合
- 音频集合

所以如果两套实例：

1. 共享同一个 Chroma
2. 又恰好处理同一路径的视频

那一套重建向量时，完全可能删掉另一套的向量。

#### 7. `/app/data` 默认也是共享风险点

在 `.env.system.example` 中：

- `PROCESSED_VIDEOS_DIR=/app/data`
- `THUMBNAILS_PATH=/app/data/.thumbnails`
- `FACES_DIR=/app/data/.faces`
- `UNKNOWN_FACES_DIR=/app/data/.unknown_faces`
- `STITCHED_VIDEOS_DIR=/app/data/.stitched-videos`

而在 `docker-compose.yml` 中：

- `web`
- `background-jobs`
- `ml`

都挂载了：

- `.data:/app/data`

这意味着如果两套实例共享同一个宿主机数据目录，就会共享：

1. 分析中间结果
2. 转录 JSON
3. 场景 JSON
4. 缩略图
5. 已知/未知人脸库
6. 导出结果

#### 8. 中间文件路径只按 `videoPath` 哈希

在 `apps/background-jobs/src/services/videoIndexer.ts`：

- 处理目录用 `sha256(videoPath)` 计算

这意味着：

1. 两套实例如果处理同一个视频路径
2. 又共享同一个 `PROCESSED_VIDEOS_DIR`
3. 会落到同一个中间目录

结果可能是：

1. `analysis.json` 互相覆盖
2. `transcription.json` 互相覆盖
3. `scenes.json` 互相覆盖
4. `video-finalization` 清理时把对方仍在使用的目录删掉

#### 9. 文件夹 watcher 会重复监听

在 `apps/background-jobs/src/watcher.ts`：

- 后台服务启动时会从数据库读取 folder，并为其初始化 watcher

如果两套实例：

1. 共用同一个数据库
2. 共用同一套媒体目录
3. 都启动了 watcher

那么新视频落盘时，完全可能被两套同时发现并各自建任务。

结果就是：

- 重复索引
- 重复任务
- 重复写向量
- 重复清理临时文件

#### 10. GPU 与模型缓存虽然不是“命名冲突”，但会资源竞争

如果两套实例都启用：

- Python ML
- embedding 模型
- ffmpeg 抽帧/切音频

那它们就会在同一台机器上竞争：

1. GPU
2. 磁盘 I/O
3. 临时目录
4. 模型缓存目录

这类冲突不是“起不来”，但会直接让两套都更慢、更不稳定。

### 15.2 两种不同目标要分开讨论

这里必须区分两种目标：

#### 目标 A：两套完全独立实例

这意味着：

1. 两套各有自己的 Web
2. 各有自己的 Postgres
3. 各有自己的 Redis
4. 各有自己的 Chroma
5. 各有自己的 `/app/data`
6. 登录态、任务、向量、缓存、文件、人脸库都不互通

这是严格意义上的“两套项目”。

#### 目标 B：同一套环境的多副本

这意味着：

1. 多个 Web 实例
2. 多个 Background worker 实例
3. 共享同一 Postgres / Redis / Chroma / `/app/data`

这种模式不是两套独立系统，而是：

- 同一个系统的横向扩容

这时“共享”是设计目标，而不是冲突。

但这仍然需要处理：

1. watcher 重复触发
2. 任务幂等
3. session 一致性
4. 负载均衡

### 15.3 如果直接运行两套，会冲突到什么程度

综合当前仓库实现，冲突严重度如下：

| 冲突项 | 严重度 | 说明 |
|---|---|---|
| 容器名冲突 | P0 | 第二套直接起不来 |
| 宿主机端口冲突 | P0 | 第二套直接起不来 |
| 共享 Postgres | P0 | 业务数据混合，不再独立 |
| 共享 Redis 队列 | P0 | worker 会消费同一队列，不再独立 |
| 共享 Chroma | P0 | 向量数据混合，重建时还可能互删 |
| 共享 `/app/data` | P0 | 中间文件、人脸、缩略图、导出互相覆盖或误删 |
| 共享 watcher | P1 | 会重复建任务 |
| 共享 cookie 名 | P1 | 浏览器登录态互相覆盖 |
| GPU 资源竞争 | P2 | 两套都变慢，但不一定直接失败 |

结论：

**当前仓库默认配置下，两套并行运行不是“有点风险”，而是“默认一定会冲突”。**

---

## 16. 如何避免双实例冲突

### 16.1 如果要跑“两套完全独立实例”

这是当前最安全的原则：

#### 1. 去掉或参数化 `container_name`

否则第二套容器连创建都过不了。

推荐做法：

- 删除 `container_name`
- 交给 Compose project name 自动命名

#### 2. 使用不同的 Compose project name

例如：

- `editmind-a`
- `editmind-b`

这样网络、卷、容器默认名才会被自动隔离。

#### 3. 宿主机端口全部分开

第二套至少要改：

- `3745`
- `4000`
- `5432`
- `6379`
- `8000`
- `8765`

建议用 `docker-compose.override.yml` 只改宿主机映射，不改容器内部通信端口。

#### 4. Postgres 必须隔离

方式有两种：

1. 每套独立 Postgres 容器和数据卷
2. 共用一个 Postgres 服务，但使用不同 database/schema 和不同连接串

对于当前项目，最简单安全的是：

- 每套一份独立 Postgres

#### 5. Redis 必须隔离

最安全做法：

- 每套实例使用独立 Redis

因为当前项目：

1. BullMQ 队列名没有实例前缀
2. 搜索缓存 key 也没有实例前缀

所以共用 Redis 基本一定串。

#### 6. Chroma 必须隔离

最安全做法：

- 每套实例使用独立 Chroma

因为当前集合名固定为：

- `video_content`
- `video_content_visual`
- `video_content_audio`

如果非要共用一个 Chroma，就必须先把：

- `COLLECTION_NAME`

做成实例级可配置。

但当前仓库并没有这样做。

#### 7. `/app/data` 必须隔离

每套实例必须有独立目录，例如：

- `./.data-a:/app/data`
- `./.data-b:/app/data`

否则中间文件和业务衍生文件一定串。

#### 8. session cookie 名最好隔离

如果两套实例都从同一域名访问，建议：

1. 使用不同子域名；或者
2. 把 session cookie name 改成可配置

否则固定的 `__session` / `__session_dev` 会互相覆盖。

#### 9. GPU 资源最好显式分配

建议：

1. 一套绑定部分 GPU
2. 另一套绑定另一部分 GPU
3. Ollama 单独固定 GPU

否则两套实例和 Ollama 会互相争抢推理资源。

### 16.2 如果要跑“同一套环境的多副本”

这种模式是可行的，但要接受一个事实：

**这不叫两套项目，而叫一个项目的横向扩容。**

这种模式下应该：

#### 1. 共享同一套 Postgres / Redis / Chroma / `/app/data`

因为大家本来就在处理同一批业务数据。

#### 2. Web 可以多副本

前提：

1. 都指向同一 Postgres
2. 都使用同一 `SESSION_SECRET`
3. 都走同一套 background-jobs API 地址

#### 3. Background worker 可以多副本，但要处理 watcher

当前最大问题是 watcher。

如果多个 background-jobs 实例都启动 watcher：

- 同一文件夹新增文件会被重复监听
- 很可能重复建任务

所以多副本模式下建议：

1. 只保留一个 watcher 实例；或者
2. 给 watcher 做 leader election / 单实例开关；或者
3. 去掉 watcher，改由显式扫描/导入任务

#### 4. 共享 `/app/data`

因为 background-jobs 与 ml 通过共享 JSON 文件协作。

如果 worker 多副本而 `/app/data` 不共享：

- 一个实例写的中间文件
- 另一个实例可能读不到

这会直接导致任务失败。

### 16.3 最小安全结论

如果你的目标是：

#### “两套完全独立实例”

你至少必须同时隔离：

1. Compose project name
2. 容器名
3. 宿主机端口
4. Postgres
5. Redis
6. Chroma
7. `/app/data`
8. 浏览器 session cookie 或访问域名

缺一不可。

#### “一个环境多副本”

你应该共享：

1. Postgres
2. Redis
3. Chroma
4. `/app/data`

但必须额外处理：

1. watcher 重复建任务
2. 幂等与去重
3. GPU 资源分配

### 16.4 推荐方案

结合当前仓库状态，最推荐的方案是：

#### 方案 A：真正独立的双实例

适用场景：

- 测试环境和生产环境并存
- 两个团队各跑一套
- 需要完全隔离的数据与权限

建议做法：

1. 第二套使用不同 project name
2. 删除 `container_name`
3. 用 override 文件改单独宿主机端口
4. 每套各自独立 Postgres / Redis / Chroma / `/app/data`
5. 最好使用不同子域名访问，避免 cookie 冲突

这是最稳的方式。

#### 方案 B：同一环境多副本扩容

适用场景：

- 只想提高吞吐
- 不是想维护两份独立数据

建议做法：

1. 多开 web 副本
2. 多开 background worker 副本
3. 共享 Postgres / Redis / Chroma / `/app/data`
4. 关闭除一个实例之外的 watcher

这个方案适合扩容，但不适合环境隔离。

---

## 17. 双实例问题的最终结论

当前项目如果“直接再启动一套”，会发生的不是“部分冲突”，而是：

1. 启动层会因为容器名和端口先撞上；
2. 即使把端口改开，数据层也会因为 Postgres / Redis / Chroma / `/app/data` / cookie / watcher 继续发生冲突；
3. 如果这些都不隔离，第二套实例并不会成为独立系统，而是变成对第一套的混入、污染或伪集群。

所以正确结论是：

**当前仓库默认状态不支持安全地同时跑两套独立实例。**

要实现这一点，必须把：

- 容器命名
- 端口映射
- 数据库
- 队列
- 向量库
- 文件存储
- session

一起纳入隔离设计，而不是只改一个 `.env` 端口字段。

---

## 18. `docs/` 中性能说明与当前证据的对照分析

这一节专门回答一个问题：

**`docs/` 里关于性能的说明，到底哪些是对的，哪些地方会把人带偏？**

### 18.1 说对了的部分

以下判断，和本次代码检查、数据库样本、队列状态、GPU/CPU 快照是基本一致的：

#### 1. 不能盲目把并发拉满

`docs/COMPLETE_ENVIRONMENT_ANALYSIS.md` 已经明确提醒：

- 机器虽然高配
- 但应先从 `1 / 1` 跑通
- `audio/visual embedding` 当前默认 worker 并发已是 `2`
- Node 并发调高，不等于端到端吞吐同步提升

这与本次现网观察完全一致。

#### 2. GPU 有帮助，但不是端到端慢的唯一解释

`docs/COMPLETE_ENVIRONMENT_ANALYSIS.md` 也已经指出：

- GPU 对转录和视觉分析通常有明显帮助
- 但端到端速度还受 `5s` 采样、多插件顺序执行、embedding 排队和 Node/Python 并发未打通影响

这和本报告结论一致：

- 当前不是整机算力被打满
- 而是流水线结构把吞吐卡住了

#### 3. 公开 benchmark 不能直接当成当前仓库实测

`docs/性能基准对比分析_Part1_转录性能.md` 已经做了一个很重要的口径修正：

- 当前默认模型是 `medium`
- 公开资料里 `RTX 3090 / large-v3 / 多 GPU` 的数字不能直接当本仓库实测
- 端到端耗时不能只从转录阶段外推

这个修正是对的，而且非常关键。

#### 4. 阶段时间里会混入非纯推理成本

`docs/COMPLETE_ENVIRONMENT_ANALYSIS.md` 已经提醒：

- `transcriptionTime`
- `frameAnalysisTime`

更像“阶段开始后的总耗时”，会混入进程往返、等待和内部开销，而不是单纯模型推理时间。

这和本次从 `Job` 表推出来的结论完全吻合：

- 用户体感的“很慢”，大量来自排队和等待
- 不是某个模型始终连续满负荷运行那么久

### 18.2 `docs/` 里存在的主要问题

虽然文档里已经有不少自我修正，但仍然存在几个明显问题。

#### 1. “公开 benchmark” 和 “当前项目端到端现实” 仍然混得太近

问题最典型地出现在：

- `docs/架构师验证报告_视频搜索领域竞品与技术方案深度调研.md`
- `docs/架构师验证报告_视频搜索领域竞品调研.md`
- `docs/US-008_用户案例与实际部署经验.md`

这些文档里经常会出现：

- GPU 提升 `2-5x`
- 批处理提升 `3-5x`
- “4090 处理 1 小时视频约 10-18 分钟”
- “升级 Qdrant / GPU 批处理即可明显提速”

这些说法单看某个子模块、某种模型、某个竞品或者公开测试，很多并不假；但它们不是当前这套代码的端到端真相。

当前仓库真正决定总耗时的是：

1. `5s` 一帧采样
2. 每个采样帧都跑重插件
3. 每个采样帧直接变一个 scene
4. scene 后继续放大到文本、音频、视觉 embedding
5. `audio/visual` worker 默认并发虽然已是 `2`，但后半段仍可能形成排队

所以：

**文档里的“模型 benchmark”多数只能解释局部算子速度，解释不了整条链路为什么慢。**

#### 2. 有些文档把“启用 GPU / 提高并发”说成了主要解法，但这在当前架构下不够成立

比如 `docs/US-008_用户案例与实际部署经验.md` 的“视频处理缓慢”排查项，重点是：

- GPU 是否启用
- 并发配置是否过低
- 磁盘 I/O 是否瓶颈

这当然都是要检查的，但对当前项目来说，这个结论是不完整的。

原因是：

- 现在 GPU 并没有被稳定喂满
- 现在慢的主因是 scene 放大、重插件、后段排队
- 如果在 scene 数量和 batch 峰值不变前提下直接拉并发，只会把局部峰值和失败率一起抬高

也就是说：

**当前更大的问题不是“算力不够”，而是“工作负载设计和流水线节拍不对”。**

#### 3. 文档把向量数据库性能放得比较靠前，但这不是当前首要矛盾

调研文档里多次给出：

- Chroma 适合小规模
- Qdrant/Milvus 更适合大规模
- 向量库升级能提升性能

这在“未来规模扩展”和“搜索查询延迟”层面是合理的。

但对当前这套现网来说，首要问题并不是：

- 搜索查得慢
- 或 Chroma 已经成为当前端到端索引主瓶颈

当前更明确的事实是：

- 主要慢在索引链路前中段和后半段队列
- scene 和 embedding 数量被前置设计放大了
- `embedding_visual` 失败最集中

所以：

**现在立刻把 Qdrant 当成首要性能药方，优先级是偏高估的。**

它更像“未来扩展优化”，不是当前“为什么很慢”的第一答案。

#### 4. 文档链条本身并不完整，存在“被引用但缺失”的性能总报告

多个文档反复引用：

- `docs/性能基准对比分析报告.md`

并写到：

- 该文档有 `685` 行
- 包含 Part 1~4 的完整性能分析

但本次实际检查 `docs/` 时，只看到了：

- `docs/性能基准对比分析_Part1_转录性能.md`

没有看到被反复引用的完整总报告文件。

这会带来两个问题：

1. `US-007` 的证据链不完整
2. 后续读文档的人会误以为“完整 benchmark 已经在仓库里落盘可复核”

这个问题不是性能本身，但会影响性能结论的可信度。

#### 5. 用户案例文档容易把“通用经验”误读成“当前项目已复验事实”

`docs/US-008_用户案例与实际部署经验.md` 很适合作为：

- 运维 checklist
- 常见问题手册
- 一般型部署经验

但它的问题是：

- 里面很多是竞品经验、社区经验、行业经验
- 不是当前这台机器、当前这套 Compose、当前这套代码的压测结论

如果把它直接当成本项目现网瓶颈诊断，就容易得出：

- “主要是 GPU 没开”
- “主要是 Chroma 慢”
- “主要是硬件还不够”

而这与本次现网证据并不一致。

### 18.3 按当前优化方案，能不能优化

**能，而且理论上是可以明显优化的。**

但要分清两件事：

1. **我们已经完成的是诊断和优先级排序，不是所有优化都已落地**
2. **当前可给的是理论收益区间，不是已经实测兑现的承诺值**

按当前架构，最有把握的优化点如下。

#### 1. 先减少 scene 数量

这是收益最大的第一刀。

因为当前 `createScenes()` 是：

- 每个采样帧直接生成一个 scene

所以 scene 数量和后续 embedding 工作量几乎线性绑定。

如果：

- 采样从 `2.5s` 放宽到 `5s`

或者：

- 仍按 `2.5s` 抽样，但把相邻高相似帧合并成更长 scene

理论效果都会非常明显。

#### 2. 对重插件降频，而不是先去动轻插件

当前数据库样本已经证明：

- 最重的是 `FaceRecognitionPlugin`
- 其次是 `DescriptorPlugin`
- `ObjectDetectionPlugin` 反而很轻

所以最有效的不是优先折腾 YOLO，而是：

- 人脸识别降频
- 图像描述降频
- OCR 适度降频

#### 3. 把 seek-per-sample 改为顺序 decode

当前 `processor.py` 的提帧方式是：

- 每个采样点单独 seek
- seek 后 decode 到目标点
- 然后 break

这类方式对长视频和长 GOP 不友好。

改成：

- 顺序 decode
- 按时间条件抽样

更符合视频解码器工作方式。

#### 4. 修后半段的“单 worker + 内部全并发”反模式

当前后半段的问题不是单纯“并发太低”。

而是：

1. worker 级别：`audio=1`、`visual=1`
2. batch 级别：一次 `10` 个 scene 全 `Promise.all`

这会导致：

- 宏观吞吐低
- 微观峰值高

正确方向是：

- worker 并发小步上调
- batch size 下降
- 内部并发改成受控并发

#### 5. GPU 修正和多卡隔离会提升稳定性，但不是第一刀

这项优化的意义更偏：

- 防止静默落到 CPU
- 防止和 Ollama 抢卡
- 提升吞吐上限

它是重要优化，但不是当前“为什么慢”的最前排原因。

### 18.4 理论收益区间

下面给出的是按当前代码结构推算的**理论区间**。

这些数字：

- 不是现网已经兑现的结果
- 不是严格相加关系
- 需要在修复 `background-jobs` 可运行性和补齐观测后再压测验证

#### 1. scene 压缩

做法：

- 采样间隔从 `2.5s` 调到 `5s`
- 或相邻帧合并为 scene

理论依据：

- 当前 scene 与采样帧近似 `1:1`
- 文本/音频/视觉 embedding 的工作量与 scene 数量近似线性相关

理论收益：

- scene 数量约下降 `40%~60%`
- 后半段 embedding 工作量约下降 `40%~60%`
- 端到端总耗时常见可见 `1.5x~2.3x` 改善

这是最值得先做的一项。

#### 2. 重插件降频

做法：

- `FaceRecognitionPlugin` 每 `3~5` 帧执行一次
- `DescriptorPlugin` 每 `3~5` 帧执行一次
- `TextDetectionPlugin` 每 `3~5` 帧执行一次

理论依据：

- 当前这三项远重于 YOLO
- 对它们降频会直接减少 frame-analysis 主要计算量

理论收益：

- `frame-analysis` 阶段有机会下降 `40%~70%`
- 对端到端总耗时，常见可折算为 `20%~45%` 改善

前提是业务允许适度降低帧级覆盖率。

#### 3. 顺序 decode 替代 seek-per-sample

做法：

- 将提帧策略从“每个采样点 seek 一次”改成“顺序 decode + 条件抽样”

理论依据：

- 随机 seek 通常只能跳到邻近关键帧
- 然后仍需向前 decode 到目标时间
- 长视频上重复 seek 会放大容器定位和重复 decode 成本

理论收益：

- 提帧/解码子阶段常见可降 `20%~50%`
- 对总耗时的改善依素材编码和 GOP 结构差异较大

#### 4. embedding 吞吐治理

做法：

- `audio/visual` worker 并发从 `1` 小步提高到 `2`
- batch size 从 `10` 下调到 `4`
- 内部 `Promise.all` 改为 `2~3` 路受控并发

理论依据：

- 这是典型的流水线均衡问题
- 当前后半段是单车道入口配高峰式内部并发，导致等待高、波峰高、失败率高

理论收益：

- 单视频纯执行时间不一定大幅下降
- 但批量导入的墙钟时间通常会明显下降
- 对批量场景，后半段总完成时间有机会改善 `1.3x~2.5x`
- 同时失败率预计会下降

#### 5. 视觉抽帧从 5 降到 3

做法：

- 每个 scene 的视觉关键帧由 `5` 张先试到 `3` 张

理论依据：

- 当前视觉成本与抽帧数近似线性相关
- 短 scene 内相邻帧语义冗余通常较高

理论收益：

- 视觉 embedding 子阶段理论上约可减少 `30%~40%` 工作量
- 对总耗时的实际改善取决于视觉阶段在整体占比中的权重

#### 6. GPU 初始化修复与 GPU 隔离

做法：

- 修掉异步 `USE_GPU`
- 启动时记录模型设备
- 给视频索引与 Ollama 分卡

理论依据：

- 如果当前存在静默 CPU fallback，局部阶段会被显著拖慢
- 如果与 Ollama 抢同一卡，则推理阶段波动会放大

理论收益：

- 这项收益波动很大
- 如果原来已稳定跑在 GPU，上限提升可能有限
- 如果原来有部分任务落到 CPU，局部阶段可能出现数倍改善

更准确地说，这项首先提升的是**正确性与稳定性**，其次才是速度。

### 18.5 综合判断：能优化多少

如果按正确顺序推进：

1. 先恢复 `background-jobs`
2. 先补齐排队/执行分离观测
3. 先压 scene 数量
4. 再压重插件
5. 再治理 embedding 吞吐
6. 最后修 GPU 稳定性和多卡利用

那么对当前这类：

- 长视频
- 默认 `5s` 采样
- 多视频批量导入

的场景，理论上实现：

- **`2x~4x` 级别的总墙钟改善**

是有现实依据的。

但要强调：

1. 这不是把文档里所有“`2x`、`3x`、`5x`”直接累加出来的结果
2. 这依赖于前几个结构性问题确实被改掉
3. 如果只做 GPU 或只拉并发，而不动 scene 和重插件，收益会明显低于这个区间

### 18.6 理论依据与参考

本次判断主要来自三类依据：

#### A. 当前仓库代码与现网证据

- `packages/media-utils/src/utils/scenes.ts`
- `python/services/analysis/processor.py`
- `python/services/analysis/plugins.py`
- `apps/background-jobs/src/jobs/audioEmbedding.ts`
- `apps/background-jobs/src/jobs/visualEmbedding.ts`
- `packages/embedding-media/src/utils/audioEmbedding.ts`
- `packages/embedding-media/src/utils/visualEmbedding.ts`
- 本报告第 `5~11` 节中的现网数据样本

#### B. 仓库内已有文档

- `docs/COMPLETE_ENVIRONMENT_ANALYSIS.md`
- `docs/性能基准对比分析_Part1_转录性能.md`
- `docs/架构师验证报告_视频搜索领域竞品与技术方案深度调研.md`
- `docs/架构师验证报告_视频搜索领域竞品调研.md`
- `docs/US-008_用户案例与实际部署经验.md`

#### C. 一手技术资料

1. PyAV `InputContainer.seek()` 文档
   - 说明 seek 实际会跳到给定时间戳附近的位置，通常与关键帧行为有关，因此“每个采样点 seek 一次”天然存在额外定位与重复 decode 成本
   - https://pyav.basswood-io.com/docs/13.1/api/container.html#av.container.InputContainer.seek

2. FFmpeg 官方文档 `-ss`
   - 说明 seek 往往会先落到接近位置，再解码并丢弃直到目标点
   - 这解释了为什么重复 seek 对长视频不友好
   - https://ffmpeg.org/ffmpeg-doc.html

3. faster-whisper 官方 README benchmark
   - 证明 CTranslate2、批处理、量化在转录子阶段可以显著提升吞吐
   - 但那是子模块 benchmark，不等于当前仓库端到端结果
   - https://github.com/SYSTRAN/faster-whisper

4. BullMQ 官方文档
   - 队列的本质就是削峰填谷、平滑处理峰值
   - 当某一阶段服务率低于到达率时，等待时间会快速放大
   - https://docs.bullmq.io/

因此，最终结论可以收敛为一句话：

**`docs/` 里的很多性能材料并不是“错”，而是“描述的是局部 benchmark、通用经验或未来扩展问题”；而当前系统真正拖慢端到端速度的，是 scene 放大、重插件逐帧执行、后半段低并发排队，以及流水线节拍不平衡。**

---

## 19. 第一批优化已落地

在完成上面的瓶颈复核后，本次已经先落地了一批**高收益、低风险、直接命中主瓶颈**的优化。

这一批优化的目标不是一次性把所有问题都改完，而是先把：

- 前半段的重分析成本压下来
- 后半段的吞吐和局部峰值调平
- embedding 的 GPU 使用从“存在竞态”改成“加载时明确决策”

### 19.1 本次已修改的内容

#### 1. 默认采样间隔从 `2.5s` 调整为 `5s`

修改位置：

- `python/core/config.py`
- `python/main.py`
- `.env.system.example`

当前默认行为变为：

- 如果没有显式传参或环境变量覆盖，分析服务默认按 `5s` 采样
- 仍可通过 `ANALYSIS_SAMPLE_INTERVAL_SECONDS` 或 `--sample-interval` 覆盖

这样做的原因是：

- 当前 scene 数与采样帧数近似 `1:1`
- 采样间隔翻倍，后续 scene 数和 embedding 工作量通常也会近似下降

#### 2. 重插件默认降频

修改位置：

- `python/core/config.py`
- `python/services/analysis/plugins.py`
- `.env.system.example`

当前默认策略：

- `FaceRecognitionPlugin`：每 `3` 个采样帧执行一次
- `DescriptorPlugin`：每 `3` 个采样帧执行一次
- `TextDetectionPlugin`：每 `3` 个采样帧执行一次
- `ObjectDetectionPlugin`：仍保持高频执行

并且本次把跳帧逻辑修成了：

- 第一帧先执行
- 之后再按间隔跳帧

避免了“前几帧全跳过”的错误节拍。

这样做的原因是：

- 现网数据已经证明 `FaceRecognitionPlugin` 和 `DescriptorPlugin` 是最重的两项
- 继续对它们逐帧全量执行，收益很低，代价很高

#### 3. `audio/visual embedding` worker 默认并发从 `1` 提到 `2`

修改位置：

- `apps/background-jobs/src/jobs/audioEmbedding.ts`
- `apps/background-jobs/src/jobs/visualEmbedding.ts`
- `packages/shared/src/constants/embedding.ts`
- `.env.example`

当前默认值：

- `AUDIO_EMBEDDING_WORKER_CONCURRENCY=2`
- `VISUAL_EMBEDDING_WORKER_CONCURRENCY=2`

这样做的原因是：

- 之前后半段是典型的“单车道瓶颈”
- 多视频导入时，音频和视觉 embedding 会在队列后面堆长队

#### 4. embedding batch 从 `10` 缩到 `4`，并把内部 `Promise.all` 改成受控并发

修改位置：

- `packages/shared/src/constants/embedding.ts`
- `packages/shared/src/utils/concurrency.ts`
- `packages/embedding-media/src/utils/audioEmbedding.ts`
- `packages/embedding-media/src/utils/visualEmbedding.ts`
- `.env.example`

当前默认值：

- `AUDIO_EMBEDDING_BATCH_SIZE=4`
- `VISUAL_EMBEDDING_BATCH_SIZE=4`
- `AUDIO_EMBEDDING_BATCH_CONCURRENCY=2`
- `VISUAL_EMBEDDING_BATCH_CONCURRENCY=2`

这意味着当前后半段从：

- 全局 worker 很少
- 单 worker 内一次冲 `10` 个 scene

变成了：

- 全局 worker 稍微放宽
- 单 worker 内按 `2` 路受控并发平滑处理

这类改法更符合当前系统的真实瓶颈。

#### 5. 每个 scene 的视觉抽帧数从 `5` 降到 `3`

修改位置：

- `packages/shared/src/constants/embedding.ts`
- `packages/embedding-media/src/utils/visualEmbedding.ts`
- `.env.example`

当前默认值：

- `VISUAL_EMBEDDING_FRAMES_PER_SCENE=3`

这样做的原因是：

- 当前很多 scene 实际很短
- `5` 帧往往带来的信息增量，不足以覆盖它增加的 ffmpeg、临时文件和 CLIP 编码成本

#### 6. embedding GPU 设备决策改为“模型加载时同步判断”

修改位置：

- `packages/embedding-core/src/services/extractors.ts`

这次没有继续依赖异步全局 `USE_GPU` 布尔值，而是在模型初始化时：

1. 直接 `await isGPUAvailable()`
2. 明确拿到 `cuda` 或 `cpu`
3. 记录当前 embedding device

这样做的作用是：

- 避免第一次模型加载时踩到异步初始化竞态
- 避免某些 embedding 任务静默落回 CPU

### 19.2 本次没有一起改的内容

为了把风险压住，本轮**没有**把所有候选优化一起落地。

暂未在这轮直接改动的包括：

1. 真正的 `scene` 合并
2. `seek-per-sample` 改顺序 decode
3. Node / Python 更大范围的并发治理
4. 多 GPU 显式绑卡

原因不是这些优化不重要，而是：

- 它们改动面更大
- 更适合在第一批稳定后单独压测

### 19.3 本轮验证结果

本次已经完成的验证如下。

#### 1. Python 语法校验通过

执行：

- `python3 -m py_compile python/main.py python/core/config.py python/services/analysis/plugins.py`

结果：

- 通过

#### 2. 新增的受控并发测试通过

新增测试文件：

- `packages/shared/tests/concurrency.test.ts`

验证内容：

- 结果顺序保持稳定
- 并发上限不会超过设定值
- 非法并发值会回退到单 worker

结果：

- 通过

#### 3. 直接相关的 TS 包构建通过

执行：

- `tsc -b packages/shared --force`
- `tsc -b packages/embedding-core --force`
- `tsc -b packages/embedding-media --force`

结果：

- 全部通过

#### 4. `background-jobs` 全量构建仍被现有 Prisma 问题阻断

执行全量相关构建时，出现的是：

- `@prisma/client` 缺少现有代码依赖的导出
- `packages/db` 与多个依赖包一起报类型错误

这说明当前阻断项是：

- **工作区现有 Prisma client 生成状态不完整**

而不是本轮新增的性能改动本身。

这类错误在本轮改动前就存在于整包构建路径中，不属于本轮性能优化引入的问题。

### 19.4 本轮改动的预期收益

按当前现网瓶颈，这一批已经落地的改动，理论上更可能带来以下收益：

#### 1. 前半段 `frame-analysis`

由以下组合共同作用：

- `2.5s -> 5s` 采样
- `FaceRecognition / Descriptor / TextDetection` 默认跳帧

更保守的理论区间：

- `frame-analysis` 阶段下降约 `60% ~ 85%`

#### 2. 后半段 `audio/visual embedding`

由以下组合共同作用：

- worker `1 -> 2`
- batch `10 -> 4`
- batch 内全并发改成 `2` 路受控并发
- 视觉 `5` 帧降到 `3` 帧

更保守的理论区间：

- 批量导入场景的后半段总完成时间改善约 `1.3x ~ 2.2x`
- 同时更有希望降低 `embedding_visual` 的失败率和长尾时延

#### 3. 端到端

如果这一批在真实素材上没有明显检索质量回退，那么它们已经覆盖了当前最关键的三类问题：

1. 工作量过大
2. 重插件过重
3. 后半段排队和波峰过高

所以对长视频批量导入，理论上已经具备：

- 单视频端到端约 `1.5x ~ 3.0x`
- 批量总吞吐约 `2x ~ 6x`

的改善基础。

### 19.5 下一步建议

在这批改动之后，最合理的下一步顺序是：

1. 用一批代表性长视频做改前/改后压测
2. 观察 scene 数、frame-analysis 耗时、embedding 队列长度、失败率变化
3. 如果质量可接受，再继续推进：
   - 真正的 scene 合并
   - 顺序 decode
   - GPU 显式绑卡

这样可以把“理论收益”逐步变成“实测收益”，同时避免一次性改太多导致难以归因。

### 20. 第一批优化的补充实测与定量修正

这一节是在前文基础上补充的“真实运行证据 + 定量推演 + 本地隔离实测”。

重点不是重复前文结论，而是把三个问题说清楚：

1. 现网到底慢在哪里
2. 第一批优化到底能优化哪一段
3. 哪些收益已经被证据支持，哪些还只是系统层面的合理预期

#### 20.1 本轮补充分析使用的真实数据源

本轮新增分析同时使用了以下真实数据源：

- 实际部署目录：`/data3/mabo/edit-mind_soucecode`
- 实际部署环境变量：`/data3/mabo/edit-mind_soucecode/.env`、`/data3/mabo/edit-mind_soucecode/.env.system`
- 实际容器日志：
  - `/data3/mabo/edit-mind_soucecode/docker_logs/realtime_20260309_220005/edit-mind-ml.log`
  - `/data3/mabo/edit-mind_soucecode/docker_logs/realtime_20260309_220005/edit-mind-background-jobs.log`
- 实际分析结果：
  - `/data3/mabo/edit-mind_soucecode/.data/*/analysis.json`
- 本地隔离基准素材：
  - `/data3/mabo/edit-mind_soucecode/media/t1/后宫·甄嬛传66.mp4`
  - `/tmp/edit-mind-benchmark-10min.mp4`

这意味着本节结论不再只是“读代码后的推断”，而是有真实运行证据支撑。

#### 20.2 线上旧配置的定量事实

先给结论：

- **前半段 `frame-analysis` 确实是当前系统最重的单段瓶颈**
- **它的核心耗时几乎全部来自插件，不是 I/O，不是缩略图**
- **后半段 `scene -> embedding` 的真正问题不是单个 FFmpeg 或单个模型慢，而是 scene 数过多 + 批次波峰过高 + 三路任务同时抢资源**

具体证据如下。

##### 1. `frame-analysis` 的真实耗时

从 `edit-mind-ml.log` 中抽取到的 35 次长视频分析日志显示：

- 平均耗时：`868.32s`
- `p95`：`931.41s`
- 最大值：`1048.52s`

从已落盘的 16 份 `analysis.json` 汇总得到：

- 平均 `processing_time`：`866.49s`
- 最小值：`830.32s`
- `p95`：`905.59s`
- 最大值：`964.76s`

这两个来源彼此吻合，说明前文关于“长视频一次分析需要大约 14~16 分钟”的判断是成立的。

##### 2. `frame-analysis` 的插件耗时占比

16 份真实 `analysis.json` 的 `plugin_performance` 平均值如下：

- `FaceRecognitionPlugin`：`364.02ms / frame`
- `DescriptorPlugin`：`335.03ms / frame`
- `DominantColorPlugin`：`70.43ms / frame`
- `TextDetectionPlugin`：`66.99ms / frame`
- `ObjectDetectionPlugin`：`9.18ms / frame`
- `ShotTypePlugin`：`0.06ms / frame`

按平均值折算：

- `FaceRecognitionPlugin` 占插件总耗时约 `43.0%`
- `DescriptorPlugin` 占插件总耗时约 `39.6%`
- 两者合计约 `82.7%`

也就是说：

- **真正把 `frame-analysis` 拖慢的不是 YOLO**
- **而是 `FaceRecognition + Descriptor` 这两个重插件**

##### 3. 老配置下 scene 数量严重膨胀

线上长视频日志显示：

- 视频总帧数约 `60001`
- 采样间隔约 `62` 帧，即 `~2.48s`
- 单次分析实际处理帧数：`968`
- 之后进入 `scene creation` 时，后半段出现 `97` 个 batch，每个 batch `10` 个 scene

这意味着：

- 一条约 40 分钟的视频，后半段会被拆成约 `970` 个 scene
- 平均每个 scene 只有约 `2.48s`

这已经不是“正常分镜粒度”，而是：

- **采样粒度基本直接泄漏成了 scene 粒度**

这正是后半段工作量爆炸的根源之一。

##### 4. 后半段不是单点慢，而是波峰太高

针对第一条 `t1/后宫·甄嬛传66.mp4` 的真实 `scene creation` 日志窗口做统计：

- `audio` batch 平均完成时间：`8.43s`
- `audio` batch `p95`：`15.32s`
- `audio` batch 最大值：`33.82s`
- `visual` batch 平均完成时间：`9.28s`
- `visual` batch `p95`：`21.21s`
- `visual` batch 最大值：`36.54s`

同时，同一时间段内还在并行跑：

- `Embedding 10 new text documents`
- `Processing 10 scenes for audio embeddings`
- `Processing batch N, scenes ...` 的 visual embedding

这说明后半段慢的本质不是：

- “单个 scene 太慢”

而是：

- **scene 太多**
- **每批并发太猛**
- **text / audio / visual 三路一起推高 CPU、内存、FFmpeg 进程数和向量写入压力**

##### 5. 转录不是当前主瓶颈

当前拿到的两次真实转录日志显示：

- 平均耗时：`77.95s`
- 区间：`75.8s ~ 80.1s`

对比 `frame-analysis` 的 `866s+`：

- 转录虽然不算轻，但还不是当前主瓶颈

#### 20.3 对 `frame-analysis` 优化收益的定量推演

这一段可以直接做比较扎实的理论计算，因为真实日志已经给出了：

- 单帧平均插件耗时
- 总采样帧数
- 总分析耗时

基于真实平均值，老配置大致是：

- 采样帧数：`968`
- 插件总计算量约：`818.65s`
- 全阶段总耗时约：`866.49s`
- 其余非插件开销约：`47.84s`

这说明：

- **旧配置下约 `94.5%` 的总分析时间，本质上都是插件时间**

在这个基础上，分别计算三种情况：

##### 情况 A：只把采样从 `2.48s` 拉到 `5s`

理论结果：

- 总耗时约从 `866.49s` 降到 `453.78s`
- 降幅约 `47.6%`
- 约 `1.91x` 加速

##### 情况 B：保持旧采样，但把 `FaceRecognition / Descriptor / TextDetection` 改成每 `3` 帧运行一次

理论结果：

- 总耗时约从 `866.49s` 降到 `372.14s`
- 降幅约 `57.1%`
- 约 `2.33x` 加速

##### 情况 C：两者同时做，也就是本轮已经落地的默认策略

理论结果：

- 总耗时约从 `866.49s` 降到 `208.65s`
- 降幅约 `75.9%`
- 约 `4.15x` 加速

这个数值不应该被理解为“线上一定稳定达到 4.15x”，但它至少说明两件事：

1. 前半段的主要收益来源非常明确
2. 这批改动打中的确实是当前最重的成本中心

所以对 `frame-analysis` 而言：

- **本轮改动不是小修小补**
- **而是击中了最主要的计算热点**

#### 20.4 对 `embedding` 优化收益的补充实测与修正

这里必须如实修正前文一个容易被误解的地方。

前文第 19 节里对 `embedding` 的收益判断，更多是站在“系统稳定性与吞吐”的角度给出的。
本轮补充了一个**本地隔离实测**之后，可以把这个结论说得更精确。

##### 1. 实测条件

本地隔离基准条件如下：

- 视频：`/data3/mabo/edit-mind_soucecode/media/t1/后宫·甄嬛传66.mp4`
- 取前 `20` 个 scene
- 每个 scene 长度约 `2.48s`
- 模型先预热，排除首次加载时间
- 使用本地已缓存模型
- 不写入 Chroma
- 不经过 Redis/BullMQ
- 不并行跑 text embedding
- 只测：
  - `extractSceneFrames + embedSceneFrames`
  - `extractSceneAudio + embedSceneAudio`

也就是说，这个测试测的是：

- **纯提取 + 纯模型推理**

而不是整套线上导入流程。

##### 2. visual 的隔离实测结果

旧参数模拟：

- `batchSize=10`
- `batchConcurrency=10`
- `framesPerScene=5`

新参数：

- `batchSize=4`
- `batchConcurrency=2`
- `framesPerScene=3`

结果：

- 旧参数总耗时：`3.93s`
- 新参数总耗时：`5.07s`
- 旧参数单 scene 平均抽帧：`572.76ms`
- 新参数单 scene 平均抽帧：`309.49ms`
- 旧参数单 scene 平均视觉嵌入：`1172.01ms`
- 新参数单 scene 平均视觉嵌入：`175.06ms`
- 旧参数 batch 平均时间：`1.97s`
- 新参数 batch 平均时间：`1.01s`

##### 3. audio 的隔离实测结果

旧参数模拟：

- `batchSize=10`
- `batchConcurrency=10`

新参数：

- `batchSize=4`
- `batchConcurrency=2`

结果：

- 旧参数总耗时：`3.97s`
- 新参数总耗时：`4.79s`
- 旧参数单 scene 平均抽音频：`639.53ms`
- 新参数单 scene 平均抽音频：`184.37ms`
- 旧参数单 scene 平均音频嵌入：`1033.87ms`
- 新参数单 scene 平均音频嵌入：`270.36ms`
- 旧参数 batch 平均时间：`1.98s`
- 新参数 batch 平均时间：`0.96s`

##### 4. 这组结果应该如何解释

这组结果非常重要，因为它说明：

- **新参数并不保证“单视频、空载、模型已预热”的总 wall time 一定更短**

在隔离场景里，新参数反而略慢，原因不是它更重，而是：

- 它主动降低了单批并发波峰
- 同时把单批大小从 `10` 降到 `4`
- 所以一条视频会拆成更多批次顺序完成

但是同一组数据也清楚表明：

- 单 scene 的抽帧时间显著下降
- 单 scene 的抽音频时间显著下降
- 单 scene 的模型推理时间显著下降
- 单批波峰明显下降

这说明新参数真正优化的是：

- **批次波峰**
- **每批资源抢占强度**
- **系统长尾与失败风险**

而不是：

- **单视频空载情况下的极限最短 wall time**

所以对第 19 节的结论，需要做如下修正：

- 第 19.4 中关于 `embedding` 的 `1.3x ~ 2.2x`，更适合解释为**系统层面的吞吐/稳定性改善空间**
- 它**不能直接等价成**“单视频一定提速 `1.3x ~ 2.2x`”

更准确地说：

- 对单视频空载场景，新参数更像是“以一点点绝对完成时间，换更低的波峰和更好的可并发性”
- 对真实线上多视频排队场景，它才更有机会转化成总吞吐改善

#### 20.5 对整套系统瓶颈位置的最终确认

结合源码、实际部署目录、分析结果文件和真实日志，本轮可以把结论收敛到下面这几个点。

##### 1. 当前第一瓶颈：`frame-analysis`

原因：

- 老配置采样太密：`~2.48s / frame`
- 重插件全部逐帧跑
- `FaceRecognition + Descriptor` 吞掉了约 `82.7%` 的插件时间

所以“为什么慢”的第一答案是：

- **前半段对每个采样帧做了过多重计算**

##### 2. 当前第二瓶颈：scene 过度碎片化

原因：

- `968` 个采样帧最终推成约 `970` 个 scene
- 等价于把 40 分钟视频切成接近一千段微小片段

所以“为什么慢”的第二答案是：

- **后半段不是自然 scene 太多，而是上游采样粒度直接制造了 scene 数爆炸**

##### 3. 当前第三瓶颈：后半段三路任务叠加的资源波峰

原因：

- text embedding 在滚动推进
- audio batch 并发提取和嵌入
- visual batch 并发抽帧和嵌入
- 向量入库同时发生

所以“为什么慢”的第三答案是：

- **系统在用“过多小 scene + 过猛批次并发”换取局部并行，但实际换来的是长尾和争抢**

#### 20.6 对 docs 中性能说法的进一步修正

第 18 节已经说明了 `docs/` 中一些性能表述的问题。

在本轮新增证据之后，可以再补一句更明确的话：

- `docs/` 对“为什么慢”的描述还不够聚焦
- 它低估了 `FaceRecognition + Descriptor` 的主导性
- 它也低估了 `~970 scene / 40分钟视频` 这种数量级爆炸对后半段的放大作用

按本轮新增证据看：

- docs 中“更多并发、更强机器、更大 GPU”这一类思路，只能解决一部分问题
- 真正更高收益的，仍然是：
  - 减少采样
  - 减少重插件执行次数
  - 降低 scene 数
  - 压平 batch 波峰

所以：

- **我们本轮已做的修改，对前半段是强命中**
- **对后半段是先压波峰、再为后续 scene 合并和顺序 decode 铺路**
- **真正能把后半段继续明显拉下来的，仍然是下一批的 scene 合并与顺序 decode**

#### 20.7 附加低风险修正：FFmpeg 二进制校验去噪

本轮还顺手修了一个不是主瓶颈、但会明显污染日志的问题。

问题是：

- `packages/media-utils/src/lib/ffmpeg.ts` 在每次调用 `ffmpeg/ffprobe` 前都会先尝试 `chmod`
- 当前路径固定是 `/usr/bin/ffmpeg` 和 `/usr/bin/ffprobe`
- 在非 root 运行环境下，这会反复触发 `EPERM`
- 日志里会出现大量：
  - `Failed to set permissions for /usr/bin/ffmpeg`

这不会决定总耗时，但会带来：

- 额外无意义 syscall
- 大量低价值噪声日志
- 对真正的性能日志形成干扰

本轮已做修正：

- 若二进制本身已经可执行，则不再重复 `chmod`
- 同一进程内对同一路径只校验一次
- `chmod` 失败警告只保留一次

这属于：

- **低风险去噪修正**

它不会改变系统主瓶颈排序，但会让后续观测更干净。

补充验证：

- `tsc -b packages/media-utils --force` 已通过
- 两次连续 `extractSceneFrames()` 冒烟测试已确认不再重复输出该类警告
