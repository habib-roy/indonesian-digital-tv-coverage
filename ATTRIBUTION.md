# Atribusi

Proyek ini berdiri di atas data, standar, dan perangkat lunak terbuka berikut. Terima kasih kepada semua pembuatnya.

Jika menambah layanan, data, atau dependensi baru, tambahkan di sini dan pastikan lisensinya mengizinkan pemakaian ini.

## Data yang dipakai saat analisis (diakses langsung oleh browser pengguna)

| Sumber                                                                                                                                                    | Dipakai untuk                                                            | Lisensi / ketentuan                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors                                                                                     | Lokasi menara TV, peta vektor (via OpenFreeMap & OpenTopoMap), geocoding | ODbL 1.0 — © OpenStreetMap contributors                                                                                              |
| [OpenFreeMap](https://openfreemap.org)                                                                                                                    | Tile & style peta vektor ("Peta", "Jalan"), font glyph                   | Gratis tanpa API key; data OSM (ODbL), style OpenMapTiles (BSD-3 / CC BY 4.0)                                                        |
| [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)                                                           | Peta dasar "Satelit"                                                     | Esri Terms of Use; atribusi wajib: Esri, Maxar, Earthstar Geographics                                                                |
| [OpenTopoMap](https://opentopomap.org/about)                                                                                                              | Peta dasar "Topografi"                                                   | CC BY-SA 3.0 — © OpenTopoMap, © OpenStreetMap contributors, SRTM                                                                     |
| [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) (OSMF)                                                                              | Pencarian alamat                                                         | Kebijakan pemakaian OSMF: maks 1 request/detik, tanpa autocomplete, hasil di-cache                                                   |
| [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen/Tilezen, format Terrarium)                                                      | Ketinggian tanah untuk profil jalur & peta 3D                            | Gabungan beberapa DEM, lihat [atribusi Tilezen](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)                    |
| ↳ SRTM (NASA/USGS), GMTED2010 (USGS), ETOPO1 (NOAA)                                                                                                       | Sumber DEM di wilayah Indonesia                                          | Domain publik (pemerintah AS)                                                                                                        |
| [ESA WorldCover 2021 v200](https://esa-worldcover.org) via [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/esa-worldcover) | Jenis lingkungan (clutter) di titik rumah                                | CC BY 4.0 — © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium |

## Data yang dibundel di `data/` (lihat [data/LICENSE](data/LICENSE))

| Sumber                                                                                                                    | Dipakai untuk                                            | Lisensi                                                                               |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Wikipedia bahasa Indonesia — Televisi digital di Indonesia](https://id.wikipedia.org/wiki/Televisi_digital_di_Indonesia) | Wilayah layanan & kanal                                  | CC BY-SA 4.0                                                                          |
| Komdigi (dahulu Kominfo) — Permenkominfo No. 6 Tahun 2019 tentang rencana induk frekuensi TV digital                      | Rujukan utama tabel wilayah layanan & kanal di Wikipedia | Dokumen peraturan pemerintah (tidak dilindungi hak cipta menurut UU 28/2014 Pasal 42) |
| OpenStreetMap                                                                                                             | Koordinat menara (`confidence.location: "osm"`)          | ODbL 1.0                                                                              |

## Model & standar

| Sumber                                                                       | Dipakai untuk                                                  | Lisensi                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| [NTIA Irregular Terrain Model (ITM) v1.4](https://github.com/NTIA/itm)       | Model propagasi Longley-Rice, di-port ke `src/lib/core/itm.ts` | Domain publik (karya pemerintah AS)         |
| ITU-R P.2108                                                                 | Rugi clutter terminal                                          | Rekomendasi ITU, dikutip sebagai rumus      |
| ITU-R P.526                                                                  | Difraksi knife-edge (analisis geometri)                        | Rekomendasi ITU, dikutip sebagai rumus      |
| ITU-R P.453                                                                  | Refraktivitas permukaan N₀                                     | Rekomendasi ITU, dikutip sebagai rumus      |
| ETSI TR 102 831                                                              | C/N DVB-T2 untuk ambang terima                                 | Dokumen ETSI, dikutip sebagai nilai         |
| FCC OET Bulletin 69                                                          | Parameter variabilitas F(50,90)                                | Dokumen pemerintah AS                       |
| G. Hoch (DL6WU), "More Gain with Yagi Antennas", _VHF Communications_ 4/1977 | Dimensi antena Yagi                                            | Metode desain, dikutip sebagai tabel faktor |

Rumus dan nilai dari standar di atas diimplementasikan ulang; teks standarnya tidak disertakan.

## Font

| Font                                                                                   | Lisensi                   |
| -------------------------------------------------------------------------------------- | ------------------------- |
| [Inter](https://rsms.me/inter/) (via `@fontsource-variable/inter`)                     | SIL Open Font License 1.1 |
| [Outfit](https://github.com/Outfitio/Outfit-Fonts) (via `@fontsource-variable/outfit`) | SIL Open Font License 1.1 |

## Library npm (dibundel ke aplikasi)

| Paket                                                     | Lisensi      |
| --------------------------------------------------------- | ------------ |
| [maplibre-gl](https://github.com/maplibre/maplibre-gl-js) | BSD-3-Clause |
| [geotiff](https://github.com/geotiffjs/geotiff.js)        | MIT          |
| [svelte](https://github.com/sveltejs/svelte)              | MIT          |

Perangkat pengembangan (Vite, TypeScript, ESLint, Prettier, svelte-check, dll.) tidak ikut dibundel; lisensinya bisa dilihat dengan `pnpm licenses list`.
