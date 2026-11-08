```text
███╗   ███╗ █████╗ ████████╗ ██████╗██╗  ██╗ █████╗   █████╗ ██╗   ██╗ ██████╗ ██╗   ██╗███████╗████████╗   █████╗    ██╗  ██████╗
████╗ ████║██╔══██╗╚══██╔══╝██╔════╝██║  ██║██╔══██  ██╔══██╗██║   ██║██╔════╝ ██║   ██║██╔════╝╚══██╔══╝  ██╔══██╗  ███║  ╚════██╗
██╔████╔██║███████║   ██║   ██║     ███████║███████║ ███████║██║   ██║██║  ███╗██║   ██║███████╗   ██║     ╚█████╔╝  ╚██║   █████╔╝
██║╚██╔╝██║██╔══██║   ██║   ██║     ██╔══██║██╔══██║ ██╔══██║██║   ██║██║   ██║██║   ██║╚════██║   ██║     ██╔══██╗   ██║   ╚═══██╗
██║ ╚═╝ ██║██║  ██║   ██║   ╚██████╗██║  ██║██║  ██║ ██║  ██║╚██████╔╝╚██████╔╝╚██████╔╝███████║   ██║     ╚█████╔╝   ██║  ██████╔╝
╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚══════╝   ╚═╝      ╚════╝    ╚═╝  ╚═════╝








╔══════════════════════════════════════════════════════════════════════════╗
║ made by : matchaaugust813                                                ║
║ tiktok  : matchaaugust_                                                  ║
╚══════════════════════════════════════════════════════════════════════════╝
```

# antigravity-rpc

Discord Rich Presence untuk **Antigravity CLI (`agy`)**: model, project, token live, estimasi biaya (simulasi), statistik lifetime, kartu per status yang berganti-ganti (sama seperti claude-rpc), dan dashboard lokal. Proyek ini **terpisah** dari claude-rpc (folder, data, dan nama perintah berbeda), jadi keduanya bisa terpasang bersamaan.

## Cara kerja singkat

- **Hooks** (`hooks.json`): status berpikir / bekerja / menunggu, jumlah prompt dan tool call.
- **statusLine**: satu-satunya tempat agy memberi data **token, model, dan kuota**. Karena itu `setup` memasang keduanya.
- **Daemon** di background mengirim kartu ke Discord (aplikasi desktop Discord harus terbuka).
- agy tidak punya event SessionEnd, jadi kartu disembunyikan otomatis setelah `hideAfterSec` (default 30 menit) tanpa aktivitas.

## Pasang

