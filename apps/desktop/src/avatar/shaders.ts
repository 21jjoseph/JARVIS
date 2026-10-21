export const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uSpikes;
uniform float uBreath;
uniform float uAmplitude;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vPeak;

float field(vec3 n) {
  float t = uTime;
  float waves = sin(n.x * 5.0 + t * 0.8) * sin(n.y * 6.0 - t * 0.65) * sin(n.z * 5.0 + t * 0.4);
  float fine = sin(n.x * 13.0 + n.z * 7.0 - t) * sin(n.y * 11.0 + t * 0.6);
  float spikes = 0.0;
  // Fibonacci directions form a magnetic field over the whole surface.
  for (int i = 0; i < 34; i++) {
    float f = float(i);
    float y = 1.0 - (f + 0.5) * (2.0 / 34.0);
    float r = sqrt(1.0 - y * y);
    float a = f * 2.39996323 + 0.13 * sin(t * 0.36 + f * 0.7);
    vec3 direction = vec3(cos(a) * r, y, sin(a) * r);
    float pole = max(0.0, dot(n, direction));
    float pulse = 0.8 + 0.2 * sin(t * 1.3 + f * 1.7);
    spikes += pow(pole, 58.0) * pulse;
  }
  float ridges = sin(atan(n.z, n.x) * 11.0 + n.y * 6.0 + t * 0.3);
  return 1.0 + uIntensity * (waves * 0.07 + fine * 0.018 + ridges * ridges * 0.012
    + spikes * (uSpikes + uAmplitude * 0.55)) + sin(t * 1.8) * uBreath + uAmplitude * 0.06;
}
void main() {
  vec3 n = normalize(position);
  float radius = field(n);
  vec3 p = n * radius;
  vec3 tangent = normalize(cross(n, abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  vec3 bitangent = cross(n, tangent);
  vec3 n1 = normalize(n + tangent * 0.003);
  vec3 n2 = normalize(n + bitangent * 0.003);
  vec3 normalDisplaced = normalize(cross(n1 * field(n1) - p, n2 * field(n2) - p));
  vNormal = normalize(normalMatrix * normalDisplaced);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vPosition = mvPosition.xyz;
  vPeak = radius - 1.0;
  gl_Position = projectionMatrix * mvPosition;
}
`;
export const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uGlow;
uniform float uHeat;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vPeak;

vec3 studio(vec3 r) {
  vec3 result = vec3(0.025, 0.037, 0.055);
  // Softbox reflections give the black metal a liquid, dimensional surface.
  float upper = pow(max(dot(r, normalize(vec3(-0.4, 1.0, 0.7))), 0.0), 24.0);
  float strip = pow(max(dot(r, normalize(vec3(0.8, 0.35, 0.8))), 0.0), 64.0);
  float lower = pow(max(dot(r, normalize(vec3(-0.8, -0.3, 0.3))), 0.0), 40.0);
  float ceiling = smoothstep(0.65, 0.86, r.y) * (1.0 - smoothstep(0.91, 0.98, r.y));
  result += vec3(0.85, 0.95, 1.0) * upper * 1.35;
  result += vec3(0.95, 0.98, 1.0) * strip * 1.8;
  result += uColor * lower * 1.5;
  result += vec3(0.28, 0.36, 0.42) * ceiling;
  return result;
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(-vPosition);
  vec3 reflected = reflect(-view, n);
  float ndv = max(dot(n, view), 0.0);
  float fresnel = pow(1.0 - ndv, 3.0);
  vec3 accent = mix(uColor, mix(vec3(1.0, 0.54, 0.12), vec3(1.0, 0.18, 0.1), uHeat), uHeat);
  vec3 base = vec3(0.015, 0.024, 0.032);
  vec3 color = base + studio(reflected) * (0.38 + fresnel * 0.62);
  color += accent * fresnel * uGlow * 0.8;
  color += accent * smoothstep(0.20, 0.52, vPeak) * uGlow * 0.12;
  color = color / (color + vec3(0.85));
  gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`;
