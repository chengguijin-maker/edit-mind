# Edit Mind 完整环境分析报告

生成时间：2026-03-10
系统：Ubuntu 20.04.6 LTS

---

## 📊 系统硬件配置

### CPU
```
型号: Intel Xeon Gold 6248R @ 3.00GHz
核心数: 96 逻辑核心 (48 物理核心 × 2 超线程)
架构: x86_64, 双 NUMA 节点
性能评估: ⭐⭐⭐⭐⭐ 优秀 - 适合高并发视频处理
```

### GPU
```
数量: 3 × NVIDIA GeForce RTX 3090
显存: 每卡 24 GB (总计 72 GB)
CUDA: 12.8
驱动: 570.86.10
当前使用:
  - GPU 0: 2.2 GB / 24 GB (9%)
  - GPU 1: 5 MB / 24 GB (0%)
  - GPU 2: 5 MB / 24 GB (0%)
性能评估: ⭐⭐⭐⭐⭐ 顶级 - 完美支持 GPU 加速
```

### 内存
```
总容量: 313 GB
可用: 284 GB (91%)
交换分区: 980 MB
性能评估: ⭐⭐⭐⭐⭐ 充足 - 可同时处理多个大视频
```

### 存储
```
总容量: 438 GB
已用: 346 GB (79%)
可用: 70 GB (16%)
性能评估: ⚠️ 空间紧张 - 需要监控
```

---

## 💻 软件环境

### 操作系统
```
发行版: Ubuntu 20.04.6 LTS (Focal Fossa)
内核: Linux 5.4.0-216-generic
架构: x86_64
状态: ✅ 完全兼容
```

### 容器化环境
```
Docker: 28.1.1 ✅
Docker Compose: v2.35.1 ✅
Docker 状态: active (运行中)
Docker 内存占用: 20.9 GB
镜像加速: 已配置 14 个国内镜像源 ✅
```

### 开发工具
```
Node.js: v24.14.0 ✅ (要求 ≥22.20.0)
pnpm: 10.20.0 ✅ (完全匹配)
Python: 3.8.10 ⚠️ (推荐 3.11+)
```

### GPU 运行时
```
NVIDIA Container Toolkit: 未检测到 nvidia-docker
Docker GPU 支持: 需要验证
CUDA 容器测试: 权限问题（需要 sudo）
```

---

## 🚨 严重问题

### 1. 默认宿主机端口全部冲突，按默认配置无法直接启动

**当前端口占用情况：**
```
✗ 3745  - Web 应用默认宿主机端口被占用
✗ 4000  - Background Jobs 默认宿主机端口被占用
✗ 5432  - PostgreSQL 默认宿主机端口被占用
✗ 6379  - Redis 默认宿主机端口被占用
✗ 8000  - ChromaDB 默认宿主机端口被占用
✗ 8765  - ML 服务默认宿主机端口被占用
```

**影响：**
- 🔴 `docker compose up` 按默认宿主机端口映射会直接失败
- 🔴 不能把这个问题简化为“只改 `.env` 里所有端口”

**原因说明：**

这个仓库实际使用两层环境文件：

- `.env.system` 保存容器间内部通信默认值
- `.env` 保存密钥、媒体路径、功能开关以及部分宿主机端口映射

并且当前 Compose 里不同服务的端口联动方式并不完全一致：

- `web`、`background-jobs`、`ml` 当前把同一个环境变量同时用于容器监听端口和宿主机映射端口
- `postgres`、`redis` 容器内部仍固定使用 `5432` 和 `6379`
- `chroma` 容器内部仍监听 `8000`，但应用侧会读取 `CHROMA_PORT`
- `.env.system` 里还固定了 `WEB_APP_URL=http://web:3745`、`BACKGROUND_JOBS_URL=http://background-jobs:4000`

这意味着：

- 修改 `.env` 中的 `POSTGRES_PORT`、`REDIS_PORT` 主要是在改宿主机映射
- 修改 `.env` 中的 `PORT`、`BACKGROUND_JOBS_PORT`、`ML_PORT` 会同时影响应用监听端口
- 修改 `.env` 中的 `CHROMA_PORT` 还会影响应用容器连接 Chroma 的内部端口，容易把容器内访问一起改坏

**更准确的解决方案：**