**Syarat:** Windows (PowerShell), [Node.js](https://nodejs.org) 18+, Antigravity CLI (`agy`), dan aplikasi **Discord desktop** yang sedang terbuka (versi browser tidak bisa).

**1. Buat aplikasi Discord**
- Buka https://discord.com/developers/applications → **New Application**. Nama aplikasi inilah yang tampil sebagai "Playing ..." di profilmu.
- Salin **Application ID** (angka saja).
- Opsional: di *Rich Presence → Art Assets* upload gambar dengan nama `antigravity` (besar) dan `working`, `thinking`, `waiting`, `idle` (kecil).

**2. Unduh dan pasang**
```powershell
git clone https://github.com/<username-kamu>/antigravity-rpc
cd antigravity-rpc
npm link
antigravity-rpc setup --client-id 123456789012345678
```
Ganti angka di atas dengan Application ID kamu. `setup` memasang hooks dan statusLine ke agy (file asli dicadangkan sebagai `*.antigravity-rpc.bak`).

**3. Restart agy**, lalu di dalam agy jalankan `/hooks` untuk memastikan hook terbaca. Jalankan `/statusline on` kalau status bar mati.

**4. Jalankan dan cek**
```powershell
antigravity-rpc start
antigravity-rpc status
```
`status` harus menampilkan `session:` yang terisi setelah kamu mengirim satu prompt di agy, dan baris `card now:` menunjukkan kartu yang sedang dikirim ke Discord. Mau lihat tampilannya tanpa memakai agy? Jalankan `antigravity-rpc demo`.

## Update

```powershell
cd antigravity-rpc
git pull
antigravity-rpc stop
antigravity-rpc start
```
Daemon yang sedang berjalan tidak ikut berganti kode, jadi `stop` lalu `start` wajib setelah update. Cek `antigravity-rpc status`: baris `version` harus sesuai.

## Kartu di Discord

Isi kartu disamakan dengan claude-rpc: tiap status punya satu kartu utama, lalu kartu statistik berputar tiap `rotateSec` detik (minimal 15). Kartu yang datanya kosong dilewati otomatis.

| Status | Kartu utama |
|---|---|
| `working` | `Working in <project>` · tool + file aktif + token sesi. Berputar ke: milestone sesi (1h/2h/3h/5h/8h/12h), Usage |
| `thinking` | `Thinking in <project>` · model · prompt · token |
| `compacting` | `Compacting context` (terdeteksi saat total input agy turun tajam) |
| `shipped` | `Pushed to main` / `Committed on <branch>` + subjek commit, tampil `shippedFrameSec` detik setelah `git push/commit`, `gh pr/issue/release create` |
| `waiting` | `Waiting on you` (agy selesai giliran), lalu berputar lewat semua kartu statistik di bawah |
| `idle` | `Idle in <project>` · model · jam hari ini, lalu berputar lewat kartu statistik |

Kartu statistik yang berputar: **This week**, **streak** (muncul di milestone 7/14/21…/30/60/100/365 hari), **Hotspot** (file paling sering diedit), **Model split**, **all-time** (jam, sesi, prompt), **Lifetime** (token, tool call, file), **fresh tokens + % cache**, **Code churn** (baris ditambah, net, bahasa teratas), **Cost** (hari ini / all-time, simulasi), **Usage** (kuota agy, butuh `showQuota: true`), **Daily goal**, **Monthly budget**. Tooltip gambar besar: `<model> · <jam> on Antigravity · <streak>`.

Catatan: kartu Hotspot dan Code churn bergantung pada argumen tool yang dikirim agy di hook `PostToolUse` (`TargetFile`, `CodeContent`, `TargetContent`, `ReplacementContent`). Kalau agy tidak mengirimnya, kartu itu otomatis tidak muncul. Timer "tool berjalan" milik claude-rpc tidak ada di sini karena agy tidak punya event PreToolUse yang aman dipakai.

## Perintah

| Perintah | Fungsi |
|---|---|
| `antigravity-rpc setup [--client-id ID]` | pasang hooks + statusLine, simpan App ID |
| `antigravity-rpc uninstall` | lepas hooks + kembalikan statusLine lamamu |
| `antigravity-rpc start` / `stop` | jalankan / hentikan daemon di background |
| `antigravity-rpc status` | sesi live, token, biaya simulasi, kuota |
| `antigravity-rpc stats` | statistik lifetime |
| `antigravity-rpc pause` / `resume` | sembunyikan / tampilkan kartu |
| `antigravity-rpc dashboard` | buka dashboard (http://localhost:4790) |
| `antigravity-rpc demo` | simulasi sesi agy untuk lihat kartu |
| `antigravity-rpc debug on|off|show` | rekam *bentuk* payload agy (hanya nama field, tanpa isi) |

## Konfigurasi

File: `%USERPROFILE%\.antigravity-rpc\config.json`. Contoh:

```json
{
  "clientId": "123456789012345678",
  "priceAs": "sonnet",
  "rotate": true,
  "rotateSec": 15,
  "showQuota": false,
  "showProject": true,
  "showCost": true,
  "hideAfterSec": 1800,
  "shippedFrameSec": 60,
  "goals": { "dailyHours": 4, "dailyPrompts": 0, "weeklyHours": 0 },
  "budget": { "monthly": 20, "warnAtPct": 80 },
  "showSmallImage": true,
  "largeImageKey": "antigravity"
}
```

- `showQuota: true` menampilkan kartu **Usage** (kuota 5 jam / mingguan agy, ditampilkan sebagai persen terpakai).
- `goals` / `budget`: isi angka > 0 untuk mengaktifkan kartu **Daily goal** / **Monthly budget**.
- `shippedFrameSec: 0` mematikan kartu shipped. `compactDetect: false` mematikan deteksi compacting.
- `appName` (default `Antigravity`) dipakai sebagai pengganti nama project kalau folder kerja = folder home (supaya username tidak bocor).
- `priceAs`: `sonnet`, `opus`, `haiku`, `fable`, atau `""` untuk tabel harga per model.
- `presence`: ubah teks kartu sendiri. Contoh: `{"presence":{"byStatus":{"idle":{"details":"Idle di {project}"}}}}`. Variabel yang tersedia ada di `buildVars` (`src/presence.js`); `requires` menyembunyikan kartu kalau variabelnya kosong.
- Opsi `tokenLabel` dan `simLabel` sudah tidak dipakai (teks "tokens" sekarang tetap, seperti claude-rpc). Opsi `pages` diganti `presence`.
- Opsi lain: `largeImages`, `gifBaseUrl`, `idleAfterSec`, `dashboardPort`, `nodeCommand`.

## Troubleshooting

Mulai dari sini: `antigravity-rpc status`. Baris `version`, `session`, dan `card now` biasanya langsung menunjukkan di mana masalahnya.

| Gejala | Penyebab dan solusi |
|---|---|
| Kartu tidak muncul di Discord | Pakai Discord **desktop** (bukan browser) dan aktifkan *Settings → Activity Privacy → Share your detected activity*. Pastikan `status` menampilkan `daemon: running` dan `discord id` terisi. Cek log (lihat bawah): harus ada `Discord connected as ...`. |
| `session: none` | Hook belum terbaca. Restart agy, jalankan `/hooks`, lalu kirim satu prompt. Kalau agy memakai file hooks lain: `antigravity-rpc setup --hooks-file "C:\path\hooks.json"` (default `~/.gemini/config/hooks.json`). |
| Token 0 / tidak ada model | statusLine belum aktif. Jalankan `/statusline on` di agy, atau `antigravity-rpc setup --settings-file "C:\path\settings.json"` (default `~/.gemini/antigravity-cli/settings.json`, atau `%APPDATA%\antigravity-cli\settings.json`). |
| Hook gagal di PowerShell | Isi `nodeCommand` di `config.json` dengan path lengkap `node.exe`, lalu jalankan `setup` lagi. |
| `discord id: NOT SET` | Jalankan `antigravity-rpc setup --client-id <Application ID>`. |
| Kartu masih tampilan lama setelah update | Daemon lama belum dimatikan: `antigravity-rpc stop`, lalu `start`. Cek baris `version` dan lokasi kodenya di `status`. |
| Kartu hilang setelah lama diam | Memang disengaja: kartu disembunyikan setelah `hideAfterSec` (default 30 menit) tanpa aktivitas. Naikkan nilainya di config kalau perlu. |
| Kartu Hotspot, Code churn, Lifetime tool call tidak muncul | `tool calls` di `status` masih 0, artinya agy belum mengirim data tool lewat hook `PostToolUse`. Pakai agy untuk tugas yang memakai tool (edit file, jalankan perintah) dulu. |
| Kartu Usage tidak muncul | Set `"showQuota": true` di `config.json`. Kartu Daily goal dan Monthly budget butuh `goals` / `budget` diisi. |
| `EPERM ... rename` di log | Windows sempat mengunci file saat dua proses menulis bersamaan. Aman: tulisan diulang otomatis, dan antivirus yang memindai folder `.antigravity-rpc` bisa memperparah. |
| Port dashboard bentrok | Ubah `dashboardPort` di `config.json`. |

**Lokasi file**
- Config dan statistik: `%USERPROFILE%\.antigravity-rpc\` (`config.json`, `aggregate.json`)
- Log dan state sementara: `%TEMP%\antigravity-rpc\` (`daemon.log`, `state.json`)
- Hooks agy: `%USERPROFILE%\.gemini\config\hooks.json`
- statusLine agy: `%USERPROFILE%\.gemini\antigravity-cli\settings.json`

**Masih bermasalah?** `antigravity-rpc debug on`, pakai agy sebentar, lalu `antigravity-rpc debug` untuk melihat *bentuk* payload agy (hanya nama field, tanpa isi). Matikan lagi dengan `antigravity-rpc debug off`. Lampirkan hasilnya beserta `status` dan `daemon.log` saat membuat issue.

Biaya adalah **simulasi** (harga API publik), bukan tagihan sungguhan.

## Uninstall

1. Lepas hooks dan kembalikan statusLine lamamu, lalu hentikan daemon:
```powershell
antigravity-rpc uninstall
antigravity-rpc stop
```
2. Hapus perintah global:
```powershell
npm unlink -g antigravity-rpc
```
3. Hapus data (opsional, ini menghapus statistik lifetime):
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.antigravity-rpc"
Remove-Item -Recurse -Force "$env:TEMP\antigravity-rpc"
```
4. Hapus folder proyek hasil clone.
5. **Restart agy** supaya hooks dan statusLine yang sudah dilepas tidak terbaca lagi. Aplikasi Discord yang kamu buat di Developer Portal bisa dihapus kalau tidak dipakai.

Cadangan file agy (`hooks.json.antigravity-rpc.bak`, `settings.json.antigravity-rpc.bak`) tidak dihapus otomatis. Kalau `uninstall` gagal, kembalikan file asli dari cadangan itu.

## Kredit dan lisensi

Tata letak kartu, daftar bahasa, dan deteksi push/commit diport dari [claude-rpc](https://github.com/rar-file/claude-rpc) (MIT, Archer Simmons). Lisensi proyek ini: [MIT](LICENSE).
