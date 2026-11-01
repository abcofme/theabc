import { useEffect, useState } from 'react';

// Разбор Markdown (react-markdown с плагинами) — самая тяжелая часть сборки, поэтому он в отдельном файле.
// Грузим его сразу при запуске, параллельно с запросами к API: к приходу записей он обычно уже готов.
// Пока его нет, показываем текст как есть
let Markdown = null;
let loading = null;

function loadMarkdown() {
  loading ??= import('./ResultMarkdown')
    .then((module) => { Markdown = module.default; })
    .catch(() => { loading = null; });
  return loading;
}

loadMarkdown();

export default function ResultContent(props) {
  const [Loaded, setLoaded] = useState(() => Markdown);

  useEffect(() => {
    if (Loaded) return;
    let isActive = true;
    loadMarkdown().then(() => { if (isActive && Markdown) setLoaded(() => Markdown); });
    return () => { isActive = false; };
  }, [Loaded]);

  return Loaded ? <Loaded {...props} /> : <div className="whitespace-pre-line">{props.content}</div>;
}
