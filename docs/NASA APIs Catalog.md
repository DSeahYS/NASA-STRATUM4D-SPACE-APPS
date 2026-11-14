# 🛰️ Complete NASA API & Web Services Catalog
**For the 2026 NASA Space Apps Challenge: "Be An Earth System Trend Detective!"**

Because the challenge specifically highlights **MODIS, OMI, AIRS, GPM, MERRA-2, GLDAS**, and **CUAHSI**, this catalog prioritizes Earth Science (EOSDIS / DAAC) time-series engines first, followed by cloud-native subsetting, map visualization, event discovery, and general `api.nasa.gov` endpoints.

---

## Tier 1: Direct Time-Series & Point/Regional Extraction APIs
*These APIs return analysis-ready time-series arrays (`JSON`, `CSV`, `ASCII`) for a coordinate or bounding box without requiring you to download and parse massive raw satellite granules.*

### 1. NASA POWER API (Prediction Of Worldwide Energy Resources)
* **Base URL:** `https://power.larc.nasa.gov/api/temporal/{resolution}/{location_type}`
  * **Resolutions:** `hourly`, `daily`, `monthly`, `climatology`
  * **Location Types:** `point`, `regional`
* **Missions/Models Covered:** **MERRA-2**, GEOS-5, CERES, **GPM** (integrated precipitation).
* **Key Variables:** $200+$ variables including `T2M` ($2\text{ m}$ Temperature), `PRECTOTCORR` (Corrected Precipitation), `ALLSKY_SFC_SW_DWN` (Solar Irradiance), `RH2M` (Relative Humidity), `WS10M` (Wind Speed), `GWETROOT` (Root Zone Soil Wetness), `EVPTRNS` (Evapotranspiration).
* **Auth:** **None** ($100\%$ open, no API key or Earthdata Login required).
* **Output Formats:** `JSON`, `CSV`, `ASCII`, `GeoJSON`, `NetCDF`.
* **Why pick it:** The fastest, most reliable NASA API for live frontend/backend time-series queries ($1981\text{--present}$). Ideal for instant linear regression, Mann-Kendall, and $t$-test calculations on the fly.

### 2. NASA GES DISC "Data Rods" API (Hydrology Time-Series Service)
* **Base URL:** `https://hydro1.gesdisc.eosdis.nasa.gov/daac-bin/access/timeseries.cgi`
* **Missions/Models Covered:** **GLDAS** (v2.0, v2.1), **MERRA-2** (Land), **GPM** (IMERG), NLDAS, FLDAS, GRACE-DA, LPRM (Soil Moisture).
* **Key Variables:** Soil moisture, surface runoff, subsurface runoff (streamflow proxy), evapotranspiration, snow water equivalent, rainfall rate, skin temperature.
* **Auth:** NASA Earthdata Login (Bearer Token / `.netrc`), though public CUAHSI WaterOneFlow proxy endpoints also exist.
* **Output Formats:** `ASCII` (tabular time series), `WaterML` (CUAHSI standard), `NetCDF`.
* **Why pick it:** Purpose-built by NASA GES DISC to solve the exact problem described in the prompt: turning decades of 2D gridded hydrology granules into 1D "Data Rods" (deep time-series arrays at a single `[lat, lon]`).

### 3. ORNL DAAC MODIS / VIIRS Fixed-Site & Global Subset REST API (TESViS)
* **Base URL:** `https://modis.ornl.gov/rst/api/v1/`
* **Key Endpoints:** `/{product}/dates`, `/{product}/subset`, `/{product}/subsetOrder`, `/products`
* **Missions/Models Covered:** **MODIS** (Terra & Aqua), VIIRS, Daymet.
* **Key Variables:** `MOD13Q1` (NDVI / EVI Vegetation Indices), `MOD11A2` (Land Surface Temperature & Emissivity), `MOD16A2` (Evapotranspiration), `MCD15A3H` (Leaf Area Index / FPAR), `MOD17A2H` (Gross Primary Productivity).
* **Auth:** **None** (Open REST API; accepts `Accept: application/json` or `text/csv`).
* **Output Formats:** `JSON`, `CSV`.
* **Why pick it:** Gives you direct pixel and neighborhood (`kmAboveBelow`, `kmLeftRight`) time-series subsets for **MODIS** without touching HDF4 files or Earthdata authentication. *(Note: Synchronous `/subset` requests cap at $10$ timesteps per call, so batch async requests or pre-cache demo regions).*

