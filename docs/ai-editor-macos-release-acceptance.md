# AI Editor macOS 发布候选验收

`npm run verify-ai-editor-macos-release` 是 macOS x64/arm64 解包成品的发布阻断脚本。
正式发布流水线必须在对应架构的 macOS 主机执行，不依赖开发者 shell 中预装的 Proxy。

## 固定双仓库输入

Code 构建使用 `build/ai-editor-proxy/release.json` 固定以下 Proxy 输入：

- GitHub 仓库；
- 完整 40 位 commit；
- npm package 版本。

`npm run prepare-ai-editor-proxy` 会同时校验源码工作树干净、当前 commit 和
`package.json` 版本。更新 Proxy 时必须显式修改该文件，不能在发布时静默使用
`master` 或其他可变引用。

## 本地或流水线执行

先在 macOS 对应架构完成 Proxy 制品、`core-ci` 和产品打包，再执行：

```bash
npm run verify-ai-editor-macos-release -- --arch x64
```

也可以指定产品和报告路径：

```bash
npm run verify-ai-editor-macos-release -- \
  --arch arm64 \
  --product-root "/path/to/Code - OSS.app" \
  --report ".build/ai-editor-release/macos-arm64-release-report.json"
```

## 验收内容

1. `.app` 包含 Workbench、Codex Agent Host、Codex JS 启动器、对应架构原生运行时、
   简体中文语言包和 Proxy 制品。
2. `product.json` 的全部 Workbench checksum 与实际文件一致。
3. Proxy 平台、固定 commit/版本、文件集合和逐文件 SHA-256 全部匹配。
4. 主产品和 Proxy 的 Codex/undici 第三方声明存在。
5. 使用空 Code 用户目录、空 Proxy 数据目录和备用端口启动 `.app`：
   - Code 从 `Contents/Resources/app/ai-editor-proxy` 后台启动 Proxy；
   - `/live` 和 `/admin` 可访问；
   - 未配置状态 `/ready` 返回 HTTP 503，模型目录为空；
   - 关闭本次隔离 Code 后 Proxy 进程和 PID 保持不变；
   - 验证结束只清理备用端口测试 Proxy，不接触共享 `47892` Proxy。
6. `--require-signature` 会额外要求 `codesign --verify --deep --strict` 通过。

报告写入：

```text
.build/ai-editor-release/macos-<arch>-release-report.json
.build/ai-editor-release/macos-<arch>-release-report.md
```

## GitHub Actions

`.github/workflows/ai-editor-macos-release.yml` 使用标准 `macos-14` arm64 运行器：

1. 从固定 commit checkout Code 和 `codex_proxy`；
2. 运行 Proxy 检查和测试；
3. 生成并校验 `darwin-arm64` Proxy 制品；
4. 构建、打包并执行干净首次启动验收；
5. 创建 DMG，执行 `hdiutil verify`；
6. 挂载 DMG 后再次校验其中 `.app` 的资源完整性；
7. 上传 DMG、SHA-256 和脱敏验收报告，保留 7 天。

公开 CI 生成的是未签名候选包，因此签名状态会记录为未验证，但不会阻断构建。正式发布
提升必须在具备 Apple Developer ID 和公证凭据的受控流水线中使用
`--require-signature`，并在公证后再次执行同一资源验收。

Intel x64 和 universal 产物仍需在可用的 Intel macOS 构建环境完成同等级验收；标准
`macos-14` GitHub Hosted 镜像当前为 arm64，不能把 arm64 Node 依赖缓存误作 x64
发布输入。
