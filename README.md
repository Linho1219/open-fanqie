# Open Fanqie

番茄简谱 DSL 的开源渲染核心和兼容应用。本仓库使用 pnpm workspace 管理：

- `@openfanqie/core`：解析 DSL 并输出 SVG，可独立发布到 npm。
- `@openfanqie/legacy-app`：原版 jQuery 前端的静态站版本，使用本地 core 渲染。

## Development

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm typecheck
```

也可以只运行一个包：

```bash
pnpm -F @openfanqie/core test
pnpm -F @openfanqie/core build
pnpm -F @openfanqie/legacy-app dev
pnpm -F @openfanqie/legacy-app build
```