### 4. NASA VEDA (Visualization, Exploration, and Data Analysis) STAC & Raster API
* **Base URLs:**
  * STAC Catalog: `https://openveda.cloud/api/stac`
  * Raster / Time-Series Statistics: `https://openveda.cloud/api/raster` (Specifically `/cog/statistics`)
* **Missions/Models Covered:** **OMI** & TROPOMI ($\text{NO}_2$, $\text{SO}_2$), **MODIS**, **GPM** (IMERG), **GLDAS / NLDAS**, GRACE, EIS (Earth Information System) datasets.
* **Key Variables:** Tropospheric Nitrogen Dioxide ($\text{NO}_2$), Sulfur Dioxide ($\text{SO}_2$), Ocean Net Primary Productivity, Biomass, Nighttime Lights, Soil Moisture, Precipitation anomalies.
* **Auth:** **None** for public read/statistics endpoints.
* **Output Formats:** `JSON`, `GeoJSON`, XYZ Map Tiles.
* **Why pick it:** NASA's newest cloud-native platform. You can POST a GeoJSON polygon (e.g., a city boundary or river basin) to `/cog/statistics` across a STAC collection's assets and get back summary statistics (`mean`, `min`, `max`, `std`) per timestep.

### 5. NASA LP DAAC AppEEARS API (Application for Extracting and Exploring Analysis Ready Samples)
* **Base URL:** `https://appeears.earthdatacloud.nasa.gov/api/`
* **Missions/Models Covered:** **MODIS**, VIIRS, Harmonized Landsat Sentinel-2 (HLS), SMAP, ECOSTRESS, ASTER, NASADEM.
* **Auth:** NASA Earthdata Login (POST to `/login` to receive a Bearer token).
* **Output Formats:** `JSON`, `CSV` (for point time series), `GeoTIFF`, `NetCDF4` (for area requests).
* **Why pick it:** Supports **Point** and **Polygon** extraction across dozens of land/biosphere variables. *(Note: Uses an asynchronous job queue `/task` $\rightarrow$ `/status` $\rightarrow$ `/bundle`, making it best for pre-fetching rich regional datasets or asynchronous user queries).*

### 6. NASA Giovanni Web Service / URL API (GES DISC)
* **Base URL:** `https://giovanni.gsfc.nasa.gov/giovanni/daac-bin/service_manager.pl`
* **Missions/Models Covered:** **MODIS**, **OMI**, **AIRS**, **GPM**, **MERRA-2**, **GLDAS**, TRMM, SeaWiFS, MOPITT, MLS.
* **Key Variables:** Virtually **every single mission and variable mentioned in the challenge background** (Ozone, Aerosol Optical Depth, Methane $\text{CH}_4$, Carbon Monoxide $\text{CO}$, Atmospheric Temperature at pressure levels, Surface Temperature, Rainfall, Soil Moisture).
* **Auth:** NASA Earthdata Login (Bearer Token / Session Cookie).
* **Output Formats:** `CSV`, `NetCDF`, `GeoTIFF`, `PNG`.
* **Why pick it:** Covers **OMI** and **AIRS** alongside **MERRA-2**, **GLDAS**, **GPM**, and **MODIS**. Can compute area-averaged time series, seasonal anomalies, and cross-variable correlation maps server-side.

---

## Tier 2: Cloud-Native Subsetting & Array Slicing APIs
*For programmatic slicing of raw multidimensional Earthdata collections.*

