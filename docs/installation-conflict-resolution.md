# Edit Mind 安装冲突解决方案

## 先理解这个仓库的端口模型

这个项目不是只有一个 `.env` 文件。

- `.env.system` 用于容器之间的内部通信默认值，例如：
  - `BACKGROUND_JOBS_URL=http://background-jobs:4000`
  - `WEB_APP_URL=http://web:3745`
  - `DATABASE_URL=postgresql://user:password@postgres:5432/app`
  - `REDIS_URL=redis://redis:6379`
- `.env` 主要给用户放密钥、功能开关和一部分宿主机端口映射。
- `docker-compose.yml` 会同时加载这两个文件。

这意味着“把 `.env` 里的所有端口都改掉”并不是一个通用且安全的解决方案。

## 为什么不能直接改 `.env` 里的所有端口

当前 Compose 配置里，不同服务的端口含义并不一样：

- `web`、`background-jobs`、`ml` 当前使用的是“同一个值同时作为容器监听端口和宿主机映射端口”。
- `postgres` 和 `redis` 的容器内部端口仍分别固定为 `5432`、`6379`，改 `.env` 更多只是改宿主机映射。
- `chroma` 容器内部仍监听 `8000`，但应用侧读取的是 `CHROMA_PORT`。如果把 `.env` 中的 `CHROMA_PORT=18000` 直接改掉，应用容器也会去连 `chroma:18000`，这会把容器内连接一起改坏。
- `web` 和 `background-jobs` 的内部访问地址还受 `.env.system` 中 `WEB_APP_URL`、`BACKGROUND_JOBS_URL` 影响。

所以，只有“看到端口冲突就改 `.env`”会把“宿主机暴露端口”和“容器内部通信端口”混在一起。

## 安全处理方式

### 方案 A：停止占用默认端口的宿主机服务

如果你希望保持仓库默认配置，这是最直接也最稳妥的方案。

```bash
# 检查占用端口的进程
sudo lsof -i :3745 -i :4000 -i :5432 -i :6379 -i :8000 -i :8765

# 按需停止现有服务
sudo systemctl stop postgresql
sudo systemctl stop redis-server
sudo systemctl stop ollama

# 或停止冲突的 Docker 容器
docker ps --format '{{.ID}} {{.Names}} {{.Ports}}'
docker stop <container-id>
```

### 方案 B：只修改宿主机暴露端口

如果你不想停掉现有服务，推荐通过 `docker-compose.override.yml` 只改宿主机侧端口映射，保留容器内部端口和 `.env.system` 内部地址不变。

示例：

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

这种做法下：

- 浏览器访问地址改成 `http://localhost:13745`
- 容器之间仍然按 `web:3745`、`background-jobs:4000`、`chroma:8000` 通信
- `.env.system` 里的内部 URL 不需要跟着一起改

### 方案 C：复用宿主机已有服务

这只适合明确知道自己在做什么的场景。

例如你想复用宿主机上的 PostgreSQL、Redis、Ollama，需要一起确认：

- `.env.system` 中 `DATABASE_URL`、`REDIS_URL` 是否已改成容器可达地址
- 容器是否真的能访问宿主机服务
- Linux 下是否已经配置了可达的宿主机地址或 `host-gateway`
- Chroma 是否仍由本项目容器提供，还是也要改成外部服务

如果这些没有一起改，服务很容易表现为“容器启动了，但应用互连失败”。

## 检查可用端口

如果你打算采用“只改宿主机暴露端口”的方式，可以先挑一组空闲端口：

```bash
for port in 13745 14000 15432 16379 18000 18765; do
  if sudo lsof -i :$port > /dev/null 2>&1; then
    echo "端口 $port 已被占用"
  else
    echo "端口 $port 可用"
  fi
done
```

这一步只是为了给 Compose override 选值，不代表可以把这些值原样直接写进 `.env` 的所有端口字段。

## 建议结论

推荐顺序是：

1. 优先停止冲突服务，直接使用仓库默认端口。
2. 如果必须共存，使用 `docker-compose.override.yml` 只改宿主机映射端口。
3. 只有在明确理解内部网络和环境变量联动关系时，才去复用宿主机已有数据库、缓存或 Ollama。
