# Issue awal

Daftar issue untuk dibuka setelah repo publik. Label yang dipakai: `good first issue`, `data`, `enhancement`, `help wanted`, `model`, `hacktoberfest`.

## Cara membuka

**Sekali saja, siapkan label:** buka **Issues → Labels → New label**, lalu buat label yang belum ada. `good first issue`, `help wanted`, dan `enhancement` sudah ada bawaan GitHub.

**Lewat web (issue 2–4, masing-masing satu kali):**

1. **Issues → New issue → Open a blank issue.**
2. Judul = teks judul bagian (misal "Terjemahan bahasa Inggris").
3. Isi = teks di dalam blok kutipan (`>`), tanpa tanda `>` di awal baris.
4. Di panel kanan, pilih label yang tertulis di judul bagian.
5. **Create.**

**Lewat terminal (38 issue provinsi):** menulis manual 38 kali rawan salah. Pasang [GitHub CLI](https://cli.github.com), jalankan `gh auth login`, lalu dari root repo:

```sh
body='Banyak pemancar di PROV masih memakai lokasi **perkiraan** (titik oranye di peta), dan tinggi/daya pancarnya juga perkiraan.

**Tugas**

- [ ] Cari lokasi menara pemancar TV digital tiap wilayah layanan di PROV (lihat `data/service-areas.json`).
- [ ] Tambahkan/perbaiki menara di OpenStreetMap: `man_made=mast` (atau `tower`) + `communication:television=yes` + `name`.
- [ ] Atau langsung edit `data/transmitters.json`: `lat`, `lon`, `height_m`, `erp_kw`, `confidence`, dan **`source` wajib**.
- [ ] `pnpm validate-data` lulus.

Panduan: https://github.com/habib-roy/indonesian-digital-tv-coverage/blob/dev/CONTRIBUTING.md#menambah--memperbaiki-pemancar
PR ke branch `dev`.'

sed -n 's/^Provinsi: //p' docs/initial-issues.md | sed 's/ · /\n/g' | while read -r p; do
  gh issue create --title "Data pemancar: $p" --label "good first issue,data,hacktoberfest" --body "${body//PROV/$p}"
  sleep 2 # hindari rate limit pembuatan konten GitHub
done
```

Coba dulu dengan satu provinsi (tambahkan `| head -1` sebelum `| while`), cek hasilnya di GitHub, baru jalankan semua.

**Setelah dibuka:** sematkan (Pin) satu issue ringkasan atau issue terjemahan agar terlihat di atas daftar issue.

---

## 1. Data pemancar per provinsi (38 issue) — `good first issue`, `data`

Satu issue per provinsi. Judul: **Data pemancar: {Provinsi}**

> Banyak pemancar di {Provinsi} masih memakai lokasi **perkiraan** (titik oranye di peta), dan tinggi/daya pancarnya juga perkiraan.
>
> **Tugas**
>
> - [ ] Cari lokasi menara pemancar TV digital tiap wilayah layanan di {Provinsi} (lihat `data/service-areas.json`, field `id` diawali nama provinsi).
> - [ ] Tambahkan/perbaiki menara di OpenStreetMap: `man_made=mast` (atau `tower`) + `communication:television=yes` + `name`.
> - [ ] Atau langsung edit `data/transmitters.json`: `lat`, `lon`, `height_m`, `erp_kw`, `confidence`, dan **`source` wajib** (tautan OSM, dokumen Komdigi, foto, dsb.).
> - [ ] `pnpm validate-data` lulus.
>
> Panduan: [CONTRIBUTING.md → Menambah / memperbaiki pemancar](https://github.com/habib-roy/indonesian-digital-tv-coverage/blob/dev/CONTRIBUTING.md#menambah--memperbaiki-pemancar)

Provinsi: Aceh · Sumatera Utara · Sumatera Barat · Riau · Kepulauan Riau · Jambi · Sumatera Selatan · Kepulauan Bangka Belitung · Bengkulu · Lampung · DKI Jakarta · Banten · Jawa Barat · Jawa Tengah · DI Yogyakarta · Jawa Timur · Bali · Nusa Tenggara Barat · Nusa Tenggara Timur · Kalimantan Barat · Kalimantan Tengah · Kalimantan Selatan · Kalimantan Timur · Kalimantan Utara · Sulawesi Utara · Gorontalo · Sulawesi Tengah · Sulawesi Barat · Sulawesi Selatan · Sulawesi Tenggara · Maluku · Maluku Utara · Papua · Papua Barat · Papua Barat Daya · Papua Tengah · Papua Pegunungan · Papua Selatan

---

## 2. Terjemahan bahasa Inggris — `enhancement`, `help wanted`

> Tambahkan antarmuka bahasa Inggris untuk pengguna/peneliti non-Indonesia.
>
> - [ ] Pindahkan semua teks UI ke `src/lib/i18n/id.ts` (satu objek, tanpa library).
> - [ ] Tambahkan `en.ts` dengan kunci yang sama; tes memastikan kunci identik.
> - [ ] Pilih bahasa dari `navigator.language`, bisa diganti manual, disimpan di `localStorage`.
> - [ ] Terjemahkan `docs/metode.md` → `docs/method.md`.
>
> Jangan menambah dependensi i18n; satu fungsi `t(key)` cukup.

---

## 3. Mode offline (service worker) — `enhancement`

> Pengguna di daerah sinyal lemah sering juga lemah internetnya.
>
> - [ ] Service worker yang men-cache app shell (HTML/JS/CSS/font/data) — aplikasi bisa dibuka tanpa internet.
> - [ ] Cache tile terrain & peta yang sudah pernah dilihat (stale-while-revalidate, batas ukuran).
> - [ ] Pesan jelas saat offline dan tile yang dibutuhkan belum ada di cache.
> - [ ] Manifest PWA agar bisa di-"Tambahkan ke layar utama".
>
> Pertimbangkan batas pemakaian tile tiap penyedia (lihat `ATTRIBUTION.md`); jangan prefetch massal.

---

## 4. Kalibrasi model dari laporan lapangan — `model`, `help wanted`

> Model saat ini murni teori (ITM + P.2108, lihat `docs/metode.md`). Laporan lapangan (template "Laporan lapangan") memberi data nyata untuk mengukur akurasinya.
>
> - [ ] Script `scripts/calibrate.ts`: baca laporan (ekspor issue berlabel `field-report` → CSV), jalankan model untuk tiap titik, hitung confusion matrix (diterima / sebagian / tidak) dan bias margin rata-rata.
> - [ ] Laporkan hasil di `docs/kalibrasi.md` beserta jumlah sampel.
> - [ ] Hanya jika sampel cukup (misal ≥ 50 per jenis lingkungan): usulkan koreksi (offset clutter, ambang) dengan alasan statistik. Jangan overfit ke sedikit titik.
>
> Koordinat laporan dibulatkan 3 desimal; jangan menyimpan data pribadi.