### 7. NASA Earthdata Harmony API
* **Base URL:** `https://harmony.earthdata.nasa.gov/{collection-id}/ogc-api-coverages/1.0.0/...` (Also supports OGC EDR `/position`, `/area`, `/cube`).
* **Missions/Models Covered:** Cross-DAAC cloud holdings including TEMPO, ICESat-2, GHRSST (PO.DAAC Sea Surface Temperature), Sentinel-1/Sentinel-6, MODIS/VIIRS cloud collections.
* **Auth:** NASA Earthdata Login (Bearer Token).
* **Output Formats:** `NetCDF4`, `GeoTIFF`, `Zarr`, `JSON` (STAC catalog links).
* **Why pick it:** Standardized OGC API for subsetting cloud-hosted datasets by `lat(...)`, `lon(...)`, and `datetime`.

### 8. NASA OPeNDAP (Hyrax) & GrADS Data Server (GDS) APIs
* **Base URLs:**
  * GES DISC (AIRS, OMI, GPM, MERRA-2, GLDAS): `https://goldsmr4.gesdisc.eosdis.nasa.gov/opendap/` & `https://acdisc.gesdisc.eosdis.nasa.gov/opendap/`
  * LP DAAC (MODIS): `https://opendap.cr.usgs.gov/opendap/hyrax/`
  * PO.DAAC (Oceans/SST): `https://opendap.earthdata.nasa.gov/`
* **Auth:** NASA Earthdata Login.
* **Output Formats:** `.ascii` (plain text arrays), `.nc4` (NetCDF4), `.dap` (binary stream).
* **Why pick it:** Allows you to append array index slices directly to a URL (e.g., `dataset.nc4.ascii?Temperature[0:1:360][90][180]`) and stream only the exact variable and grid cell you want over HTTP without downloading gigabytes of data.

### 9. NASA Earthdata Cloud Direct S3 / Zarr Datastores
* **Base URLs:**
  * NASA POWER Zarr Store (Open): `s3://nasa-power/` (`https://power-datastore.s3.amazonaws.com/`)
  * Earthdata Cloud S3 (Temporary credentials via `https://data.gesdisc.earthdata.nasa.gov/s3credentials` or `earthaccess` Python library).
* **Auth:** None for `s3://nasa-power/`; Earthdata Login for DAAC S3 buckets.
* **Why pick it:** Using Python (`xarray` + `s3fs`/`zarr`) or JS Zarr readers, you can slice multi-decade time cubes in milliseconds directly from cloud object storage.

---

## Tier 3: Map Tile, 3D Globe & Visual Layer APIs
*Essential for rendering the spatial context of "where it is changing" alongside your time-series charts.*

### 10. NASA GIBS API (Global Imagery Browse Services)
* **Base URL:** `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{Layer_Name}/default/{Time}/{TileMatrixSet}/{z}/{y}/{x}.{format}` (Also supports `epsg3857` Web Mercator, WMS, and TWMS).
* **Missions/Models Covered:** **MODIS**, **OMI**, **AIRS**, **GPM**, **MERRA-2**, **GLDAS**, VIIRS, SMAP, AMSR2, OCO-2, GRACE.
* **Key Variables:** Over $1,000$ pre-rendered daily and monthly visual layers (e.g., `MODIS_Terra_NDVI_8Day`, `OMI_Nitrogen_Dioxide_Tropo_Column`, `AIRS_L3_Surface_Air_Temperature_Daily_Day`, `GPM_3IMERGDF_06_precipitation`, `MERRA2_2m_Air_Temperature_Monthly`).
* **Auth:** **None**.
* **Output Formats:** `PNG`, `JPEG`, `Mapbox Vector Tiles (MVT)`.
* **Why pick it:** Zero-auth, sub-second global tile server. Plugs straight into Three.js / WebGL globes, Deck.gl, Cesium, MapLibre, or Leaflet so users can scrub through time and visually see regional anomalies while inspecting the time series.

