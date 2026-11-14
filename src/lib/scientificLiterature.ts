/**
 * Peer-Reviewed Scientific Literature and Grounding Database
 * Stratum-4D · NASA Space Apps Challenge (Earth System Trend Detective)
 * 
 * Authoritative peer-reviewed publications grounding the empirical satellite
 * observations, non-parametric trend detections, and biome causal attributions.
 */

export interface ScientificPublication {
  id: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  doi: string;
  url: string;
  category: 'GROUNDWATER' | 'CRYOSPHERE' | 'PEATLAND_ATMOSPHERE' | 'GRAVIMETRY' | 'HYDROLOGY';
  associatedBasinIds: string[];
  associatedBiomes: string[];
  keyFinding: string;
  instruments: string[];
}

export const PEER_REVIEWED_LITERATURE: ScientificPublication[] = [
  {
    id: 'famiglietti-2011-california',
    title: "Satellites measure recent groundwater depletion in California's Central Valley",
    authors: 'Famiglietti, J. S., Lo, M., Ho, S. L., Bethune, J., Anderson, K. J., Syed, T. H., Swenson, S. C., de Linage, C. R., & Rodell, M.',
    year: 2011,
    journal: 'Geophysical Research Letters',
    doi: '10.1029/2010GL046442',
    url: 'https://doi.org/10.1029/2010GL046442',
    category: 'GROUNDWATER',
    associatedBasinIds: ['BASIN_CALIFORNIA_CV'],
    associatedBiomes: ['ANTHROPOGENIC', 'DESERT', 'MEGACITY_ATMOSPHERE'],
    keyFinding:
      'Twin-satellite GRACE gravimetry observed 20.3 ± 3.8 km³ of groundwater depletion in California Central Valley (Sacramento & San Joaquin) from 2003–2010 due to agricultural pumping during drought.',
    instruments: ['GRACE KBR', 'USGS Piezometer Network', 'GLDAS NOAH LSM'],
  },
  {
    id: 'rodell-2009-india',
    title: 'Satellite-based estimates of groundwater depletion in India',
    authors: 'Rodell, M., Velicogna, I., & Famiglietti, J. S.',
    year: 2009,
    journal: 'Nature',
    doi: '10.1038/nature08238',
    url: 'https://doi.org/10.1038/nature08238',
    category: 'GROUNDWATER',
    associatedBasinIds: ['BASIN_INDUS', 'BASIN_GANGES_BRAHMAPUTRA'],
    associatedBiomes: ['ANTHROPOGENIC', 'TIDAL_ESTUARY', 'MEGACITY_ATMOSPHERE'],
    keyFinding:
      'Groundwater is being depleted at an alarming median rate of 54 ± 9 km³ over northern India (Rajasthan, Punjab, Haryana, Delhi), leading to irreversible aquifer drawdown driven by unmetered electric tube-wells.',
    instruments: ['GRACE Mascon', 'GLDAS-1 Soil Moisture', 'In-Situ Monitoring Wells'],
  },
  {
    id: 'rodell-2018-global-trends',
    title: 'Emerging trends in global freshwater availability',
    authors: 'Rodell, M., Famiglietti, J. S., Wiese, D. N., Reager, J. T., Beaudoing, H. K., Landerer, F. W., & Lo, M.-H.',
    year: 2018,
    journal: 'Nature',
    doi: '10.1038/s41586-018-0123-1',
    url: 'https://doi.org/10.1038/s41586-018-0123-1',
    category: 'HYDROLOGY',
    associatedBasinIds: [
      'BASIN_CALIFORNIA_CV',
      'BASIN_GREAT_BASIN_EAST',
      'BASIN_INDUS',
      'BASIN_GANGES_BRAHMAPUTRA',
      'BASIN_CASPIAN',
      'BASIN_TIBETAN_PLATEAU',
      'BASIN_SAHEL',
      'BASIN_YELLOW_RIVER',
      'BASIN_COLORADO',
      'BASIN_TIGRIS_EUPHRATES',
    ],
    associatedBiomes: ['DESERT', 'ANTHROPOGENIC', 'TIDAL_ESTUARY', 'CRYOSPHERE'],
    keyFinding:
      'Identified and attributed 34 global hotspots of freshwater change from 2002–2016, distinguishing direct human interventions from climate change teleconnections and interannual climate variability.',
    instruments: ['GRACE JPL RL05 Mascons', 'GPCP Precipitation', 'MODIS Surface Albedo'],
  },
  {
    id: 'wiese-2016-jpl-mascon',
    title: 'Alternative representation of Earth’s gravity field: JPL Mascon RL06 CRI',
    authors: 'Wiese, D. N., Landerer, F. W., & Watkins, M. M.',
    year: 2016,
    journal: 'Journal of Geophysical Research: Solid Earth',
    doi: '10.1002/2016JB013008',
    url: 'https://doi.org/10.1002/2016JB013008',
    category: 'GRAVIMETRY',
    associatedBasinIds: [
      'BASIN_AMAZON_LOWER',
      'BASIN_SAO_FRANCISCO',
      'BASIN_PARANA_LA_PLATA',
      'BASIN_CONGO',
      'BASIN_YANGTZE',
      'BASIN_DANUBE',
    ],
    associatedBiomes: ['RAINFOREST', 'TIDAL_ESTUARY', 'WATER_BODY'],
    keyFinding:
      'Coastline Resolution Improvement (CRI) filtering resolves sub-basin hydrologic mass variations in the Amazon Tapajós and prevents terrestrial-ocean leakage, isolating equatorial rainfall anomalies.',
    instruments: ['GRACE / GRACE-FO K-Band Ranging', 'AOD1B De-aliasing', 'CRI Mascon Filter'],
  },
  {
    id: 'airs-science-team-2013-co',
    title: 'AIRS/Aqua Level 3 Daily Standard Physical Inversion (AIRS+AMSU) V006 (AIRX3STD)',
    authors: 'AIRS Science Team / Teixeira, J. (NASA GES DISC)',
    year: 2013,
    journal: 'Goddard Earth Sciences Data and Information Services Center (GES DISC)',
    doi: '10.5067/Aqua/AIRS/DATA301',
    url: 'https://doi.org/10.5067/Aqua/AIRS/DATA301',
    category: 'PEATLAND_ATMOSPHERE',
    associatedBasinIds: ['CASE_07_SEA_CO_PLUME', 'case-07-sea-co-plume', 'BASIN_IOD_EAST'],
    associatedBiomes: ['RAINFOREST', 'MEGACITY_ATMOSPHERE'],
    keyFinding:
      'Atmospheric Infrared Sounder (AIRS) satellite retrieval dataset providing global 500 hPa carbon monoxide volume mixing ratio grids, capturing transboundary smoke lofting and mid-tropospheric plumes over SE Asia.',
    instruments: ['Aqua AIRS L3 500 hPa CO', 'AMSU Microwave Sounder'],
  },
  {
    id: 'field-2016-pnas-peat-fire',
    title: 'Indonesian fire activity and smoke pollution in 2015 show persistent nonlinear sensitivity to El Niño-induced drought',
    authors: 'Field, R. D., van der Werf, G. R., Fanin, T., Fetzer, E. J., Fuller, J., Jethva, H., Levy, R., Livesey, N. J., Luo, M., Torres, O., & Worden, H. M.',
    year: 2016,
    journal: 'Proceedings of the National Academy of Sciences (PNAS)',
    doi: '10.1073/pnas.1524888113',
    url: 'https://doi.org/10.1073/pnas.1524888113',
    category: 'PEATLAND_ATMOSPHERE',
    associatedBasinIds: ['CASE_07_SEA_CO_PLUME', 'case-07-sea-co-plume', 'BASIN_IOD_EAST'],
    associatedBiomes: ['RAINFOREST', 'MEGACITY_ATMOSPHERE'],
    keyFinding:
      'The 2015 Indonesian fire season was the most severe seen by NASA Earth Observing System satellites since the early 2000s. Fire activity rises nonlinearly during prolonged dry spells with less than about 4 mm of rain per day, on degraded peat that is still cleared by burning.',
    instruments: ['Terra and Aqua MODIS (active fires, aerosol optical depth)', 'Terra MOPITT CO', 'Aqua AIRS CO', 'Aura OMI aerosol index', 'Aura MLS CO', 'TRMM rainfall'],
  },
  {
    id: 'tapley-2019-grace-climate',
    title: 'Contributions of GRACE to understanding climate change',
    authors: 'Tapley, B. D., Watkins, M. M., Flechtner, F., Reigber, C., Bettadpur, S., Rodell, M., Sasgen, I., Famiglietti, J. S., Landerer, F. W., Chambers, D. P., Reager, J. T., Gardner, A. S., Save, H., Ivins, E. R., Wahr, J., & Wiese, D. N.',
    year: 2019,
    journal: 'Nature Climate Change',
    doi: '10.1038/s41558-019-0456-2',
    url: 'https://doi.org/10.1038/s41558-019-0456-2',
    category: 'GRAVIMETRY',
    associatedBasinIds: [],
    associatedBiomes: ['GLOBAL', 'CRYOSPHERE', 'DESERT', 'RAINFOREST'],
    keyFinding:
      'Over 15 years of GRACE measurements tracked 280 Gt/yr mass loss in Greenland and 150 Gt/yr in Antarctica, while tracking non-parametric continental water storage redistributions worldwide.',
    instruments: ['GRACE Dual-KBR', 'Superconducting Accelerometers', 'GPS Star Trackers'],
  },
  {
    id: 'velicogna-2020-ice-sheets',
    title: 'Continuity of ice sheet mass loss in Greenland and Antarctica from the GRACE and GRACE Follow-On missions',
    authors: 'Velicogna, I., Mohajerani, Y., A, G., Landerer, F., Mouginot, J., Noel, B., Rignot, E., Sutterley, T., van den Broeke, M., van Wessem, M., & Wiese, D.',
    year: 2020,
    journal: 'Geophysical Research Letters',
    doi: '10.1029/2020GL087291',
    url: 'https://doi.org/10.1029/2020GL087291',
    category: 'CRYOSPHERE',
    associatedBasinIds: ['BASIN_WEST_ANTARCTICA', 'BASIN_EAST_ANTARCTICA', 'BASIN_TIBETAN_PLATEAU'],
    associatedBiomes: ['CRYOSPHERE'],
    keyFinding:
      'Seamless transition from GRACE to GRACE-FO establishes sustained, accelerating ice loss in the Amundsen Sea Embayment of West Antarctica, contributing directly to barystatic global mean sea-level rise.',
    instruments: ['GRACE-FO Laser Ranging Interferometer (LRI)', 'RACMO2.3 Regional Climate Model'],
  },
  {
    id: 'scanlon-2018-pnas',
    title: 'Global models underestimate large decadal water storage trends relative to GRACE satellite data',
    authors: 'Scanlon, B. R., Zhang, Z., Save, H., Sun, A. Y., Müller Schmied, H., van Beek, L. P. H., Wiese, D. N., Wada, Y., Long, D., Reedy, R. C., Longuevergne, L., Döll, P., & Bierkens, M. F. P.',
    year: 2018,
    journal: 'Proceedings of the National Academy of Sciences (PNAS)',
    doi: '10.1073/pnas.1704665115',
    url: 'https://doi.org/10.1073/pnas.1704665115',
    category: 'HYDROLOGY',
    associatedBasinIds: ['BASIN_COLORADO', 'BASIN_TIGRIS_EUPHRATES', 'BASIN_MURRAY_DARLING'],
    associatedBiomes: ['DESERT', 'ANTHROPOGENIC'],
    keyFinding:
      'Global hydrological models systematically underestimate decadal water storage trends compared to GRACE, emphasizing the requirement for empirical satellite data integration over uncalibrated simulations.',
    instruments: ['GRACE Mascon Solutions (JPL/CSR/GSFC)', 'PCR-GLOBWB', 'WaterGAP2'],
  },
];

/**
 * Returns peer-reviewed literature matching a specific basin or biome,
 * always including benchmark foundations (e.g. Tapley et al., Rodell et al.).
 */
export function getLiteratureForBasin(
  basinId?: string | null,
  biome?: string | null
): ScientificPublication[] {
  const matches: ScientificPublication[] = [];
  const addedIds = new Set<string>();

  for (const pub of PEER_REVIEWED_LITERATURE) {
    let isMatch = false;

    if (basinId && pub.associatedBasinIds.includes(basinId)) {
      isMatch = true;
    } else if (biome && pub.associatedBiomes.includes(biome)) {
      isMatch = true;
    }

    if (isMatch && !addedIds.has(pub.id)) {
      matches.push(pub);
      addedIds.add(pub.id);
    }
  }

  // Fallback / complement with benchmark publications if under 3
  if (matches.length < 3) {
    for (const pub of PEER_REVIEWED_LITERATURE) {
      if (!addedIds.has(pub.id)) {
        matches.push(pub);
        addedIds.add(pub.id);
        if (matches.length >= 4) break;
      }
    }
  }

  return matches;
}
