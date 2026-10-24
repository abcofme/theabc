import { useEffect } from 'react';
import { createTiltTracker, toScreenAxes } from '../utils/tilt';
import './depth-motion.css';

const WebApp = window.Telegram.WebApp;
const SENSOR_INTERVAL = 40;
const EASE = 0.18;

// Эффект глубины: при наклоне телефона картинки сдвигаются, каждая на свою глубину (см. depth-motion.css).
// Датчик — DeviceOrientation Telegram (Bot API 8.0); в браузере — deviceorientation, если он не требует разрешения.
// Не работает при «Уменьшить движение» и выключается, пока приложение свернуто.
export default function DepthMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sensor = ['ios', 'android'].includes(WebApp.platform) && WebApp.isVersionAtLeast?.('8.0') ? WebApp.DeviceOrientation : null;
    const browserSensor = !sensor && window.DeviceOrientationEvent && !window.DeviceOrientationEvent.requestPermission;
    let track = createTiltTracker();
    let target = { x: 0, y: 0 };
    const shown = { x: 0, y: 0 };
    let frame = 0;
    let running = false;

    // Датчик присылает замеры реже кадров, поэтому сдвиг плавно догоняет последний замер
    const paint = () => {
      shown.x += (target.x - shown.x) * EASE;
      shown.y += (target.y - shown.y) * EASE;
      const settled = Math.abs(target.x - shown.x) < 0.002 && Math.abs(target.y - shown.y) < 0.002;
      if (settled) Object.assign(shown, target);
      root.style.setProperty('--tilt-x', shown.x.toFixed(3));
      root.style.setProperty('--tilt-y', shown.y.toFixed(3));
      frame = settled ? 0 : requestAnimationFrame(paint);
      if (settled && !running) {
        delete root.dataset.tilt;
        root.style.removeProperty('--tilt-x');
        root.style.removeProperty('--tilt-y');
      }
    };
    const moveTo = (tilt) => {
      target = tilt;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const update = (beta, gamma) => {
      const tilt = track(beta, gamma);
      if (!tilt || !running) return;
      root.dataset.tilt = '';
      moveTo(toScreenAxes(tilt, window.screen.orientation?.angle ?? 0));
    };
    const onSensor = () => update(sensor.beta, sensor.gamma);
    const onBrowserSensor = event => update(event.beta * Math.PI / 180, event.gamma * Math.PI / 180);

    const start = () => {
      if (running || reducedMotion.matches || document.hidden) return;
      running = true;
      track = createTiltTracker();
      if (sensor) {
        WebApp.onEvent('deviceOrientationChanged', onSensor);
        sensor.start({ refresh_rate: SENSOR_INTERVAL });
      } else if (browserSensor) {
        window.addEventListener('deviceorientation', onBrowserSensor);
      }
    };
    const stop = () => {
      if (!running) return;
      running = false;
      if (sensor) {
        WebApp.offEvent('deviceOrientationChanged', onSensor);
        sensor.stop();
      } else if (browserSensor) {
        window.removeEventListener('deviceorientation', onBrowserSensor);
      }
      moveTo({ x: 0, y: 0 });
    };
    const sync = () => (document.hidden || reducedMotion.matches ? stop() : start());

    start();
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener?.('change', sync);
    WebApp.onEvent?.('activated', start);
    WebApp.onEvent?.('deactivated', stop);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener?.('change', sync);
      WebApp.offEvent?.('activated', start);
      WebApp.offEvent?.('deactivated', stop);
      stop();
      cancelAnimationFrame(frame);
      delete root.dataset.tilt;
      root.style.removeProperty('--tilt-x');
      root.style.removeProperty('--tilt-y');
    };
  }, []);

  return null;
}