### 11. NASA Worldview Snapshots API
* **Base URL:** `https://wvs.earthdata.nasa.gov/api/v1/snapshot`
* **Auth:** **None**.
* **Output Formats:** `PNG`, `JPEG`, `GeoTIFF`, `KMZ`.
* **Why pick it:** Lets you request a single cropped image or GeoTIFF for any bounding box, date, and GIBS layer via simple query parameters (`REQUEST=GetSnapshot&TIME=2025-07-01&BBOX=...&LAYERS=...`).

### 12. NASA Scientific Visualization Studio (SVS) API
* **Base URL:** `https://svs.gsfc.nasa.gov/api/vis/{id}`
* **Auth:** **None**.
* **Output Formats:** `JSON` metadata linking to high-res videos, frames, and colorbars.
* **Why pick it:** Great for embedding official NASA explanatory animations when teaching high school/college users about complex processes (e.g., ENSO, Hadley cell shifts, Arctic amplification).

---

## Tier 4: Search, Metadata & "Detective Lead" Discovery APIs
*The challenge suggests helping users find regions/events of interest via news, natural hazards, or metadata discovery.*

### 13. NASA CMR API (Common Metadata Repository) & CMR-STAC
* **Base URLs:**
  * Search: `https://cmr.earthdata.nasa.gov/search/` (`collections.json`, `granules.json`, `variables.json`)
  * STAC: `https://cmr.earthdata.nasa.gov/stac/`
* **Auth:** **None** for public search.
* **Output Formats:** `JSON`, `UMM-JSON`, `STAC-JSON`, `ATOM/XML`.
* **Why pick it:** Queries `variables.json` (UMM-Var) to fetch official NASA variable definitions, units, scale factors, and science keywords—directly addressing the prompt's recommendation: *"Providing simple definitions of the variables would help these users considerably."*

### 14. NASA EONET API (Earth Observatory Natural Event Tracker v3)
* **Base URL:** `https://eonet.gsfc.nasa.gov/api/v3/events` (and `/categories`, `/layers`)
* **Key Categories:** Drought, Wildfires, Severe Storms, Floods, Volcanoes, Sea and Lake Ice, Dust and Haze, Temperature Extremes, Water Color.
* **Auth:** **None**.
* **Output Formats:** `JSON`, `GeoJSON`.
* **Why pick it:** Gives you real-world "Case Files" with exact `[lat, lon]` coordinates and timestamps. A user can click an EONET Drought or Wildfire event, and your app automatically queries the long-term temperature/precipitation/NDVI trend at that exact coordinate to see if a long-term trend set the stage for the event.

### 15. NASA FIRMS API (Fire Information for Resource Management System)
* **Base URL:** `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{AREA_COORDS}/{DAY_RANGE}/{DATE}`
* **Missions Covered:** **MODIS** ($2000\text{--present}$), VIIRS ($2012\text{--present}$), Landsat.
* **Auth:** Free `MAP_KEY` (instant email registration).
* **Output Formats:** `CSV`, `JSON`, `KML`, `WMS`.
* **Why pick it:** Tracks Fire Radiative Power (`frp`) and brightness temperature anomalies over time.

### 16. NASA SEDAC (Socioeconomic Data and Applications Center) OGC APIs
* **Base URL:** `https://sedac.ciesin.columbia.edu/geoserver/wms` (and `/wcs`)
* **Key Variables:** Gridded Population of the World (GPW), Global Urban Heat Island (UHI), Air Quality $\text{PM}_{2.5}$ grids, Anthropogenic Biomes.
* **Auth:** **None** for WMS tiles.
* **Why pick it:** Lets users overlay human population density or urban heat maps with physical Earth trends.

---

## Tier 5: General `api.nasa.gov` Endpoints
*Hosted under NASA's central open API gateway (`https://api.nasa.gov/`). Requires a free `api_key` (or `DEMO_KEY` for low-rate testing).*

