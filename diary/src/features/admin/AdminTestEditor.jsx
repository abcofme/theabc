import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Plus, Trash2, Save, X, LoaderCircle } from '../../components/ClayIcon';
import { useBackHandler } from '../../navigation/backStack';

const WebApp = window.Telegram.WebApp;
const API_URL = window.location.origin;

export default function AdminTestEditor({ testId, categories, onClose }) {
  useBackHandler(true, onClose);
  const editorRef = useRef(null);
  const [loading, setLoading] = useState(!!testId);
  const [saving, setSaving] = useState(false);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const initialCategoryId = categories[0]?.id || '';
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  
  const [results, setResults] = useState([]); 
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    if (testId) {
      fetch(`${API_URL}/api/admin/tests/${testId}`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      })
      .then(res => res.json())
      .then(data => {
        setName(data.name || '');
        setDescription(data.description || '');
        setCategoryId(data.category_id || initialCategoryId);
        let groupedResults = [];
        (data.results || []).forEach(r => {
          let g = groupedResults.find(g => g.name === r.name);
          if (!g) {
            g = { name: r.name, intervals: [] };
            groupedResults.push(g);
          }
          g.intervals.push({
            range_from: r.range_from,
            range_to: r.range_to
          });
        });
        setResults(groupedResults);
        setQuestions(data.questions || []);
      })
      .catch(err => {
        WebApp.showAlert("Ошибка при загрузке теста");
        console.error(err);
      })
      .finally(() => setLoading(false));
    }
  }, [testId, initialCategoryId]);

  useLayoutEffect(() => { editorRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); }, [loading]);

  const handleSave = async () => {
    if (!name || !categoryId) {
      WebApp.showAlert("Название и категория обязательны");
      return;
    }
    
    setSaving(true);
    
    let flatResults = [];
    results.forEach(r => {
      r.intervals.forEach(inv => {
        flatResults.push({
          name: r.name,
          range_from: parseInt(inv.range_from || 0),
          range_to: inv.range_to !== "" && inv.range_to !== null && inv.range_to !== undefined ? parseInt(inv.range_to) : null
        });
      });
    });

    const payload = {
      name,
      description,
      category_id: parseInt(categoryId),
      results: flatResults,
      questions: questions.map(q => ({
        name: q.name,
        answers: q.answers.map(a => ({ 
          name: a.name, 
          value: parseInt(a.value || 0) 
        }))
      }))
    };
    
    try {
      const method = testId ? "PUT" : "POST";
      const url = testId ? `${API_URL}/api/admin/tests/${testId}` : `${API_URL}/api/admin/tests`;
      
      const response = await fetch(url, {
        method,
        headers: { 
          "Authorization": `Bearer ${WebApp.initData}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      WebApp.showAlert(testId ? "Тест успешно обновлен" : "Тест успешно создан");
      onClose(); // go back
    } catch (err) {
      WebApp.showAlert("Ошибка при сохранении: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addResult = () => setResults([...results, { name: '', intervals: [{ range_from: 0, range_to: '' }] }]);
  const updateResult = (idx, field, val) => {
    const newR = [...results];
    newR[idx][field] = val;
    setResults(newR);
  };
  const removeResult = (idx) => setResults(results.filter((_, i) => i !== idx));

  const addInterval = (resIdx) => {
    const newR = [...results];
    newR[resIdx].intervals.push({ range_from: 0, range_to: '' });
    setResults(newR);
  };
  const updateInterval = (resIdx, intIdx, field, val) => {
    const newR = [...results];
    newR[resIdx].intervals[intIdx][field] = val;
    setResults(newR);
  };
  const removeInterval = (resIdx, intIdx) => {
    const newR = [...results];
    newR[resIdx].intervals = newR[resIdx].intervals.filter((_, i) => i !== intIdx);
    setResults(newR);
  };

  const addQuestion = () => setQuestions([...questions, { name: '', answers: [] }]);
  const updateQuestion = (idx, val) => {
    const newQ = [...questions];
    newQ[idx].name = val;
    setQuestions(newQ);
  };
  const removeQuestion = (idx) => setQuestions(questions.filter((_, i) => i !== idx));

  const addAnswer = (qIdx) => {
    const newQ = [...questions];
    newQ[qIdx].answers.push({ name: '', value: 0 });
    setQuestions(newQ);
  };
  const updateAnswer = (qIdx, aIdx, field, val) => {
    const newQ = [...questions];
    newQ[qIdx].answers[aIdx][field] = val;
    setQuestions(newQ);
  };
  const removeAnswer = (qIdx, aIdx) => {
    const newQ = [...questions];
    newQ[qIdx].answers = newQ[qIdx].answers.filter((_, i) => i !== aIdx);
    setQuestions(newQ);
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center py-12">
        <LoaderCircle size={40} className="animate-spin" aria-label="Загрузка" />
      </div>
    );
  }

  return (
    <div ref={editorRef} className="admin-content flex flex-col w-full min-w-0 pb-8">
      <h2 className="text-2xl font-bold text-[#F5E6D3] mb-6">
        {testId ? "Редактирование теста" : "Создание теста"}
      </h2>

      {/* Basic Info */}
      <div className="ui-card mb-6 flex flex-col gap-4">
        <div>
          <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">Категория:</label>
          <select 
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none"
          >
            <option value="">Выберите категорию...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">Название:</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            placeholder="Название"
            className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none placeholder:text-[#F5E6D3]/60"
          />
        </div>
        <div>
          <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">Описание теста:</label>
          <textarea 
            value={description} 
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание"
            className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none placeholder:text-[#F5E6D3]/60 min-h-[80px]"
          />
        </div>
      </div>

      {/* Results / Interpretations */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold text-[#F5E6D3]">Результаты</h3>
        </div>
        
        <div className="space-y-4">
          {results.length === 0 && <p className="text-[#F5E6D3]/60 text-sm">Нет результатов</p>}
          {results.map((r, idx) => (
            <div key={idx} className="ui-card p-4! relative">
              <button onClick={() => removeResult(idx)} className="absolute top-4 right-4 text-red-400 p-1 hover:bg-red-400/10 rounded-lg">
                <Trash2 size={18} />
              </button>
              
              <div className="mb-3 pr-8">
                <label className="text-[#F5E6D3]/70 text-xs mb-2 block font-medium">Интервалы баллов:</label>
                <div className="space-y-2">
                  {r.intervals.map((inv, intIdx) => (
                    <div key={intIdx} className="flex gap-2 items-center bg-rose-950/30 p-2 rounded-lg">
                      <div className="flex-1">
                        <label className="text-[#F5E6D3]/60 text-xs mb-1 block">От (включительно):</label>
                        <input 
                          type="number" value={inv.range_from} onChange={(e) => updateInterval(idx, intIdx, 'range_from', e.target.value)}
                          className="w-full bg-rose-950/50 text-[#F5E6D3] p-1.5 text-sm rounded focus:outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[#F5E6D3]/60 text-xs mb-1 block">До (не включительно):</label>
                        <input 
                          type="number" value={inv.range_to ?? ''} onChange={(e) => updateInterval(idx, intIdx, 'range_to', e.target.value)}
                          placeholder="бескон."
                          className="w-full bg-rose-950/50 text-[#F5E6D3] p-1.5 text-sm rounded focus:outline-none placeholder:text-[#F5E6D3]/60"
                        />
                      </div>
                      <button onClick={() => removeInterval(idx, intIdx)} disabled={r.intervals.length === 1} className="mt-4 text-red-400/70 hover:text-red-400 p-1 disabled:opacity-30">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => addInterval(idx)} className="mt-2 text-[#7BA887] text-xs flex items-center gap-1 hover:text-emerald-300">
                  <Plus size={14} /> Добавить интервал
                </button>
              </div>

              <div>
                <label className="text-[#F5E6D3]/70 text-xs mb-1 block">Текст результата (общий для всех интервалов):</label>
                <textarea 
                  value={r.name} onChange={(e) => updateResult(idx, 'name', e.target.value)}
                  className="w-full bg-rose-950/50 text-[#F5E6D3] p-2 rounded-lg focus:outline-none min-h-[60px]"
                />
              </div>
            </div>
          ))}
          <button onClick={addResult} className="ui-button ui-button--outline mt-3">
            <Plus size={18} /> Результат
          </button>
        </div>
      </div>

      {/* Questions */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold text-[#F5E6D3]">Вопросы</h3>
        </div>
        
        <div className="space-y-6">
          {questions.length === 0 && <p className="text-[#F5E6D3]/60 text-sm">Нет вопросов</p>}
          {questions.map((q, qIdx) => (
            <div key={qIdx} className="ui-card p-4!">
              <div className="flex gap-2 items-start mb-4">
                <span className="bg-rose-950/80 text-[#F5E6D3]/60 px-2 py-1.5 rounded-lg text-sm font-bold mt-1">
                  {qIdx + 1}
                </span>
                <textarea 
                  value={q.name} onChange={(e) => updateQuestion(qIdx, e.target.value)}
                  placeholder="Текст вопроса..."
                  className="min-w-0 flex-1 bg-rose-950/50 text-[#F5E6D3] p-2 rounded-lg focus:outline-none min-h-[60px]"
                />
                <button onClick={() => removeQuestion(qIdx)} className="text-red-400 p-2 hover:bg-red-400/10 rounded-lg mt-1 shrink-0">
                  <Trash2 size={18} />
                </button>
              </div>
              
              <div className="space-y-2">
                <p className="text-[#F5E6D3]/70 text-xs uppercase tracking-wider font-bold mb-2">Варианты ответов:</p>
                {q.answers.map((a, aIdx) => (
                  <div key={aIdx} className="admin-answer grid grid-cols-[minmax(0,1fr)_44px] gap-2 items-center">
                    <input 
                      type="text" value={a.name} onChange={(e) => updateAnswer(qIdx, aIdx, 'name', e.target.value)}
                      placeholder="Ответ..."
                      className="col-span-2 w-full bg-rose-950 text-[#F5E6D3] p-3 rounded-xl"
                    />
                    <input 
                      type="number" value={a.value} onChange={(e) => updateAnswer(qIdx, aIdx, 'value', e.target.value)}
                      placeholder="Балл" aria-label="Баллы за этот ответ" title="Баллы за этот ответ"
                      className="w-full bg-rose-950 text-[#F5E6D3] p-3 rounded-xl"
                    />
                    <button onClick={() => removeAnswer(qIdx, aIdx)} className="text-[#F5E6D3]/40 hover:text-red-400 p-1 rounded-lg">
                      <XIcon />
                    </button>
                  </div>
                ))}
                <button onClick={() => addAnswer(qIdx)} className="text-[#7BA887] text-sm flex items-center gap-1 hover:text-emerald-500 mt-2 px-2 py-1">
                  <Plus size={14} /> Добавить ответ
                </button>
              </div>
            </div>
          ))}
          <button onClick={addQuestion} className="ui-button ui-button--outline">
            <Plus size={18} /> Вопрос
          </button>
        </div>
      </div>

      <div className="sticky bottom-0 bg-rose-950 pt-4 pb-2 mt-4">
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="ui-button ui-button--primary"
        >
          {saving ? <LoaderCircle size={20} className="animate-spin" aria-hidden="true" /> : <Save size={20} />}
          {saving ? 'Сохранение...' : 'Сохранить тест'}
        </button>
      </div>

    </div>
  );
}

// Simple internal icon for removing answer
function XIcon() {
  return <X size={16} />;
}
