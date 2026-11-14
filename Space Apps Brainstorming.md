# 🕵️‍♂️ NASA Space Apps 2026: Earth System Trend Detective
**Brainstorming & Strategy Document**

---

## 1. Deconstructing the Prompt (What Judges Are Looking For)
To win this challenge, your tool can't just be another map viewer or raw data plotter. It needs to bridge the gap between **complex Earth science data** and **statistical literacy** for students and citizen scientists. 

**The 4 Pillars of the Challenge:**
1. **Variable Selection:** Help users navigate overwhelming NASA datasets (MODIS, MERRA-2, GPM, etc.) without needing a PhD.
2. **Regional Focus & Paradoxes:** Highlight how a single global process can cause *opposite* trends in different regions (e.g., warming causing drought in one place and extreme rainfall in another).
3. **Time-Series Visualization:** Plot daily/monthly data over long periods.
4. **Statistical "Significance":** Calculate the rate of change and prove whether the trend is statistically significant or just random noise.

---

## 2. The Core Theme: Lean Into the "Detective" Metaphor
Since the target audience is high school/college students and the public, gamifying the UI/UX around a **Detective / Cold Case** theme will make your project instantly memorable to judges.

*   **The Crime Scene:** The selected geographic bounding box or biome on the map.
*   **Suspects (Variables):** Temperature, Precipitation, Soil Moisture, Aerosol Optical Depth, etc. (Provide "Rap Sheets" = simple, jargon-free definitions of what these variables actually mean).
*   **The Disguise (Seasonality):** Explain to users that seasonal cycles hide the real trend. Give them a "Remove Disguise" button (Deseasonalization / Seasonal Decomposition) to see the underlying linear trend.
*   **The Interrogation (Statistical Analysis):** Running the math on the time series.
*   **The Verdict (Significance):** Translate statistical outputs like $p$-values into detective terms:
    *   $p < 0.01$: *"Beyond a Shadow of a Doubt"* (Highly Significant)
    *   $p < 0.05$: *"Strong Circumstantial Evidence"* (Statistically Significant)
    *   $p \ge 0.05$: *"Insufficient Evidence / Just Noise"* (Not Significant—needs a longer timeframe or different variable).

---

## 3. Three Distinct Project Angles

### Idea A: "GeoSherlock" (The Guided Mystery & Sandbox App)
*   **Concept:** A two-mode web application. Mode 1 features "Pre-Solved Cases" (guided interactive stories showing famous trends, like the drying of the Aral Sea or urban heat islands). Mode 2 is "Open Investigation," where users use an interactive Q&A wizard to investigate their own backyard.
*   **The Wizard:** Instead of asking "Which MODIS band do you want?", ask: *"What kind of area are you investigating?"* (City, Forest, Coast, Farmland) $\rightarrow$ *"What are you worried about?"* (Water drying up, getting too hot, air quality) $\rightarrow$ Auto-selects the exact GLDAS or OMI variable.

### Idea B: "Butterfly Effect" (The Opposite Trends Explorer)
*   **Concept:** Focus heavily on the prompt's mention that *one process drives opposite trends in different regions*. Allow users to split their screen to compare two regions simultaneously.
*   **How it works:** If a user selects "Precipitation" in the US Southwest (trending down), an AI assistant suggests: *"Did you know the exact same atmospheric shift is causing Precipitation to trend UP in the US Northeast? Click to compare."*

### Idea C: "News-to-NASA" (The AI Fact-Checker)
*   **Concept:** Address the prompt's suggestion to use AI and news articles. Users paste a link or headline about a local climate event (e.g., *"Record heatwaves hitting Southeast Asia"*), or simply type a natural language question.
*   **How it works:** An LLM extracts the **Location** and the relevant **NASA Variable**, automatically fetches the last 20 years of monthly data for those coordinates, runs a Mann-Kendall test, and tells the user if this is a statistically significant long-term trend or an isolated anomaly.