| API Name | Endpoint | Relevance to This Challenge |
| :--- | :--- | :--- |
| **17. EPIC API** (DSCOVR) | `https://api.nasa.gov/EPIC/api/natural` | Full-disc daily Earth imagery from the $L_1$ Lagrange point. Cool for a UI splash screen or global view, not for gridded regional stats. |
| **18. Earth / Landsat Assets** | `https://api.nasa.gov/planetary/earth/assets` | *Legacy endpoint* (often rate-limited/deprecated in favor of CMR-STAC / AppEEARS HLS). |
| **19. DONKI API** (Space Weather) | `https://api.nasa.gov/DONKI/CME` (`/FLR`, `/GST`, `/SEP`) | Tracks Solar Flares, CMEs, and Geomagnetic Storms. Useful if investigating solar cycle forcing on upper-atmosphere/ozone (**OMI**) trends. |
| **20. NASA Image & Video Library** | `https://images-api.nasa.gov/search?q=...` | Zero-auth media search for pulling educational imagery for variable cards. |
| **21. APOD / NeoWs / Mars / TechPort / OSDR** | `https://api.nasa.gov/planetary/apod`, `/neo/rest/v1/`, etc. | Astronomy, asteroids, Mars rovers, space biology, and patents. Not needed for Earth system trend analysis. |

---

## Tier 6: Challenge-Mentioned External / Partner APIs
*Explicitly highlighted in the challenge prompt under "Potential Considerations".*

### 22. CUAHSI HIS (Hydrologic Information System) / WaterOneFlow & HydroClient APIs
* **Base URLs:**
  * Central Catalog (HIS Central REST): `https://hiscentral.cuahsi.org/webservices/hiscentral.asmx`
  * USGS Instantaneous / Daily Streamflow (REST JSON, part of CUAHSI ecosystem): `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=...` and OGC API `https://api.waterdata.usgs.gov/ogcapi/v0/`
  * NASA GES DISC CUAHSI WaterOneFlow endpoint (bridges **GLDAS** & **NLDAS** into CUAHSI format): `https://hydro1.gesdisc.eosdis.nasa.gov/daac-bin/cuahsi/his.cgi`
* **Key Variables:** Streamflow / Discharge ($\text{ft}^3/\text{s}$ or $\text{m}^3/\text{s}$), gage height, water temperature, groundwater levels, soil moisture.
* **Auth:** **None**.
* **Why pick it:** Directly checks the box for two challenge prompts: analyzing complex variables like **streamflow**, and integrating **CUAHSI** hydrological plotting/data tools.

---

## Summary Matrix: Which APIs Cover the Prompt's Exact Named Missions?

| Mission / Model in Prompt | Best Instant / Zero-Auth API | Best Deep Archive / Authenticated API | Visual Map Tile API |
| :--- | :--- | :--- | :--- |
| **MERRA-2** (Reanalysis Model) | **NASA POWER API** (`JSON`/`CSV`) | **GES DISC Data Rods** / **Giovanni** / **OPeNDAP** | **NASA GIBS** |
| **GLDAS** (Land Model) | **NASA VEDA Raster API** | **GES DISC Data Rods** / **Giovanni** | **NASA GIBS** |
| **MODIS** (Land/Biosphere/Temp) | **ORNL DAAC MODIS REST API** | **LP DAAC AppEEARS API** / **Giovanni** | **NASA GIBS** |
| **GPM** (Precipitation) | **NASA POWER API** / **VEDA API** | **GES DISC Data Rods** / **Giovanni** | **NASA GIBS** |
| **OMI** (Ozone / $\text{NO}_2$ / $\text{SO}_2$) | **NASA VEDA STAC/Raster API** | **Giovanni** / **GES DISC OPeNDAP** | **NASA GIBS** |
| **AIRS** (Atmospheric IR / Temp / $\text{CO}_2$ / $\text{CH}_4$) | *Pre-cached via Giovanni/OPeNDAP* | **Giovanni** / **GES DISC OPeNDAP** | **NASA GIBS** |
| **Streamflow / Hydrology** | **USGS / CUAHSI Water Services** | **GES DISC Data Rods (CUAHSI endpoint)** | — |