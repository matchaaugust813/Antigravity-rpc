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

Discord Rich Presence untuk **Antigravity CLI (`agy`)**. Profil Discord kamu menampilkan model, project, token, jam kerja, streak, dan statistik lainnya yang berganti-ganti otomatis.

## Pasang

Butuh: Windows, [Node.js](https://nodejs.org) 18+, Antigravity CLI (`agy`), dan Discord **desktop** yang sedang terbuka.

```powershell
git clone https://github.com/<username-kamu>/antigravity-rpc
cd antigravity-rpc
npm link
antigravity-rpc setup
antigravity-rpc start
```

Lalu **restart agy** dan kirim satu prompt. Selesai, kartunya muncul di profil Discord kamu.

Mau lihat dulu tanpa memakai agy? Jalankan `antigravity-rpc demo`.

## Kartu yang tampil

Saat agy bekerja: tool dan file yang dipakai, token sesi, dan notifikasi saat kamu baru saja push atau commit.
Saat agy menunggu atau idle, kartu berputar tiap 15 detik:

This week · streak · file paling sering diedit · pembagian model · total jam · total token · cache · baris kode · biaya (simulasi) · kuota · target harian · budget bulanan

Kartu yang datanya belum ada dilewati otomatis.

## Perintah

| Perintah | Fungsi |
|---|---|
| `antigravity-rpc status` | cek kondisi dan kartu yang sedang dikirim |
| `antigravity-rpc stats` | statistik lifetime |
| `antigravity-rpc start` / `stop` | jalankan / hentikan di background |
| `antigravity-rpc pause` / `resume` | sembunyikan / tampilkan kartu |
| `antigravity-rpc dashboard` | dashboard di http://localhost:4790 |

## Pengaturan (opsional)

Edit `%USERPROFILE%\.antigravity-rpc\config.json`:

```json
{
  "showQuota": true,
  "goals": { "dailyHours": 4 },
  "budget": { "monthly": 20 },
  "showProject": true,
  "showCost": true
}
```

- `showQuota`: tampilkan kartu kuota agy.
- `goals` dan `budget`: isi angka untuk menampilkan kartu target harian dan budget bulanan.
- `showProject: false`: sembunyikan nama project.
- `showCost: false`: sembunyikan kartu biaya. Biaya hanya **simulasi** dari harga API publik, bukan tagihan sungguhan.
- `presence`: ubah teks kartu sendiri (lihat `src/config.js`).

## Kalau tidak jalan

Mulai dari `antigravity-rpc status`.

- **Kartu tidak muncul:** pakai Discord desktop (bukan browser), aktifkan *Settings → Activity Privacy → Share your detected activity*, dan pastikan `daemon: running`.
- **`session: none`:** restart agy, ketik `/hooks` di dalam agy, lalu kirim satu prompt.
- **Token 0:** ketik `/statusline on` di dalam agy.
- **Setelah update kartu masih lama:** `antigravity-rpc stop`, lalu `antigravity-rpc start`.
- **Kartu hilang setelah lama diam:** disengaja, kartu disembunyikan setelah 30 menit tanpa aktivitas.
- **Masih gagal:** lihat log di `%TEMP%\antigravity-rpc\daemon.log`.

## Update

```powershell
cd antigravity-rpc
git pull
antigravity-rpc stop
antigravity-rpc start
```

## Uninstall

```powershell
antigravity-rpc uninstall
npm unlink -g antigravity-rpc
Remove-Item -Recurse -Force "$env:USERPROFILE\.antigravity-rpc"
```

Lalu hapus folder hasil clone dan restart agy. `uninstall` melepas hooks dan mengembalikan status bar agy seperti semula, lalu menghentikan daemon. Baris `Remove-Item` menghapus statistik kamu dan bersifat opsional.

## Kredit dan lisensi

Tata letak kartu, daftar bahasa, dan deteksi push/commit diport dari [claude-rpc](https://github.com/rar-file/claude-rpc) (MIT, Archer Simmons). Lisensi: [MIT](LICENSE).