#### 方案 A：停止占用默认端口的宿主机服务

如果你希望直接沿用仓库默认配置，这是最稳妥的做法。

```bash
sudo lsof -i :3745 -i :4000 -i :5432 -i :6379 -i :8000 -i :8765

sudo systemctl stop postgresql
sudo systemctl stop redis-server
sudo systemctl stop ollama
docker stop <conflicting-container-id>
```

#### 方案 B：只修改宿主机暴露端口

如果必须与现有服务共存，推荐用 `docker-compose.override.yml` 只改宿主机侧端口映射，保留容器内部端口和 `.env.system` 内部 URL 不变。

```yaml
services:
  web:
    ports:
      - "13745:3745"

  background-jobs:
    ports:
      - "14000:4000"

  postgres:
    ports:
      - "15432:5432"

  redis:
    ports:
      - "16379:6379"

  chroma:
    ports:
      - "18000:8000"

  ml:
    ports:
      - "18765:8765"
```

这样做时：

- 浏览器访问地址变成 `http://localhost:13745`
- 容器间依旧通过 `web:3745`、`background-jobs:4000`、`chroma:8000` 通信
- 不需要顺手把 `.env` 里的所有端口都改掉

#### 方案 C：复用宿主机已有数据库、缓存或 Ollama

这是高级方案，需要你明确修改内部连接配置，而不只是“换个宿主机端口”：

- PostgreSQL 需要同步调整 `.env.system` 中的 `DATABASE_URL`
- Redis 需要同步调整 `.env.system` 中的 `REDIS_URL`
- 若要复用外部 Chroma，则要一起调整 `CHROMA_HOST` / `CHROMA_PORT`
- 若要复用宿主机 Ollama，则必须保证容器能访问宿主机地址

---

### 2. 存储空间存在中高风险

**当前状态：**
```
磁盘使用率: 79% (346 GB / 438 GB)
剩余空间: 70 GB
```

**风险说明：**

Edit Mind 不只是拉镜像，还会持续消耗：

- Docker 镜像与容器层
- Whisper / YOLO / DeepFace / PyTorch 模型缓存
- PostgreSQL 数据
- Chroma 向量数据
- 缩略图、分析结果、临时文件

70 GB 对“小规模试跑”通常够用，但对持续索引大量视频并不宽裕。

**建议：**
1. 保证至少 30 GB 以上的持续可用空间，实际越多越稳妥。
2. 定期查看 `df -h` 和 `docker system df`。
3. 考虑把媒体目录、`.data` 或 Docker 数据目录放到更大的磁盘。

---

### 3. 宿主机 Python 3.8.10 不是当前阻塞项

**当前版本：** Python 3.8.10  
**容器内版本：** 镜像内使用独立 Python 环境

**结论：**
- ✅ 对 Docker 部署不是当前问题
- ⚠️ 如果要在宿主机直接跑 Python 服务，再单独考虑版本升级

---

### 4. GPU 路径需要实际验证

**当前问题：**
```
✗ NVIDIA Container Toolkit 未确认可用
✗ Docker GPU 运行时未完成验证
✗ docker-compose.cuda.yml 能否直接启动尚未确认
```

**建议验证命令：**
```bash
docker info | grep -i runtime
sudo docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi
```

**如果验证失败，再处理：**
```bash
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

---

## ⚠️ 次要问题

### 5. Ollama 可达性配置仍需按平台区分

**当前状态：**
```
Ollama 进程: 已运行
监听地址: 需要进一步确认是否对容器可达
模型: 需确认是否已 pull 所需模型
```

**关键点：**

- 仅仅在宿主机上能访问 `localhost:11434`，不代表容器内也能访问
- macOS / Windows 常见写法是 `http://host.docker.internal`
- Linux 没有统一可用的固定地址，`172.17.0.1` 不是所有环境的通用答案
- 当前仓库的 Compose 配置并没有默认添加 `host.docker.internal:host-gateway`

**更稳妥的做法：**

1. 先确认 Ollama 监听在宿主机可达地址上，例如：
```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```
2. 下载模型：
```bash
ollama pull qwen2.5:7b-instruct
```
3. 在 `.env` 中按环境填写：
```ini
USE_OLLAMA_MODEL="true"
OLLAMA_MODEL="qwen2.5:7b-instruct"
OLLAMA_PORT="11434"
```
4. `OLLAMA_HOST` 的填写规则：
   - macOS / Windows：通常可用 `http://host.docker.internal`
   - Linux：使用一个容器真实可达的宿主机地址，或自行在 Compose 中增加 `host-gateway`

