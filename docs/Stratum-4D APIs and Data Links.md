# 🛰️ Stratum-4D: Implemented APIs & External Data Endpoints

This document lists every API, web service, and external dataset actively used across the **Stratum-4D** frontend and Python data pipeline, including exact endpoints, parameters, and source code locations.

---

## 1. NASA APIs & Datasets

### 1.1 NASA POWER (Prediction Of Worldwide Energy Resources) REST API
* **Official Portal / Docs:** [https://power.larc.nasa.gov/](https://power.larc.nasa.gov/)
* **API Endpoint Used:** `https://power.larc.nasa.gov/api/temporal/monthly/point`
* **Underlying Models:** NASA MERRA-2 & GEOS-5.12.4 reanalysis ($0.5^\circ \times 0.625^\circ$ global grid).
* **Parameters Queried:**
  * `T2M` — 2-Meter Air Temperature ($^\circ\text{C}$)
  * `PRECTOTCORR` — Bias-Corrected Total Precipitation ($\text{mm/day}$)
  * `GWETROOT` — Root-Zone Soil Wetness fraction ($0\text{--}1$)
  * `ALLSKY_SFC_SW_DWN` — All-Sky Surface Shortwave Downward Irradiance ($\text{W/m}^2$)
  * `RH2M` — 2-Meter Relative Humidity ($\%$, used in pipeline to derive Vapor Pressure Deficit via Tetens equation)
* **Where Used in Code:**
  * `src/lib/nasaPower.ts` — Live 41-year (1984–2024) Virtual Station Point Probe for any clicked coordinate on Earth.
  * `src/lib/liveDataHydrator.ts` — On-the-spot 2002–2024 basin telemetry hydrator with `localStorage` caching.
  * `pipeline/process_basins.py` — Offline basin meteorology cache builder (`pipeline/.cache/power_*.json`).

---

### 1.2 NASA GIBS (Global Imagery Browse Services) OGC WMS API
* **Official Portal / Docs:** [https://nasa-gibs.github.io/gibs-api-docs/](https://nasa-gibs.github.io/gibs-api-docs/)
* **API Endpoint Used:** `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`
* **Satellite Layers Queried:**
  * **MODIS Terra:** `MODIS_Terra_NDVI_8Day` (8-Day Normalized Difference Vegetation Index)
  * **Aqua AIRS:** `AIRS_L2_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Day` ($500\text{ hPa}$ mid-tropospheric Carbon Monoxide)
  * **GPM IMERG:** `GPM_3IMERGDF_06_precipitation` (Daily precipitation rate)
  * **Aura OMI:** `OMI_Nitrogen_Dioxide_Tropo_Column` (Tropospheric $\text{NO}_2$ column density)
  * **NOAA-20 VIIRS:** `VIIRS_NOAA20_Land_Surface_Temp_Day` (Daytime Land Surface Temperature)
  * **GRACE / GRACE-FO:** Liquid Water Equivalent thickness anomaly rasters
* **Where Used in Code:**
  * `src/lib/gibs.ts` — WMS 1.1.1 `GetMap` URL builder, cadence date snapper, and dual-epoch URL generator.
  * `src/components/Globe.tsx` — 3D WebGL globe texture overlays and real-time GLSL Dual-Epoch $\Delta$-Anomaly shader.
  * `src/components/AnalyticalMap2D.tsx` — 2D equirectangular canvas overlay.

---

### 1.3 NASA EONET v3 (Earth Observatory Natural Event Tracker) API
* **Official Portal / Docs:** [https://eonet.gsfc.nasa.gov/docs/v3](https://eonet.gsfc.nasa.gov/docs/v3)
* **API Endpoint Used:** `https://eonet.gsfc.nasa.gov/api/v3/events`
* **Categories Queried:** Open global natural hazard events (`wildfires`, `drought`, `severeStorms`, `floods`, `volcanoes`, `dustHaze`).
* **Where Used in Code:**
  * `src/lib/eonet.ts` — Fetches active hazard events and spatially cross-references them against catchment polygons (`enrichEventWithBasinContext`) to flag events inside significantly drying basins ($q < 0.05, \beta_{\text{Sen}} < 0$).
  * `src/components/AutonomousTriageSentinel.tsx` — Populates the event-overlap alert tab.
  * `src/components/Globe.tsx` & `src/components/AnalyticalMap2D.tsx` — Renders interactive hazard pins on the 3D globe and 2D map.

---

### 1.4 NASA / DLR GRACE & GRACE-FO JPL Mascon Solution (PO.DAAC / Earthdata)
* **Official Portal / Docs:** [https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/](https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/)
* **Dataset Used:** JPL Tellus GRACE & GRACE-FO RL06.1M CRI-filtered Mascon Solution (`lwe_thickness` in $\text{cm}$ Equivalent Water Thickness, April 2002 – February 2024).
* **Where Used in Code:**
  * `pipeline/process_basins.py` — Performs $\cos(\text{lat})$ area-weighted polygon extraction across 30 global hydrological basins into `public/data/basins.geojson`.
  * `pipeline/recompute_stats.py` — Recomputes Yue-Pilon pre-whitening, Hamed-Rao Mann-Kendall $Z$ and $n^*$, Benjamini-Hochberg FDR $q$-values, and Pettitt structural break years from the shipped 132 bimonthly epochs.

---

### 1.5 NASA Visible Earth (Blue Marble & Black Marble Base Textures)
* **Official Portal:** [https://visibleearth.nasa.gov/](https://visibleearth.nasa.gov/)
* **Assets Used:** NASA Blue Marble Next Generation (Daytime albedo) and Suomi NPP VIIRS Black Marble (Nighttime city lights) equirectangular textures stored in `public/textures/`.
* **Where Used in Code:**
  * `src/components/Globe.tsx` & `src/components/globeShaders.ts` — Blended across the solar twilight terminator via custom GLSL shaders.

---

## 2. Partner & Climate Science Data Feeds

### 2.1 NOAA Physical Sciences Laboratory (PSL) Climate Oscillation Indices
* **Official Portal / Docs:** [https://psl.noaa.gov/data/climateindices/](https://psl.noaa.gov/data/climateindices/) and [https://psl.noaa.gov/enso/mei/](https://psl.noaa.gov/enso/mei/)
* **Data Endpoints Used:**
  * **Multivariate ENSO Index (MEI.v2):** `https://psl.noaa.gov/enso/mei/data/meiv2.data`
  * **Indian Ocean Dipole (DMI):** `https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data`
  * **North Atlantic Oscillation (NAO):** `https://psl.noaa.gov/data/correlation/nao.data`
* **Where Used in Code:**
  * `pipeline/process_basins.py` & `pipeline/recompute_stats.py` — Downloads, parses, and synchronizes the monthly ASCII tables into `public/data/climate_indices.json` and computes lagged driver correlations ($\tau = 0\text{--}12\text{ months}$).
  * `src/components/DualCompareInspector.tsx`, `src/components/MultiSensorStack.tsx`, & `src/components/GISAnalysisPanel.tsx` — Renders El Niño/La Niña reference bands, computes first-order partial correlations $r_{AB \cdot Z}$, and strips cyclical oscillation components.

---

### 2.2 NCEP GFS / NASA MERRA-2 10m Surface Wind Field
* **Official Portal:** [https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/](https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/)
* **Asset Used:** Gridded $u/v$ 10-meter surface wind velocity field (`public/data/wind.json`).
* **Where Used in Code:**
  * `src/lib/wind.ts` — Bilinear vector interpolation, zonal mean anomaly ($\Delta U = U - [U]_\phi$), and Lagrangian particle advection.
  * `src/components/Globe.tsx`, `src/components/AnalyticalMap2D.tsx`, & `src/components/VirtualStationProbe.tsx` — Renders animated wind streamlines and the Beaufort wind compass.

---

## 3. Auxiliary Geocoding & AI Synthesis APIs

### 3.1 OpenStreetMap Nominatim Geocoding API
* **Official Docs:** [https://nominatim.org/release-docs/latest/api/Search/](https://nominatim.org/release-docs/latest/api/Search/)
* **API Endpoint Used:** `https://nominatim.openstreetmap.org/search?format=json&q={query}&limit=5`
* **Where Used in Code:**
  * `src/lib/geocoding.ts` & `src/components/OmniboxSearch.tsx` — Provides live global city and region geocoding when a search query in the `Cmd+K` command palette is not already matched by the offline catalog of 30 basins, 7 case files, and 40+ landmarks.

---

### 3.2 OpenRouter Chat Completions API (Optional AI Layer)
* **Official Docs:** [https://openrouter.ai/docs](https://openrouter.ai/docs)
* **API Endpoint Used:** `https://openrouter.ai/api/v1/chat/completions`
* **Models Configured (`FREE_MODELS` fallback chain):**
  * `google/gemma-3-27b-it:free`
  * `meta-llama/llama-3.3-70b-instruct:free`
  * `qwen/qwen-2.5-72b-instruct:free`
  * `mistralai/mistral-small-3.1-24b-instruct:free`
* **Where Used in Code:**
  * `src/lib/openrouter.ts`, `src/components/TrendDetectiveAIModal.tsx`, & `src/components/AutonomousTriageSentinel.tsx` — Optional LLM hypothesis synthesis when `VITE_OPENROUTER_TOKEN` is configured; automatically falls back after 5,000 ms (or when no key is set) to the built-in deterministic statistical template generator.

---

## 📋 Quick Copy-Paste List for NASA Space Apps Submission Form

If the NASA Space Apps submission portal asks for a concise list of **NASA Data & Resources Used**, you can paste this block directly:

* **NASA / DLR GRACE & GRACE-FO JPL Mascon Solutions (RL06.1M CRI):** `https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/`
* **NASA POWER API (MERRA-2 & GEOS-5 Meteorology/Agroclimatology):** `https://power.larc.nasa.gov/api/temporal/monthly/point`
* **NASA GIBS WMS API (MODIS NDVI, AIRS 500hPa CO, GPM IMERG, OMI NO2, VIIRS LST, GRACE LWE):** `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`
* **NASA EONET v3 API (Earth Observatory Natural Event Tracker):** `https://eonet.gsfc.nasa.gov/api/v3/events`
* **NASA Visible Earth (Blue Marble & Black Marble Global Imagery):** `https://visibleearth.nasa.gov/`
* **NOAA PSL Climate Indices (ENSO MEI.v2, IOD DMI, NAO):** `https://psl.noaa.gov/data/climateindices/`