<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# auth

## Purpose
认证功能模块，处理用户登录、注册和会话管理。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | 认证 UI 组件 |
| `hooks/` | 认证钩子函数 |
| `providers/` | 认证上下文 |
| `schemas/` | 认证数据验证 |

<!-- MANUAL: -->

## Authentication Flow

```mermaid
flowchart TB
    User[User Action] -->|Login| LoginForm[Login Form]
    User -->|Register| RegisterForm[Register Form]
    LoginForm -->|Submit| Credentials[Credentials Validation]
    RegisterForm -->|Submit| NewUser[New User Data]
    Credentials -->|Verify| Database[(PostgreSQL)]
    NewUser -->|Store| Database
    Database -->|Generate| JWT[JWT Token]
    JWT -->|Store| Cookie[HTTP-Only Cookie]
    JWT -->|Return| Session[User Session]
    Session -->|Update| UI[UI State]
```

## Session Management Flow

```mermaid
flowchart LR
    Request[API Request] -->|Extract| Middleware[Auth Middleware]
    Middleware -->|Verify| Token[JWT Token]
    Token -->|Valid| Context[Auth Context]
    Token -->|Invalid| Reject[401 Unauthorized]
    Context -->|Attach| User[User Data]
    User -->|Proceed| Handler[Route Handler]
```
