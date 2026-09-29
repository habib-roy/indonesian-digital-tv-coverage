# Panduan Kontribusi

Terima kasih! Proyek ini terbuka untuk siapa saja. Dengan berpartisipasi, Anda setuju mengikuti [Kode Etik](CODE_OF_CONDUCT.md).

## Tanpa menulis kode

- **Laporan lapangan**: sinyal di lokasi Anda diterima atau tidak → [Laporan lapangan](../../issues/new?template=laporan-lapangan.yml). Data paling berharga untuk mengkalibrasi model.
- **Data pemancar**: lokasi, tinggi menara, daya → [Data pemancar](../../issues/new?template=data-pemancar.yml).
- **Bug** → [Laporan bug](../../issues/new?template=bug.yml).
- **Menara di OpenStreetMap**: tambahkan `man_made=mast` (atau `tower`) + `communication:television=yes` + `name`. Ikut masuk saat data dibangun ulang.

Mencari tugas pertama? Lihat label [`good first issue`](../../labels/good%20first%20issue) — terutama data pemancar per provinsi.

## Setup

```sh
nvm use              # Node sesuai .nvmrc
corepack enable      # pnpm sesuai "packageManager" di package.json
pnpm install         # juga memasang git hooks dari .githooks/
pnpm dev             # http://localhost:5173
```

## Hook & zero warning

| Kapan        | Yang dijalankan                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| `pre-commit` | Prettier + ESLint (`--max-warnings 0`) pada file yang di-stage                    |
| `pre-push`   | `pnpm check`: format, lint, svelte-check `--fail-on-warnings`, tes, validasi data |
| CI (PR)      | `pnpm check` + `pnpm build`                                                       |

**Warning dihitung gagal.** Jangan menonaktifkan aturan lint tanpa komentar alasan di baris yang sama (`// eslint-disable-next-line rule -- alasan`). Jangan memakai `git commit --no-verify`; CI akan tetap menolak.

## Konvensi kode

- **TypeScript strict**, Svelte 5 runes (`$state`, `$derived`, `$effect`), gaya dari Prettier (lebar 140).
- **Pengaturan di [`src/config.ts`](src/config.ts).** URL layanan, batas, zoom, ukuran: jangan tulis angka ajaib di komponen.
- **Tanpa dependensi baru** untuk hal yang bisa ditulis beberapa baris. Dependensi baru wajib gratis, berlisensi kompatibel, dan dicatat di [ATTRIBUTION.md](ATTRIBUTION.md).
- **Mobile first & aksesibel**: target sentuh ≥ 44 px, label/ARIA, bisa dipakai keyboard, `id` unik pada elemen interaktif.
- **Komentar menjelaskan _kenapa_**, bukan _apa_. Penyederhanaan ditandai `ponytail:` berisi batasnya dan cara meningkatkannya.
- Teks UI berbahasa Indonesia; identifier & komentar kode berbahasa Inggris.
- Commit bergaya [Conventional Commits](https://www.conventionalcommits.org/id/): `feat:`, `fix:`, `data:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Aturan `src/lib/core/`

Folder ini berisi model & logika murni yang dipakai oleh UI, Web Worker, script, dan tes di Node.

- **Murni**: tanpa DOM, tanpa `window`/`document`, tanpa state global, tanpa import dari komponen atau `state.svelte.ts`. I/O (fetch) hanya lewat fungsi yang bisa diinjeksi (contoh: `TileLoader` di `terrain.ts`).
- **Tanpa `enum`, `namespace`, parameter properties** — hanya sintaks yang bisa dihapus (`erasableSyntaxOnly`), agar Node bisa menjalankan `.ts` langsung. Pakai union string (`"los" | "diffraction"`) dan objek `as const`.
- **Setiap angka model punya sumber** (ITU-R, ETSI, FCC, NTIA, makalah) di komentar dan di [docs/metode.md](docs/metode.md).
- **Logika baru wajib ada tes** di `test/` (`node:test`, tanpa framework).
- **`itm.ts` adalah port NTIA baris demi baris.** Perubahan wajib lolos `test/itm.test.ts`, yang membandingkan dengan C++ asli (`test/fixtures/itm-reference-gen.cpp`).

## Menambah / memperbaiki pemancar

Data ada di [`data/transmitters.json`](data/transmitters.json) (skema: `Transmitter` di [`src/lib/core/data.ts`](src/lib/core/data.ts)), lisensi [CC BY-SA 4.0](data/LICENSE).

```jsonc
{
  "id": "osm-node-460449426", // unik; osm-node-/osm-way-{id} jika dari OSM
  "name": "TVRI Riau",
  "area": "riau-1-pekanbaru", // harus ada di data/service-areas.json
  "lat": 0.57523,
  "lon": 101.47176,
  "height_m": 100, // tinggi antena di atas tanah
  "erp_kw": 5,
  "freq_mhz": 666, // kanal tertinggi wilayah (kasus terburuk)
  "confidence": { "location": "osm", "height": "estimated", "erp": "estimated" },
  "source": ["https://www.openstreetmap.org/node/460449426"],
}
```

- **`source` wajib**: minimal satu URL `https://` yang bisa diperiksa orang lain (OSM, dokumen Komdigi, situs stasiun, foto di Wikimedia Commons). Data tanpa sumber tidak diterima.
- **`confidence` jujur**: `measured` (diukur/dokumen resmi), `osm`, `area-center` (pusat kota wilayah), `estimated` (perkiraan). Jangan menaikkan tanpa bukti.
- Jangan menyalin data dari sumber yang lisensinya tidak mengizinkan (misal situs komersial tanpa izin).
- Jalankan `pnpm validate-data`.
- Lebih baik lagi: perbaiki di OpenStreetMap, lalu `node scripts/build-data.ts` untuk membangun ulang.

## Branch

| Branch | Fungsi                                             | Deploy                               |
| ------ | -------------------------------------------------- | ------------------------------------ |
| `dev`  | **Target semua PR.** Integrasi & preview           | GitHub Pages (otomatis)              |
| `main` | Rilis stabil, hanya di-merge maintainer dari `dev` | Server produksi (self-hosted runner) |

## Hacktoberfest

Proyek ini ikut [Hacktoberfest](https://hacktoberfest.com). PR dihitung jika di-merge, diberi label `hacktoberfest-accepted`, atau di-approve.

- Buka PR ke **`dev`**. Issue `good first issue` dan data pemancar per provinsi cocok untuk mulai.
- Satu PR = satu perubahan bermakna. PR spam/trivial (ubah spasi, typo massal tanpa konteks, data tanpa `source`) ditutup dengan label `spam` atau `invalid` dan tidak dihitung.
- CI wajib hijau. Workflow di PR dari fork berjalan di runner GitHub, tanpa akses secret.

## Alur PR

1. Fork → branch dari `dev` (`feat/heatmap-legend`, `data/jawa-tengah`).
2. Ubah kode; `pnpm check` bersih.
3. Buka PR dan isi template (ringkasan, jenis, checklist, screenshot mobile untuk perubahan UI).
4. Review oleh [CODEOWNERS](.github/CODEOWNERS). Perubahan model (`itm.ts`, `propagation.ts`) dan `data/` direview lebih ketat.
5. Squash merge ke `dev`. Maintainer menggabungkan `dev` → `main` untuk rilis.

## Lisensi kontribusi

Dengan mengirim kontribusi, Anda setuju kode dirilis di bawah [MIT](LICENSE) dan data di bawah [CC BY-SA 4.0](data/LICENSE) (koordinat dari OSM tetap ODbL).