---

## 4. Must-Have Features (The "Secret Sauce")

1.  **The "Plain-English" Stat Engine:**
    *   Use the **Mann-Kendall Trend Test** (the gold standard in environmental science because it doesn't require data to be normally distributed and handles missing values well).
    *   Use **Sen's Slope** to calculate the *rate of change* (e.g., $+0.04\text{ }^\circ\text{C}$ per year).
    *   Show the linear regression line ($y = mx + b$) and the $95\%$ confidence interval shaded around it.
2.  **Seasonal Adjustment Toggle:**
    *   Earth data goes up and down every summer and winter. If you run a naive linear regression on 5 years of monthly temperature data, the seasonal swings make the $R^2$ value look terrible. Building a simple toggle that plots **Annual Anomalies** or **12-Month Moving Averages** will impress the science judges.
3.  **The "Wait Longer" Simulator:**
    *   The prompt notes: *"Sometimes all a trend needs to become significant is a longer period."* Include a time-slider where users can see how a 5-year window shows "No Significant Trend" ($p > 0.05$), but expanding the slider to 30 years suddenly turns the badge green ("Significant Trend Detected!").

---

## 5. Technical Stack & Data Survival Guide
**⚠️ Hackathon Warning:** Raw NASA files (NetCDF / HDF5 from Giovanni or Earthdata) are massive and notoriously difficult to parse on the fly in a 48-hour hackathon. **Do not try to download global gridded files in real-time.** Use point/regional APIs instead!

### Recommended Data Sources (Fast & API-Friendly):
*   **NASA POWER API:** *Highly Recommended!* Gives instant JSON time-series data for meteorology, temperature, precipitation, humidity, and solar data for any lat/long coordinate (draws from MERRA-2 and GLDAS!). No heavy file parsing required.
*   **Google Earth Engine (GEE) API / Microsoft Planetary Computer:** Great if your backend is Python; allows you to query MODIS, GPM, and OMI over a polygon and return just the aggregated monthly numbers.
*   **AppEEARS API (NASA):** Allows you to extract point or area samples from MODIS and other land datasets into clean CSV/JSON formats.
*   **CUAHSI HydroClient / USGS Water Services:** Easy REST APIs for streamflow and hydrological data.

### Recommended Tech Stack:
*   **Frontend:** React / Next.js + Tailwind CSS.
*   **Mapping:** Leaflet.js or Mapbox GL (with a simple bounding-box or pin-drop tool).
*   **Charts:** Plotly.js or Recharts (Plotly is great because it supports confidence interval shading and trendlines out of the box).
*   **Backend (The Brains):** Python (FastAPI).
    *   `pymannkendall`: A literal lifesaver Python library. You pass it an array of numbers, and it immediately returns the trend direction (`increasing`/`decreasing`/`no trend`), $p$-value, $\tau$ (Kendall's Tau), and Sen's slope.
    *   `statsmodels`: For seasonal decomposition (`seasonal_decompose`) and $t$-tests.
*   **AI Layer:** Gemini API or OpenAI API to power the "Detective Assistant" (translating the statistical outputs and variable definitions for high school students).

---

## 6. Immediate Next Steps for Your Team
1.  **Lock in the Scope:** Decide if you are doing a global point-clicker (using NASA POWER API) or pre-loading 5–10 fascinating regional datasets so the app runs at lightning speed during judging. *(Hint: Do a hybrid! Pre-cache 3 amazing demo cases, and use NASA POWER for live user queries).*
2.  **Test the Math Early:** Have a backend dev spin up a quick Python script with `pymannkendall` and NASA POWER API today to prove you can go from `Lat/Long` $\rightarrow$ `JSON Data` $\rightarrow$ `Statistical Verdict` in under 3 seconds.
3.  **Design the UI Flow:** Sketch out the "Wizard" so the user journey feels like an investigation rather than a spreadsheet tool.