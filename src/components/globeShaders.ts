/**
 * GLSL Shaders for Stratum-4D Digital Twin Globe
 * Ported & adapted from HotEARTH
 * 
 * Features:
 * - NOAA Spencer solar position twilight terminator
 * - High-ambient floor (0.88) so night-side basin anomalies remain fully legible
 * - Multi-sampler blending: Day Blue Marble, Night Black Marble, and NASA GIBS data overlays
 * - Auto-dimming daytime albedo when data focus (3D relief, streamlines, overlays) is active
 * - Multi-spectral Rayleigh atmosphere rim glow shell with orbital limb fresnel
 * - Basin statistical significance shader with fresnel rim, IPCC dot stippling, and screen-space hatching
 * - 3D Great-Circle quadratic dipole arc with directional traveling pulses
 */

export const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vNormal = normalize(normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D overlayMap;
  uniform sampler2D baselineMap;
  uniform float overlayStrength;
  uniform vec3 sunDir;
  uniform float uDataFocusFactor;
  uniform float uEpochDeltaMode;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormal);
    // Sine of solar elevation angle at this surface point
    float sunDot = dot(n, normalize(sunDir));

    vec3 day = texture2D(dayMap, vUv).rgb;

    // NASA GIBS data overlay (Surface Temp / Precipitation), alpha-composited over day surface
    vec4 overlay = texture2D(overlayMap, vUv);

    if (uEpochDeltaMode > 0.5) {
      vec4 baseline = texture2D(baselineMap, vUv);
      // Monotonic perceptual luminance transfer function (ITU-R BT.601)
      float overlayLum = dot(overlay.rgb, vec3(0.299, 0.587, 0.114));
      float baselineLum = dot(baseline.rgb, vec3(0.299, 0.587, 0.114));
      float dVal = overlayLum - baselineLum;
      vec3 negDeltaColor = vec3(0.92, 0.22, 0.20); // Secular drying / warming red
      vec3 posDeltaColor = vec3(0.18, 0.52, 0.95); // Secular wetting / cooling blue
      vec3 neutralColor = vec3(0.12, 0.14, 0.18);
      vec3 deltaCol = dVal < 0.0
        ? mix(neutralColor, negDeltaColor, clamp(abs(dVal) * 3.0, 0.0, 1.0))
        : mix(neutralColor, posDeltaColor, clamp(dVal * 3.0, 0.0, 1.0));
      day = mix(day, deltaCol, overlayStrength * 0.9);
    } else {
      day = mix(day, overlay.rgb, overlay.a * overlayStrength);
    }

    // Auto-dimming day albedo when data focus is active (3D extrusions, streamlines, data layers)
    // Darken daytime albedo by 65% (leaving 35%) to prevent bright deserts from washing out data colors
    day = mix(day, day * 0.35, clamp(uDataFocusFactor, 0.0, 1.0));

    // NASA Black Marble night city lights
    vec3 night = texture2D(nightMap, vUv).rgb;
    night = night * vec3(1.32, 1.22, 1.02) * 1.6;
    night = mix(night, overlay.rgb * 0.42, overlay.a * overlayStrength * 0.55);

    // Twilight band: sin(-12 deg) = -0.2079 (nautical twilight) to +0.12 (daybreak)
    float daylight = smoothstep(-0.2079, 0.12, sunDot);

    // High-ambient baseline: ensure night side data-colored basins remain fully legible (0.88 ambient floor)
    float ambientFloor = 0.88;
    vec3 ambientNight = max(night, day * ambientFloor);

    // Diffuse solar illumination
    float diffuse = 0.88 + 0.12 * pow(clamp(sunDot, 0.0, 1.0), 0.55);
    vec3 litColor = day * diffuse;
    vec3 color = mix(ambientNight, litColor, daylight);

    // Enhanced Rayleigh scattering limb fresnel on the orbital horizon
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 2.8);
    color += vec3(0.28, 0.55, 0.95) * fresnel * 0.40 * max(daylight, 0.25);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vNormal = normalize(normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 sunDir;

  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    // Subtle Rayleigh rim fresnel
    float rim = pow(clamp(1.0 - abs(dot(viewDir, n)), 0.0, 1.0), 2.2);
    // Orbital atmospheric depth
    float sunLit = clamp(dot(n, normalize(sunDir)) * 1.2 + 0.45, 0.15, 1.0);
    // Multi-spectral Rayleigh gradient: deep sapphire to cyan limb
    vec3 deepSky = vec3(0.12, 0.38, 0.92);
    vec3 limbGlow = vec3(0.35, 0.72, 1.0);
    vec3 sky = mix(deepSky, limbGlow, rim);

    float alpha = rim * sunLit * 0.88;
    gl_FragColor = vec4(sky * sunLit * 2.2, alpha);
    #include <colorspace_fragment>
  }
