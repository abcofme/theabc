// Keep decoded image resources alive while the user moves between cards.
export function createImagePreloader({ createImage = () => new Image(), concurrency = 2 } = {}) {
  const images = new Map();

  function load(src, priority = 'high') {
    if (!src) return Promise.resolve(false);
    const cached = images.get(src);
    if (cached) {
      if (priority === 'high') cached.image.fetchPriority = 'high';
      return cached.ready;
    }

    const image = createImage();
    image.fetchPriority = priority;
    image.decoding = 'async';
    let resolve;
    const ready = new Promise(done => { resolve = done; });
    const entry = { image, ready };
    images.set(src, entry);
    image.onload = async () => {
      try { await image.decode?.(); } catch { /* A loaded image remains usable if decode is unsupported. */ }
      resolve(true);
    };
    image.onerror = () => {
      if (images.get(src) === entry) images.delete(src);
      resolve(false);
    };
    image.src = src;
    return ready;
  }

  function retain(sources) {
    const current = new Set(sources);
    for (const src of images.keys()) {
      if (!current.has(src)) images.delete(src);
    }
  }

  function preload(sources) {
    const queue = [...new Set(sources.filter(Boolean))];
    let next = 0;
    let cancelled = false;
    async function worker() {
      while (!cancelled && next < queue.length) {
        const index = next++;
        await load(queue[index], index === 0 ? 'high' : 'low');
      }
    }
    for (let i = 0; i < concurrency; i++) void worker();
    return () => { cancelled = true; };
  }

  return { load, preload, retain };
}

export const questionImages = createImagePreloader();
