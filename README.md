# Open Fanqie Core

番茄简谱 DSL 的 TypeScript 排版与 SVG 渲染核心。目标 API 是：

```ts
render(dsl, options): string
```

项目只负责解析、排版和 SVG 输出，不包含旧站页面代理或编辑器界面。

## Compatibility target

兼容目标以三类材料交叉验证：

- 番茄简谱脚本 v1.0 说明手册；
- `legacy` 分支中留存的前端、示例和早期解析器；
- 原站 `/Zhipu-draw` 的实际表单与 SVG 响应。

旧接口接收 `code`、`customCode`、`pageConfig`、`pageNum` 四个表单字段，分页 SVG 以 `[fenye]` 分隔。核心库用 `RenderOptions` 表达同一组输入。

## Development

```bash
pnpm install
pnpm test
pnpm build
```