---

### 6. 必填环境变量仍未配置

**必须补齐：**
```ini
SESSION_SECRET=""
ENCRYPTION_KEY=""
HOST_MEDIA_PATH="/path/to/your/media/folder"
```

并且至少启用一种 AI 提供方：

```ini
USE_OLLAMA_MODEL="true"
```

或：

```ini
USE_GEMINI="true"
GEMINI_API_KEY="..."
```

**密钥生成方式：**

先在终端执行：

```bash
openssl rand -hex 32
openssl rand -base64 32
```

再把输出结果粘贴进 `.env`。

不要把下面这种写法原样放进 `.env`：

```ini
SESSION_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

那会把命令文本本身写进去，而不是写入生成后的随机值。

---

## ✅ 优势与机会

### 1. 硬件条件非常强

- ✅ 96 逻辑核心 CPU
- ✅ 3 × RTX 3090
- ✅ 313 GB 内存

这套机器对 Edit Mind 是明显高配，但不意味着可以直接把并发值拉满。

**更稳妥的并发建议：**

先从默认值开始：

```ini
MAX_CONCURRENT_TRANSCRIPTIONS="1"
MAX_CONCURRENT_ANALYSES="1"
```

跑通后再逐步上调到 `2` 或 `4`，边调边观察：

- Python 分析服务实际线程池默认并不高
- Docker 启动命令没有显式传 `--analysis-workers`
- `visual-embedding` 和 `audio-embedding` 当前默认 worker 并发已是 `2`

所以 Node 侧并发调高，不等于整条链路吞吐一定同步提升。

### 2. Docker 基础环境已具备

- ✅ Docker 和 Compose 版本足够新
- ✅ 容器环境基本齐备
- ✅ 适合优先走容器化部署

### 3. 前端 / Node 开发环境良好

- ✅ Node.js 版本满足要求
- ✅ pnpm 版本匹配
- ✅ 适合继续做本地开发和调试

---

## 📋 安装前检查清单

### 必须完成

- [ ] 解决默认宿主机端口冲突
- [ ] 复制并填写 `.env`
- [ ] 确认 `.env.system` 保持与内部网络设计一致
- [ ] 生成并填入 `SESSION_SECRET` / `ENCRYPTION_KEY`
- [ ] 配置 `HOST_MEDIA_PATH`
- [ ] 配置至少一种 AI 提供方
- [ ] 确认磁盘空间足够

### 推荐完成

- [ ] 验证 GPU 容器可用性
- [ ] 如果使用 Ollama，确认容器到宿主机的实际可达路径
- [ ] 跑通单视频流程后，再调高并发

---

## 🚀 推荐安装流程

### 步骤 1：准备环境文件

```bash
cp .env.example .env
cp .env.system.example .env.system
```

### 步骤 2：先决定端口策略

二选一：

1. 停掉占用默认端口的服务
2. 新建 `docker-compose.override.yml`，只修改宿主机暴露端口

如果采用第二种，建议优先参考 [installation-conflict-resolution.md](./installation-conflict-resolution.md) 中的 override 示例，而不是直接改 `.env` 里的所有端口。

### 步骤 3：填写 `.env`

先执行：

```bash
openssl rand -hex 32
openssl rand -base64 32
```

然后把结果填入：

```ini
SESSION_SECRET="<paste-hex-output>"
ENCRYPTION_KEY="<paste-base64-output>"
HOST_MEDIA_PATH="/absolute/path/to/your/media"
```

### 步骤 4：选择 AI 提供方

**如果使用 Gemini：**

```ini
USE_GEMINI="true"
GEMINI_API_KEY="your-key"
USE_OLLAMA_MODEL="false"
```

**如果使用 Ollama：**

```ini
USE_OLLAMA_MODEL="true"
OLLAMA_MODEL="qwen2.5:7b-instruct"
OLLAMA_PORT="11434"
```

`OLLAMA_HOST` 需按平台填写：

- macOS / Windows：通常可用 `http://host.docker.internal`
- Linux：填写容器真实可达的宿主机地址，或自行增加 `host-gateway` 映射后再使用 `host.docker.internal`

