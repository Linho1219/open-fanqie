# Open Fanqie

[![Pages deploy](https://github.com/Linho1219/open-fanqie/actions/workflows/deploy.yml/badge.svg)](https://github.com/Linho1219/open-fanqie/actions/workflows/deploy.yml)

番茄简谱的开源渲染核心和兼容应用。部署于 <https://fanqie.linho.cc/>。

## 关于

简谱，也称数字谱，是中国大陆地区通行的记谱方式。用数字表记音高，表示时值的符杠以数字下划线形式表记。市面上制作简谱的免费软件较少。

番茄简谱是一款用户数量不少的免费简谱软件，它定义了一套称为「番茄简谱脚本」的 DSL，将其编译成 SVG 形式的谱面。并提供了一套 [说明文档](http://doc.lezhi99.com/zhipu)（[镜像](http://fqdoc.linho.cc/)）。

原版以 [在线服务](http://zhipu.lezhi99.com/Zhipu-index.html) 的形式提供，实际上谱面渲染由 PHP 后端完成（每次编辑内容都会产生请求，后端返回 SVG）。维护状态比较糟糕，证书过期且偶发服务中断。由于难以联系到原作者，因此有了该项目。

本项目的目标是从头实现一遍番茄简谱脚本的解析与渲染逻辑，使用 TypeScript 以便在前端直接执行，无需发送回后端渲染，不依赖网络。并以此为基础重写前端与客户端。

当前计划：

- [x] 语法解析器核心
- [x] SVG 渲染器核心
- [x] 实现全流程谱面渲染
- [ ] 导出 PDF
- [x] 拼回原版前端
- [x] 基于原版前端上线网站
- [ ] 基于原版前端打包客户端
- [ ] 重写新前端
- [ ] 基于新前端上线网站
- [ ] 基于新前端打包客户端

解析和渲染器的细节冗杂、逻辑量大，且需要与原接口对齐，因此本项目大量使用了 LLM。不过 AI 生成代码均经人类复核与测试。

## 结构

使用 pnpm workspace 管理，各包位于 `packages` 目录：

- `@openfanqie/core`：解析 DSL 并输出 SVG。
- `@openfanqie/legacy-app`：直接 vendor 的原版前端，略作修改以接入重写版渲染核心。

## License

脚本解析器与渲染器为从零实现，以 MIT 协议开源。

原版前端为原网站直接爬取，复制入仓库。尽管原网站上明文提供，但严格来说仅为 source available，并非开源。若有侵权请通过 issue 联系我删除。
