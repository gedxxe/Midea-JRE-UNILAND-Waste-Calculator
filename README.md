# Midea Daily Energy Report

**v0.3.0-alpha** · JRE / UNILAND · made in <3 by gede

[English](#english) | [中文](#中文) | [Indonesia](#indonesia)

## English

Enter cumulative readings in a table, check consumption, and copy the official factory report or Excel row. Sign in with a username and password to save reports to your own historian and reopen them on another device. The calculator also works without an account.

### Use

1. Select a factory and reading dates. Both reports use the **start date**: 16 September 08:00 to 17 September 08:00 WIB is a 16 September report.
2. Fill the table or paste one or two Excel columns. Decimal commas and dots are accepted; thousands separators are not. Missing readings use `-`; empty or invalid entries block copying and cloud saving.
3. Check the report. Combined reports require matching start and end dates for both factories.
4. **Save draft** keeps both factories locally. Guest drafts use this browser's localStorage. Signed-in drafts use this tab's sessionStorage and are cleared on logout or account change. Existing guest drafts are preserved separately and never uploaded automatically.
5. **Save report** sends the current factory to your account. The server validates and recalculates it. Historian lets you view the original saved output, choose a revision, and load readings into the editor. Saving an edited report adds a revision. A conflicting edit from another device is rejected so you can reopen the latest version.

Accounts are created by an admin; there is no public sign-up or Google login. Temporary passwords must be changed at first login. Admins can create, reset, disable, and enable operator accounts. Admin status does not grant access to another account's reports. Without email, account recovery requires an admin; admin recovery uses a local maintenance command.

The interface supports English (default), Simplified Chinese, and Indonesian. Equipment names, units, and copied reports retain the English factory templates. JRE has 29 equipment rows and 57 meters. UNILAND has 28 rows, and Trafo 1, 2, and 3 cumulative readings are already **MWh**. See [meter rules](docs/meter-rules.md).

### Develop and deploy

Use Node.js **22.x**, Vercel for the static site and Node APIs, and PostgreSQL (Neon) for accounts, sessions, reports, and revisions. The browser has no runtime packages. Server dependencies are pinned: `pg` for PostgreSQL and `@node-rs/argon2` for password hashing.

```sh
npm ci
# Create .env.local using .env.example, then enter development credentials locally.
npm run db:check
npm run db:migrate -- --apply
npm run admin:create -- power-engineer
node scripts/runtime-role.mjs --apply
npm run dev
```

Open `http://127.0.0.1:3000`. The first admin password is written to the ignored `.admin-setup.local.txt` file. Change it at first login and delete that file afterward. Bootstrap refuses to overwrite an existing admin.

Server configuration: `DATABASE_URL`, `AUTH_SECRET` (at least 32 random characters), and `APP_ORIGIN` (exact website origin, without a trailing slash). A Vercel Preview can derive its origin from `VERCEL_URL` if `APP_ORIGIN` is unset. `DATABASE_MIGRATION_URL` is an optional privileged connection for local maintenance only. Never put credentials in browser code, public variables, chat, or Git.

Use separate Neon development and production branches. Development/Preview use development credentials; Production uses production credentials. Production needs its own migrations, admin bootstrap, secret, and exact origin. Use a restricted database role for the running API. See [account setup and recovery](docs/accounts.md) before deployment.

```sh
npm run verify
# TEST_DATABASE_URL must point to a test/development PostgreSQL database.
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

Integration tests create synthetic accounts and reports, test the actual HTTP handlers against PostgreSQL, and remove their own records. They never use production credentials in CI. GitHub's **Quality gate** runs source/format checks, unit tests, PostgreSQL integration tests, build, and Chromium desktop/mobile tests. Browser regression tests mock account/time services; database integration and live development checks are separate evidence.

Vercel uses **Other**, repository root, Node 22.x, and `vercel.json`. The Git integration creates previews and deploys `main`. Environment configuration and database migration are explicit steps; builds never migrate the database. A successful build does not prove live database access or NTP availability.

### Versions and maintenance

| Version      | Contents                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| v0.1.0-alpha | Preserved baseline: tables, meter rules, asynchronous NTP                |
| v0.2.0-alpha | Language switch, build metadata, version history, CI                     |
| v0.3.0-alpha | Username/password accounts, private historian, revisions, database tests |

`package.json` is the version source. Work on `codex/vX.Y.Z-alpha`, pass Quality gate, and merge through a PR. Preserve tested milestones with immutable release branches and annotated tags. Never force push. [CHANGELOG.md](CHANGELOG.md), [AGENTS.md](AGENTS.md), and [release instructions](docs/releases.md) track changes and decisions.

The footer and `build-info.json` identify the version, commit, build time, source hash, and local changes. NTP uses Cloudflare with Google fallback, a 60-second server cache, and asynchronous browser refresh. Failures are visible and manual entry remains available. Server timestamps record database writes; browser NTP is not an authenticated audit clock.

Modules: `engine.js`, `numbers.js`, and `worksheet.js` hold pure calculation logic; `ui/` and `i18n/` hold interface behavior; `server/` holds authentication, access checks, database operations, and NTP; `api/` exposes HTTP handlers; `migrations/` holds versioned SQL.

This is an alpha reporting tool. Scheduled backups, restore drills, runtime monitoring, and independent security review remain deployment responsibilities. See [SECURITY.md](SECURITY.md). Rolling back code does not roll back database data; preserve revisions and use compatible forward migrations.

## 中文

在表格中填写累计读数，检查用量，然后复制工厂正式报告或 Excel 行。使用用户名和密码登录后，可将报告保存到个人历史记录并跨设备打开。计算器也可在未登录时使用。

### 使用方法

1. 选择工厂和日期。两家工厂都使用**开始日期**：WIB 9 月 16 日 08:00 至 17 日 08:00，报告日期为 16 日。
2. 填写表格或从 Excel 粘贴一列或两列。逗号和点均为小数分隔符，不支持千位分隔符。不可获取的数据填 `-`；空白或无效输入会阻止复制和云端保存。
3. 检查报告。合并报告要求两家工厂的开始与结束日期一致。
4. **保存草稿**在本地保留两家工厂的数据。访客草稿使用 localStorage；登录后的草稿使用当前标签页的 sessionStorage，退出或切换账户时清除。旧访客草稿单独保留，不会自动上传。
5. **保存报告**将当前工厂的数据提交到账户。服务器重新验证和计算。历史报告可查看原始输出、选择修订版、载入读数。修改后保存会新增修订版；其他设备已修改时，系统拒绝覆盖并要求重新打开最新版本。

管理员创建账户，没有公开注册或 Google 登录。首次登录必须修改临时密码。管理员可创建、重置、停用及启用操作员账户，但不能查看其他用户的私人报告。没有邮件恢复流程；操作员联系管理员，管理员通过本地维护命令恢复账户。

界面支持 English（默认）、简体中文和 Indonesia。设备名称、单位和复制的报告保留英文模板。JRE 有 29 个设备项目、57 个电表。UNILAND 有 28 项；Trafo 1、2、3 的累计读数已经是 **MWh**。详见[计量规则](docs/meter-rules.md)。

### 开发与部署

使用 Node.js **22.x**，Vercel 托管网站及 Node API，Neon PostgreSQL 保存账户、会话、报告和修订。浏览器没有运行时依赖；服务器使用固定版本的 `pg` 和 `@node-rs/argon2`。

运行 `npm ci`，参照 `.env.example` 创建 `.env.local` 并在本地填写开发凭据。依次执行 `npm run db:check`、`npm run db:migrate -- --apply`、`npm run admin:create -- power-engineer`、`npm run dev`。打开 `http://127.0.0.1:3000`。初始管理员密码写入 Git 忽略的 `.admin-setup.local.txt`，首次登录修改后删除该文件。已有管理员不会被覆盖。

服务器需要 `DATABASE_URL`、至少 32 个随机字符的 `AUTH_SECRET` 以及无结尾斜杠的准确 `APP_ORIGIN`。Preview 未设置 origin 时可使用 `VERCEL_URL`。`DATABASE_MIGRATION_URL` 仅用于本地维护。凭据不得放入浏览器代码、聊天或 Git。

开发与生产使用不同 Neon 分支。Development/Preview 连接开发分支，Production 连接生产分支。生产环境需单独迁移数据库、创建管理员并配置密钥及域名。API 使用受限数据库角色。部署步骤见[账户配置与恢复](docs/accounts.md)。

提交前运行 `npm run verify`、`npm run test:integration`、`npx playwright install chromium` 和 `npm run test:e2e`。集成测试要求 `TEST_DATABASE_URL` 指向测试或开发数据库，只创建并清理自己的测试记录。CI 的 Quality gate 使用独立 PostgreSQL 服务并运行桌面与移动浏览器测试。浏览器回归测试模拟账户和时间接口，不能代替真实服务检查。

Vercel 使用 Other 预设、仓库根目录和 Node 22.x。Git 集成创建 Preview 并部署 main。构建不会运行数据库迁移；环境变量与迁移需要单独配置。

### 版本、维护与限制

v0.1.0-alpha 保留表格、计算规则与 NTP 基线；v0.2.0-alpha 增加语言切换、构建信息与 CI；v0.3.0-alpha 增加账户、私人历史报告、修订和数据库测试。`package.json` 为版本来源。在 `codex/vX.Y.Z-alpha` 开发，通过 Quality gate 后提交 PR，保留不可修改的发布分支和附注标签，禁止强制推送。参见 [CHANGELOG.md](CHANGELOG.md)、[AGENTS.md](AGENTS.md) 和[发布说明](docs/releases.md)。

页脚及 build-info.json 显示版本、提交、构建时间和源文件哈希。浏览器异步同步 NTP，服务器先查询 Cloudflare，失败时使用 Google，缓存 60 秒。失败状态明确显示，仍可手动输入。数据库记录写入时间，浏览器时钟不是经过认证的审计时钟。

计算、界面、认证、数据库和时间服务分别维护。这是 alpha 报告工具；备份、恢复演练、运行监控和独立安全审核仍需在部署时安排。回滚代码不会回滚数据库，应保留修订并使用兼容的向前迁移。见[安全说明](SECURITY.md)。

## Indonesia

Isi reading kumulatif melalui tabel, periksa konsumsi, lalu salin laporan resmi pabrik atau baris Excel. Login dengan username dan password untuk menyimpan laporan ke historian pribadi dan membukanya dari perangkat lain. Kalkulator juga bisa dipakai tanpa akun.

### Pemakaian

1. Pilih pabrik dan tanggal. Kedua laporan menggunakan **tanggal awal**: 16 September 08.00 sampai 17 September 08.00 WIB menjadi laporan 16 September.
2. Isi tabel atau tempel satu atau dua kolom Excel. Koma dan titik berarti desimal, bukan ribuan. Data tidak tersedia memakai `-`; isian kosong atau invalid memblokir penyalinan dan penyimpanan ke akun.
3. Periksa laporan. Laporan gabungan membutuhkan tanggal awal dan akhir yang sama.
4. **Simpan draft** menyimpan kedua pabrik secara lokal. Draft tamu memakai localStorage; draft akun memakai sessionStorage di tab ini dan dibersihkan saat logout atau berganti akun. Draft tamu lama disimpan terpisah dan tidak diunggah otomatis.
5. **Simpan laporan** mengirim pabrik yang sedang dibuka ke akun. Server memvalidasi dan menghitung ulang reading. Historian menampilkan laporan asli, pilihan revisi, dan tombol untuk memuat reading. Koreksi menghasilkan revisi baru. Perubahan bersamaan dari perangkat lain ditolak agar pengguna membuka revisi terbaru.

Admin membuat akun, tanpa registrasi publik atau login Google. Password sementara wajib diganti saat login pertama. Admin bisa membuat, mereset, menonaktifkan, dan mengaktifkan akun operator. Admin tidak mendapat akses ke laporan pribadi akun lain. Pemulihan operator melalui admin; pemulihan admin menggunakan perintah pemeliharaan lokal.

Antarmuka mendukung English (default), 简体中文, dan Indonesia. Nama equipment, satuan, dan laporan yang disalin tetap mengikuti template English. JRE memiliki 29 equipment dan 57 meter. UNILAND memiliki 28 equipment; reading Trafo 1, 2, dan 3 sudah **MWh**. Lihat [aturan meter](docs/meter-rules.md).

### Pengembangan dan deployment

Gunakan Node.js **22.x**, Vercel untuk website dan API Node, serta Neon PostgreSQL untuk akun, sesi, laporan, dan revisi. Browser tetap tanpa dependency runtime. Dependency server memakai versi tetap: `pg` dan `@node-rs/argon2`.

Jalankan `npm ci`, buat `.env.local` berdasarkan `.env.example`, lalu isi kredensial development langsung di file lokal. Jalankan `npm run db:check`, `npm run db:migrate -- --apply`, `npm run admin:create -- power-engineer`, dan `npm run dev`. Buka `http://127.0.0.1:3000`. Password admin sementara tersimpan di `.admin-setup.local.txt` yang diabaikan Git. Ganti saat login pertama lalu hapus file tersebut. Bootstrap tidak menimpa admin yang sudah ada.

Konfigurasi server: `DATABASE_URL`, `AUTH_SECRET` minimal 32 karakter acak, dan `APP_ORIGIN` berupa origin website lengkap tanpa slash di akhir. Preview dapat memakai `VERCEL_URL` jika origin belum diatur. `DATABASE_MIGRATION_URL` opsional untuk pemeliharaan lokal. Kredensial tidak boleh masuk kode browser, chat, atau Git.

Pisahkan branch Neon development dan production. Development/Preview memakai koneksi development; Production memakai koneksi production. Production membutuhkan migration, admin, secret, dan origin sendiri. Gunakan role database terbatas untuk API. Baca [setup dan pemulihan akun](docs/accounts.md).

Sebelum PR, jalankan `npm run verify`, `npm run test:integration`, `npx playwright install chromium`, dan `npm run test:e2e`. Tes integrasi membutuhkan `TEST_DATABASE_URL` menuju database test/development dan membersihkan hanya data tesnya sendiri. Quality gate di CI menggunakan PostgreSQL terpisah, pengujian unit, build, serta browser desktop dan mobile. Tes browser memakai mock akun dan waktu; pemeriksaan layanan langsung dilakukan terpisah.

Vercel memakai preset Other, root repo, dan Node 22.x. Integrasi Git membuat preview dan deploy main. Build tidak menjalankan migration; konfigurasi environment dan database merupakan langkah tersendiri.

### Versi, pemeliharaan, dan batasan

v0.1.0-alpha menyimpan baseline tabel, aturan meter, dan NTP. v0.2.0-alpha menambahkan bahasa, informasi build, dan CI. v0.3.0-alpha menambahkan akun, historian pribadi, revisi, serta tes database. Versi bersumber dari `package.json`. Kerjakan di `codex/vX.Y.Z-alpha`, lolos Quality gate, lalu gunakan PR. Simpan milestone melalui branch rilis dan annotated tag yang tidak dipindahkan. Jangan force push. Lihat [CHANGELOG.md](CHANGELOG.md), [AGENTS.md](AGENTS.md), dan [panduan rilis](docs/releases.md).

Footer dan build-info.json menunjukkan versi, commit, waktu build, serta hash sumber. NTP berjalan asynchronous melalui Cloudflare dengan Google sebagai cadangan dan cache server 60 detik. Kegagalan ditampilkan dan input manual tetap tersedia. Waktu pencatatan memakai server database; clock browser bukan waktu audit terautentikasi.

Modul perhitungan, UI, autentikasi, database, dan NTP dipisahkan. Aplikasi masih alpha. Backup terjadwal, latihan pemulihan, monitoring, dan tinjauan keamanan independen tetap perlu disiapkan untuk deployment. Rollback kode tidak mengembalikan database; pertahankan revisi dan gunakan migration lanjutan yang kompatibel. Lihat [SECURITY.md](SECURITY.md).