### 步骤 5：可选配置 GPU

如果 GPU 容器验证通过：

```bash
docker compose -f docker-compose.cuda.yml up -d
```

否则先用 CPU 版本跑通：

```bash
docker compose up -d
```

### 步骤 6：验证服务状态

```bash
docker compose ps
docker compose logs -f
```

Web 访问地址取决于你的宿主机端口策略：

- 默认端口时：`http://localhost:3745`
- 使用 override 时：访问你在 override 中设置的 Web 宿主机端口

---

## 📊 性能与调优建议

### 1. 先跑通单任务，再逐步提高并发

推荐顺序：

1. 先保持 `1 / 1`
2. 确认转录、帧分析、scene、embedding 能完整跑通
3. 观察 CPU、GPU、Redis、PostgreSQL、Chroma 使用情况
4. 再小步提高 `MAX_CONCURRENT_TRANSCRIPTIONS` / `MAX_CONCURRENT_ANALYSES`

### 2. 优先验证 GPU，再谈吞吐优化

GPU 对转录和视觉分析通常会有明显帮助，但项目端到端速度还受以下因素影响：

- 默认 `5 秒` 采样一帧（可通过 `ANALYSIS_SAMPLE_INTERVAL_SECONDS` 或 `--sample-interval` 覆盖）
- 单帧内多个插件顺序执行
- `audio/visual embedding` 当前默认 worker 并发为 `2`
- Node 与 Python 侧并发配置未完全打通

### 3. 监控建议

```bash
docker stats
watch -n 1 nvidia-smi
watch -n 5 df -h
```

### 4. 正确理解阶段耗时

当前 `transcriptionTime`、`frameAnalysisTime` 更接近“某阶段开始处理后的总耗时”，其中会混入：

- Node 到 Python 的往返
- Python 内部处理与等待
- 阶段内部的非模型开销

它们不能直接等价为“纯模型推理时间”。

---

## 🔧 故障排查

### 问题 1：端口仍然冲突

```bash
sudo lsof -i :3745 -i :4000 -i :5432 -i :6379 -i :8000 -i :8765
```

如果确实无法停掉现有服务，优先改 Compose 的宿主机映射，不要直接把 `.env` 所有端口一起改掉。

### 问题 2：GPU 不可用

```bash
nvidia-smi
docker info | grep -i runtime
sudo docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi
```

### 问题 3：容器无法访问 Ollama

先确认两件事：

1. Ollama 是否监听在宿主机可达地址上
2. 容器是否真的能访问你填写的 `OLLAMA_HOST`

Linux 下如果你想使用 `host.docker.internal`，需要自己在 Compose 中增加类似配置：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

当前仓库默认 Compose 没有这项配置，所以不能把它当成“已经可用”的默认能力。

### 问题 4：磁盘空间不足

```bash
docker system df
docker system prune -a
docker volume ls
df -h
```

---

## 📈 预期表现

基于当前代码结构，更合理的预期是：

- 这台机器硬件很强，项目可行性高
- GPU 模式通常会比 CPU 模式快很多
- 但端到端索引速度仍高度依赖视频长度、分辨率、采样间隔、插件组合、embedding 阶段排队和是否并发
- 即便是 45 分钟视频，在默认 `5 秒` 采样和完整多插件分析下，出现“数十分钟级”的索引时间仍然可能发生

因此，性能应以实际素材压测结果为准，不建议把单个经验值写成固定承诺。

---

## 总结

### 当前状态

- ✅ 硬件条件优秀
- ✅ Docker / Node / pnpm 基础环境基本可用
- 🔴 默认宿主机端口存在系统级冲突
- ⚠️ 磁盘空间不算充裕
- 🟡 GPU 与 Ollama 还需要做一次真实可达性验证

### 可行性评估

**✅ 可以部署并运行。** 当前主要阻塞项不是硬件，而是端口策略、外部服务可达性和安装配置准确性。

### 推荐优先级

1. 先解决端口冲突，优先保持内部端口不变
2. 填好 `.env` / `.env.system`，保证媒体路径和 AI 提供方配置正确
3. 先用单任务跑通完整索引链路
4. 再验证 GPU 和逐步提高并发
