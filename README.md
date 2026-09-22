# Midea Daily Energy Report

**v0.2.0-alpha** · JRE / UNILAND · made in <3 by gede

[English](#english) | [中文](#中文) | [Indonesia](#indonesia)

## English

A table-based daily meter report for JRE and UNILAND. Enter cumulative start and end readings, review consumption and warnings, then copy the factory report or an Excel row. Calculations run in the browser. No account, database, analytics, or runtime packages are required.

### Use

1. Select a factory and reading dates. Both reports use the **start date**: 16 September 08:00 to 17 September 08:00 WIB is reported as 16 September.
2. Enter readings in the table. You can paste one or two Excel columns, search equipment, and filter incomplete rows. A comma or dot means a decimal separator, never a thousands separator.
3. Review warnings and copy the report. Missing data uses `-`; empty or invalid fields block copying. Combined reports require matching start and end dates for both factories.
4. Save the draft explicitly to keep it in this browser. Next day moves end readings to start readings. Clear, import, example loading, and next day support one-step undo.

The language switch offers English (default), 简体中文, and Indonesian for the main interface. Equipment names, units, copied reports, and detailed technical diagnostics retain their canonical wording. Switching language does not translate or change readings. Reports follow the supplied English factory templates.

JRE has 29 equipment rows and 57 meters. UNILAND has 28 equipment rows; Trafo 1, 2, and 3 cumulative readings are already **MWh**. Fixed ratios, missing-data handling, output precision, and worksheet mappings are documented in [meter rules](docs/meter-rules.md) and tested in `tests/engine.test.mjs`.

### Versions, logs, and rollback

| Version                         | Meaning                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `v0.1.0-alpha`                  | Preserved baseline at commit `8e5bb21`: tables, meter rules, and asynchronous NTP  |
| `v0.2.0-alpha`                  | Language switch, build identification, release history, agent instructions, and CI |
| `v0.2.1-alpha` / `v0.3.0-alpha` | Examples of the next fix / feature release, not existing releases                  |

`package.json` is the version source. Increment the patch number for fixes and the minor number for features. Keep `-alpha` until a reviewed stable release is ready. The old package label `2.0.0` was untracked metadata, not a released stable milestone.

The footer shows version and commit. **Build details** includes build time, source hash, and whether local changes were detected. `/build-info.json` contains the same metadata. [CHANGELOG.md](CHANGELOG.md) records release changes. NTP refreshes emit JSON logs containing event, time, version, commit, outcome, source, attempts, and duration. Meter readings and drafts are never logged or sent to this endpoint.

Work in `codex/vX.Y.Z-alpha`, open a pull request, and pass CI before merging into `main`. Preserve verified milestones with `release/vX.Y.Z-alpha` and an annotated tag. Never force push or move a published release tag. Roll back through a revert PR, or select the previous deployment in Vercel and then reconcile Git through a PR. See [release and rollback steps](docs/releases.md). [AGENTS.md](AGENTS.md) keeps the current requirements and decisions for future agents.

### Develop and deploy

Use Node.js **22.x** and npm:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. Before a pull request:

```sh
npm run verify
npx playwright install chromium
npm run test:e2e
```

`verify` checks syntax, module paths, versions, translation placeholders, formatting, unit tests, and the build. Browser tests cover desktop and mobile flows. `npm run format` applies formatting. Build output is `dist/`; `npm run preview` serves that output and the local time endpoint. Prettier and Playwright are development-only dependencies pinned in the lockfile.

GitHub Actions runs the **Quality gate** check on pull requests and version branches. Vercel's existing Git integration creates previews and deploys `main` to production. The Vercel build runs source checks, unit tests, and the static build; GitHub CI adds formatting and browser tests. Use the **Other** preset, repository root, and Node.js 22.x. No application secrets are required. Main-branch protection must require the Quality gate and a PR; it is a GitHub setting, not something a YAML file enables by itself.

Time synchronization is asynchronous: the browser calls `/api/time`, which queries Cloudflare NTP with Google as fallback. Each server instance caches a sample for 60 seconds. The browser picks the lowest round-trip sample, advances it with a monotonic clock, and refreshes every five minutes while visible. Failures are visible, retry after one minute, and do not block manual entry. UDP port 123 must be available in the server environment. This is NTP, not authenticated NTS or a machine-control clock.

This is an alpha release with automated checks, not an industrial certification. Operational review of the meter mapping and reports remains necessary. Drafts stay in localStorage on the same browser profile and are saved only on request. See [SECURITY.md](SECURITY.md).

### Code layout

| Module                                     | Responsibility                                                        |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `schema.js`                                | Official equipment, meter counts, ratios, and units                   |
| `engine.js`, `numbers.js`, `worksheet.js`  | Pure calculations, validation, reports, and Excel mapping             |
| `importer.js`, `storage.js`                | Validated imports, local drafts, next-day transition                  |
| `app.js`, `ui/`, `i18n/`                   | Page coordination, table interaction, language catalog, build display |
| `clock.js`, `api/time.js`, `server/`       | Client clock, time API, NTP transport, structured service logs        |
| `scripts/`, `tests/`, `.github/workflows/` | Build metadata, local server, checks, tests, CI                       |

## 中文

用于 JRE 和 UNILAND 的每日电表报告工具。在表格中填写开始和结束的累计读数，检查用量与提示，再复制工厂报告或 Excel 行。计算在浏览器中完成，无需账户、数据库、分析追踪或运行时依赖包。

### 使用方法

1. 选择工厂和抄表日期。两家工厂的报告均使用**开始日期**。例如 WIB 9 月 16 日 08:00 至 9 月 17 日 08:00，报告日期为 9 月 16 日。
2. 填写表格，可以从 Excel 粘贴一列或两列、搜索设备、筛选未完成项。逗号和点均表示小数分隔符，不表示千位分隔符。
3. 检查提示后复制报告。无法获取的数据填写 `-`；空白或无效字段会阻止复制。合并报告要求两家工厂的开始和结束日期都一致。
4. 点击保存草稿，将数据保留在当前浏览器中。“下一天”将结束读数移到开始列。清空、导入、加载示例和进入下一天均支持撤销最近一次操作。

语言切换支持 English（默认）、简体中文和 Indonesia，主要用于操作界面。设备名称、单位、复制的报告和详细技术诊断保留固定文字。切换语言不会更改读数；报告仍遵循工厂提供的英文模板。

JRE 有 29 个设备项目和 57 个电表；UNILAND 有 28 个设备项目。UNILAND 的 Trafo 1、2、3 累计读数已经是 **MWh**。倍率、缺失数据处理、精度和 Excel 映射详见[计量规则](docs/meter-rules.md)，并由自动测试检查。

### 版本、日志与回滚

`v0.1.0-alpha` 保留提交 `8e5bb21` 的表格、计算规则及异步 NTP 功能。当前 `v0.2.0-alpha` 增加语言切换、构建信息、版本记录、代理说明和 CI。版本以 `package.json` 为准：修复可递增为 `v0.2.1-alpha`，新功能可递增为 `v0.3.0-alpha`。这两个版本号仅为示例。旧的 `2.0.0` 只是未跟踪的软件包标签，不代表已发布的稳定版本。

页面底部显示版本和提交号，构建信息包含构建时间、源文件哈希及本地修改状态；同样的信息可在 `/build-info.json` 查看。[CHANGELOG.md](CHANGELOG.md) 记录版本变化。NTP 刷新输出 JSON 日志，包括事件、时间、版本、提交号、结果、来源、尝试次数和耗时，不包含读数或草稿。

在 `codex/vX.Y.Z-alpha` 分支开发，通过 PR 和 CI 后合并至 `main`。验证后的版本保留 `release/vX.Y.Z-alpha` 分支和附注标签。禁止强制推送或移动已发布的标签。回滚使用撤销 PR；也可先在 Vercel 恢复上一部署，再通过 PR 使代码保持一致。详见[发布与回滚](docs/releases.md)。[AGENTS.md](AGENTS.md) 保存当前需求与用户决定。

### 开发、部署与限制

使用 Node.js **22.x**。运行 `npm ci`、`npm run dev`，然后打开 `http://127.0.0.1:3000`。提交 PR 前运行 `npm run verify`、`npx playwright install chromium` 和 `npm run test:e2e`。格式化使用 `npm run format`。构建输出在 `dist/`，`npm run preview` 可预览构建结果。

GitHub Actions 的 **Quality gate** 检查语法、模块路径、版本、翻译占位符、格式、单元测试和桌面及移动浏览器流程。Prettier 和 Playwright 仅用于开发，版本由锁文件固定。Vercel 使用现有 Git 集成创建预览，并从 `main` 部署生产环境；构建时执行源代码检查、单元测试和静态构建。使用 **Other** 预设、仓库根目录和 Node.js 22.x，无需应用密钥。必须在 GitHub 分支保护设置中要求 PR 和 Quality gate，工作流文件本身不会启用此保护。

浏览器异步请求 `/api/time`，服务器通过 Cloudflare NTP 获取时间，失败时尝试 Google。服务器样本缓存 60 秒；浏览器选择往返耗时最低的样本，用单调时钟推进时间，页面可见时每五分钟更新。失败会显示状态并在一分钟后重试，仍可手动输入日期。服务器需要允许 UDP 123。该时钟不是 NTS，也不是机器控制用时钟。

这是带自动检查的 alpha 版本，不代表工业认证。实际使用前仍需审核电表映射和报告。草稿只在用户保存后写入当前浏览器的 localStorage，不会跨设备同步。模块职责见上方代码结构表；计算、界面、语言和时间服务分别维护。更多信息见[安全与数据说明](SECURITY.md)。

## Indonesia

Alat laporan meter harian JRE dan UNILAND berbasis tabel. Isi reading kumulatif awal dan akhir, periksa konsumsi serta catatan, lalu salin laporan pabrik atau baris Excel. Perhitungan berjalan di browser tanpa akun, database, analytics, atau dependency runtime.

### Pemakaian

1. Pilih pabrik dan periode. Kedua laporan memakai **tanggal awal**: 16 September 08.00 sampai 17 September 08.00 WIB dilaporkan sebagai 16 September.
2. Isi tabel, tempel satu atau dua kolom Excel, cari equipment, atau tampilkan baris yang belum lengkap. Koma dan titik berarti desimal, bukan pemisah ribuan.
3. Periksa catatan lalu salin laporan. Data tidak tersedia ditulis `-`; kolom kosong atau invalid memblokir penyalinan. Laporan gabungan membutuhkan tanggal awal dan akhir yang sama untuk kedua pabrik.
4. Simpan draft secara manual agar tersimpan di browser ini. Lanjut hari berikutnya memindahkan reading akhir ke awal. Kosongkan, impor, isi contoh, dan lanjut hari mendukung pembatalan satu langkah.

Switch bahasa menyediakan English (default), 简体中文, dan Indonesia untuk antarmuka utama. Nama equipment, satuan, laporan yang disalin, dan detail diagnostik teknis memakai wording tetap. Mengganti bahasa tidak mengubah angka. Laporan tetap mengikuti template pabrik berbahasa Inggris.

JRE memiliki 29 equipment dengan 57 meter. UNILAND memiliki 28 equipment; reading kumulatif Trafo 1, 2, dan 3 sudah **MWh**. Ratio, missing data, presisi, dan pemetaan Excel dijelaskan di [aturan meter](docs/meter-rules.md) serta diperiksa dalam pengujian otomatis.

### Versi, logging, dan rollback

`v0.1.0-alpha` menyimpan baseline commit `8e5bb21` yang mencakup tabel, aturan meter, dan NTP asynchronous. Revisi ini adalah `v0.2.0-alpha`: switch bahasa, informasi build, riwayat rilis, instruksi agent, dan CI. Versi bersumber dari `package.json`. Perbaikan berikutnya bisa memakai `v0.2.1-alpha`, fitur berikutnya `v0.3.0-alpha`; keduanya baru contoh. Label lama `2.0.0` adalah metadata package yang belum dilacak sebagai rilis stabil.

Footer menunjukkan versi dan commit. **Detail build** memuat waktu build, hash sumber, serta status perubahan lokal; informasi yang sama tersedia di `/build-info.json`. [CHANGELOG.md](CHANGELOG.md) mencatat perubahan rilis. Log NTP berbentuk JSON berisi event, waktu, versi, commit, hasil, sumber, jumlah percobaan, dan durasi. Reading serta draft tidak masuk log atau dikirim ke endpoint tersebut.

Kerjakan perubahan di `codex/vX.Y.Z-alpha`, buka PR, lalu lolos CI sebelum masuk `main`. Simpan milestone terverifikasi dalam branch `release/vX.Y.Z-alpha` dan annotated tag. Jangan force push atau memindahkan tag rilis yang sudah terbit. Rollback melalui PR revert, atau pulihkan deployment sebelumnya di Vercel lalu sesuaikan Git melalui PR. Lihat [langkah rilis dan rollback](docs/releases.md). [AGENTS.md](AGENTS.md) menyimpan kebutuhan serta keputusan pengguna untuk agent berikutnya.

### Pengembangan, deployment, dan batasan

Gunakan Node.js **22.x**. Jalankan `npm ci` dan `npm run dev`, lalu buka `http://127.0.0.1:3000`. Sebelum PR, jalankan `npm run verify`, `npx playwright install chromium`, dan `npm run test:e2e`. Gunakan `npm run format` untuk merapikan format. Hasil build berada di `dist/`; `npm run preview` menyajikan hasil build dan endpoint waktu lokal.

**Quality gate** di GitHub Actions memeriksa syntax, jalur modul, versi, placeholder terjemahan, format, unit test, serta alur browser desktop dan mobile. Prettier dan Playwright hanya dependency pengembangan dengan versi tetap. Integrasi Git Vercel membuat preview dan deployment production dari `main`. Build Vercel menjalankan pemeriksaan sumber, unit test, dan build statis. Gunakan preset **Other**, root repository, serta Node.js 22.x. Aplikasi tidak memerlukan secret. Proteksi `main` harus mewajibkan PR dan Quality gate melalui pengaturan GitHub; YAML saja tidak mengaktifkan proteksi branch.

Sinkronisasi berjalan asynchronous melalui `/api/time`, dengan Cloudflare NTP dan cadangan Google. Sampel server disimpan 60 detik. Browser memilih sampel dengan perjalanan terpendek, meneruskan waktu memakai clock monotonic, lalu menyinkron ulang setiap lima menit saat halaman terlihat. Kegagalan ditampilkan dan dicoba lagi setelah satu menit; input manual tetap berjalan. Server memerlukan akses UDP 123. Ini NTP, bukan NTS atau acuan waktu kontrol mesin.

Versi ini masih alpha dengan pemeriksaan otomatis, bukan sertifikasi industri. Pemetaan meter dan hasil laporan tetap perlu ditinjau untuk penggunaan operasional. Draft hanya ditulis ke localStorage saat diminta dan tidak tersinkron antarperangkat. Pembagian modul ada pada tabel struktur kode di bagian English; perhitungan, UI, bahasa, dan layanan waktu terpisah. Lihat [SECURITY.md](SECURITY.md).