`;

export const BASIN_VERTEX = /* glsl */ `
  attribute float aPValue;
  attribute float aSlope;

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vPValue;
  varying float vSlope;

  void main() {
    vPValue = aPValue;
    vSlope = aSlope;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const BASIN_FRAGMENT = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform float uOpacity;
  uniform float uIsSelected;
  uniform float uSelected;
  uniform float uPValue;
  uniform float uSlope;
  uniform float uIsSignificant;
  uniform float uSignificanceLock;

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vPValue;
  varying float vSlope;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 n = normalize(vNormal);
    float fresnelRim = pow(1.0 - clamp(abs(dot(viewDir, n)), 0.0, 1.0), 2.5);

    vec3 baseTrendColor = uBaseColor;
    float selected = max(uIsSelected, uSelected);

    // Reliable significance check using uIsSignificant uniform (prevents 0.0 default attribute bugs)
    float sigValue = uIsSignificant >= 0.0 ? uIsSignificant : (uPValue < 0.05 ? 1.0 : step(vPValue, 0.0499));
    // Selection must not change the significance encoding: a selected non-significant region stays hatched.
    float isSig = sigValue;

    // IPCC Procedural Dot Stippling on significant catchments (p* < 0.05)
    vec2 stippleCoord = mod(gl_FragCoord.xy, 6.0);
    float dotStipple = (stippleCoord.x < 2.0 && stippleCoord.y < 2.0) ? 1.0 : 0.0;

    // Emissive surface highlight: blend dotStipple * 0.25 on significant catchments
    vec3 sigColor = baseTrendColor + vec3(0.18) * fresnelRim + vec3(dotStipple * 0.25);

    // On non-significant basins (p* >= 0.05): render diagonal cross-hatching and desaturated tone
    float hatch = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.08));
    vec3 desaturatedTone = vec3(dot(baseTrendColor, vec3(0.299, 0.587, 0.114)));
    vec3 nonSigColor = mix(vec3(0.20), desaturatedTone, 0.35) * hatch;

    vec3 color;
    float alpha;

    if (uSignificanceLock > 0.5) {
      if (isSig < 0.5) {
        // Significance lock active: force non-significant basins (p >= 0.05) to 0.15 opacity and hatch pattern
        color = nonSigColor;
        alpha = 0.15;
      } else {
        color = sigColor;
        alpha = clamp(uOpacity > 0.01 ? (uOpacity / 0.85) * 0.92 : 0.92, 0.0, 1.0);
      }
    } else {
      // Normal display mode
      color = mix(nonSigColor, sigColor, isSig);
      float baseAlpha = mix(0.28, 0.92, isSig);
      alpha = baseAlpha * (uOpacity > 0.01 ? (uOpacity / 0.85) : 1.0);
    }

    // Selected region: same colour, lifted towards white and near-opaque.
    color = mix(color, vec3(1.0), 0.14 * selected);
    alpha = mix(alpha, 0.95, selected);

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export const DIPOLE_ARC_VERTEX = /* glsl */ `
  attribute float aArcT;

  varying float vArcT;
  varying vec3 vWorldPos;

  void main() {
    vArcT = aArcT;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const DIPOLE_ARC_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorPos;
  uniform vec3 uColorNeg;
  uniform float uIsDashed;
  uniform float uGlowIntensity;

  varying float vArcT;
  varying vec3 vWorldPos;

  void main() {
    if (uIsDashed > 0.5) {
      // Weak correlation renders as faint dashed line along arc
      float dash = step(0.42, fract(vArcT * 26.0));
      if (dash < 0.5) discard;
    }

    // Gradient along arc from positive anomaly pole (vArcT = 0.0) to negative anomaly pole (vArcT = 1.0)
    vec3 baseCol = mix(uColorPos, uColorNeg, vArcT);

    // Directional pulses traveling from positive-anomaly pole (0.0) to negative-anomaly pole (1.0)
    float pulsePhase = fract(vArcT * 2.5 - uTime * 1.6);
    float pulseMult = uIsDashed > 0.5 ? 0.3 : uGlowIntensity;
    float pulse = pow(clamp(1.0 - pulsePhase, 0.0, 1.0), 4.5) * pulseMult;
    float softPulse = pow(clamp(1.0 - pulsePhase, 0.0, 1.0), 2.0) * (pulseMult * 0.25);

    // Luminous glowing core
    vec3 coreColor = mix(baseCol, vec3(1.0, 1.0, 1.0), 0.75);
    vec3 color = baseCol + coreColor * (pulse + softPulse);

    // Fade ends smoothly into the basin centroids
    float endpointFade = smoothstep(0.0, 0.04, vArcT) * smoothstep(1.0, 0.96, vArcT);
    float alphaBase = uIsDashed > 0.5 ? 0.25 : 0.65;
    float alpha = clamp(alphaBase + pulse * 0.45, 0.0, 1.0) * endpointFade;

    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;
