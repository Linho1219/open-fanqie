# Open Fanqie JPEG Export

`@openfanqie/export-jpg` 在浏览器中把完整 SVG 文档转换为 JPEG `Blob`。包本身没有运行时依赖，且导入时不会访问 DOM，因此服务端渲染环境可以安全加载它；实际转换只能在支持 SVG、Canvas 和 `HTMLCanvasElement.toBlob` 的浏览器中运行。

## Usage

```ts
import { renderSvgPages } from '@openfanqie/core'
import { svgPagesToJpegs, svgToJpeg } from '@openfanqie/export-jpg'

const [page] = renderSvgPages('Q: 1 2 3 4 |')
if (page !== undefined) {
  const jpeg = await svgToJpeg(page)
  const highResolutionJpeg = await svgToJpeg(page, {
    scale: 300 / 96,
    dpi: 300,
    quality: 0.95,
    background: '#ffffff',
  })
}

const pages = await svgPagesToJpegs(renderSvgPages('Q: 1 |\n[fenye]\nQ: 2 |'))
```

默认参数为 `scale: 1`、`dpi: 96`、`quality: 0.92` 和白色背景。设置 `scale: 300 / 96` 与 `dpi: 300` 可生成与原版“DPI 300”选项一致的像素倍率和分辨率元数据。多页转换按顺序进行，避免同时创建多个高分辨率画布。

`readSvgDimensions(svg)` 是不依赖 DOM 的辅助函数。它优先读取 SVG 根元素的绝对 `width` 和 `height`，缺失或使用相对单位时回退到 `viewBox`，并返回 CSS 像素尺寸。

## Development

```bash
pnpm -F @openfanqie/export-jpg test
pnpm -F @openfanqie/export-jpg build
```
