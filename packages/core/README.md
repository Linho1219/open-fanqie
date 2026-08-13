# Open Fanqie Core

番茄简谱 DSL 的 TypeScript 排版与 SVG 渲染核心。目标 API 是：

```ts
render(dsl, options): string
renderSvgPages(dsl, options): string[]
```

项目只负责解析、排版和 SVG 输出，不包含旧站页面代理或编辑器界面。

## Compatibility target

兼容目标以三类材料交叉验证：

- 番茄简谱脚本 v1.0 说明手册；
- `legacy` 分支中留存的前端、示例和早期解析器；
- 原站 `/Zhipu-draw` 的实际表单与 SVG 响应。

旧接口接收 `code`、`customCode`、`pageConfig`、`pageNum` 四个表单字段，分页 SVG 以 `[fenye]` 分隔。核心库用 `RenderOptions` 表达同一组输入。

`renderSvgPages` 直接返回每一页的完整 SVG，适合浏览器下载或交给其他导出包；
`render` 保留原接口的 `[fenye]` 与 `noRedraw` 兼容协议。

## Development

```bash
pnpm -F @openfanqie/core test
pnpm -F @openfanqie/core build
```

谱面中的固定符号来自原渲染 API 的 SVG 路径，保存在
`src/assets/glyphs.json`，渲染时仍按需写入每页的 `defs`。标题、作者、歌词与用户注释
保留为文本；数字、小节线、倚音、力度和装饰记号等不依赖客户端字体。

原 API 可用时，可以重新提取并校验字形库：

```bash
pnpm -F @openfanqie/core glyphs:extract
```
