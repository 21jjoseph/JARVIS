import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Runtime, Settings } from '../../../../shared/contracts';
import { damp, PROFILES } from './profiles';
import { vertexShader, fragmentShader } from './shaders';

interface Props {
  runtime: Runtime;
  settings: Settings;
  large?: boolean;
}
export function Ferrofluid({ runtime, settings, large = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const props = useRef({ runtime, settings });
  props.current = { runtime, settings };
  const [error, setError] = useState('');
  const [fps, setFps] = useState(0);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
    } catch {
      setError('WebGL indisponibil. Activează accelerarea grafică și repornește 21.');
      return;
    }
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
    camera.position.z = 4.8;
    const uniforms = {
      uTime: { value: 0 },
      uSpikes: { value: 0.24 },
      uBreath: { value: 0.025 },
      uAmplitude: { value: 0 },
      uIntensity: { value: settings.intensity },
      uColor: { value: new THREE.Color(settings.color) },
      uGlow: { value: 0.26 },
      uHeat: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    let geometry = new THREE.SphereGeometry(1, 144, 112);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(0.2, 0.35, 0.15);
    scene.add(mesh);
    let low = false;
    let degraded = false;
    let currentQuality = '';
    const setQuality = () => {
      const quality = props.current.settings.quality;
      const nextLow =
        quality === 'low' ||
        (quality === 'auto' && (degraded || navigator.hardwareConcurrency <= 4));
      const key = `${quality}-${nextLow}`;
      if (currentQuality === key) return;
      currentQuality = key;
      low = nextLow;
      geometry.dispose();
      geometry = new THREE.SphereGeometry(1, low ? 72 : 144, low ? 56 : 112);
      mesh.geometry = geometry;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1 : 1.75));
      resize();
    };
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setError('Contextul grafic s-a oprit. Repornește 21.');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    let frame = 0,
      last = performance.now(),
      rendered = last,
      windowStart = last,
      frames = 0,
      slowWindows = 0;
    let speed = 0.18;
    let disposed = false;
    const render = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(render);
      if (document.hidden) {
        last = now;
        return;
      }
      const { runtime: state, settings: options } = props.current;
      setQuality();
      const targetFps = options.reducedMotion
        ? 15
        : low || state.state === 'IDLE' || state.state === 'OFFLINE'
          ? 30
          : 60;
      if (now - rendered < 1000 / targetFps - 1) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      rendered = now;
      const profile = PROFILES[state.state];
      speed = damp(speed, profile.speed, dt);
      uniforms.uTime.value += dt * speed * (options.reducedMotion ? 0.1 : 1);
      uniforms.uSpikes.value = damp(uniforms.uSpikes.value, profile.spikes, dt);
      uniforms.uBreath.value = damp(
        uniforms.uBreath.value,
        options.reducedMotion ? 0 : profile.breath,
        dt,
      );
      uniforms.uAmplitude.value = damp(
        uniforms.uAmplitude.value,
        state.amplitude * (options.reducedMotion ? 0.15 : 1),
        dt,
        state.amplitude > uniforms.uAmplitude.value ? 14 : 6,
      );
      uniforms.uGlow.value = damp(uniforms.uGlow.value, profile.glow, dt);
      uniforms.uHeat.value = damp(uniforms.uHeat.value, profile.heat, dt);
      uniforms.uIntensity.value = damp(uniforms.uIntensity.value, options.intensity, dt);
      uniforms.uColor.value.lerp(new THREE.Color(options.color), 1 - Math.exp(-dt * 5));
      mesh.rotation.y += dt * speed * (options.reducedMotion ? 0 : 0.08);
      renderer.render(scene, camera);
      container.dataset.rendered = 'true';
      frames++;
      if (now - windowStart > 2500) {
        const actual = Math.round((frames * 1000) / (now - windowStart));
        setFps(actual);
        if (actual < targetFps * 0.7) slowWindows++;
        else slowWindows = 0;
        if (slowWindows >= 2) degraded = true;
        windowStart = now;
        frames = 0;
      }
    };
    frame = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
    // Renderer lifetime is independent from frequent audio and state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      className={`ferrofluid ${large ? 'ferrofluid-large' : ''}`}
      ref={host}
      role="img"
      aria-label={`Ferrofluid avatar: ${runtime.state}`}
      data-testid="ferrofluid"
    >
      {error && (
        <div className="render-error" role="alert">
          {error}
        </div>
      )}
      {large && !error && (
        <span className="render-stats">
          WEBGL · {settings.quality.toUpperCase()} · {fps ? `${fps} FPS` : 'INITIALIZING'}
        </span>
      )}
    </div>
  );
}
