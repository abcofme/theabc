import React, { useState, useEffect } from 'react';
import { ChevronLeft, Plus, Trash2, Save, GripVertical } from 'lucide-react';

const WebApp = window.Telegram.WebApp;
const API_URL = "https://friendly-various-near-across.trycloudflare.com";

export default function AdminTestEditor({ testId, categories, onClose }) {
  const [loading, setLoading] = useState(!!testId);
  const [saving, setSaving] = useState(false);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories.length > 0 ? categories[0].id : '');
  
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
        setCategoryId(data.category_id || (categories.length > 0 ? categories[0].id : ''));
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
  }, [testId]);

  const handleSave = async () => {
    if (!name || !categoryId) {
      WebApp.showAlert("Название и категория обязательны");
      return;
    }
    
    setSaving(true);
    
    const payload = {
      name,
      description,
      category_id: parseInt(categoryId),
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
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#F5E6D3]"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-24 animate-in fade-in slide-in-from-right-8 duration-300 flex flex-col w-full relative">
      <button 
        onClick={onClose}
        className="flex items-center gap-2 text-[#F5E6D3] hover:text-[#F5E6D3] mb-6 transition-colors self-start"
      >
        <ChevronLeft size={20} />
        <span className="font-medium">Назад к списку</span>
      </button>

      <h2 className="text-2xl font-bold text-[#F5E6D3] mb-6">
        {testId ? "Редактирование теста" : "Создание теста"}
      </h2>

      {/* Basic Info */}
      <div className="bg-rose-900 p-5 rounded-3xl mb-6 flex flex-col gap-4">
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
            className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none placeholder:text-[#F5E6D3]/30"
          />
        </div>
        <div>
          <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">Описание теста:</label>
          <textarea 
            value={description} 
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание"
            className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none placeholder:text-[#F5E6D3]/30 min-h-[80px]"
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
            <div key={idx} className="bg-rose-900 p-4 rounded-2xl relative">
              <button onClick={() => removeResult(idx)} className="absolute top-4 right-4 text-red-400 p-1 hover:bg-red-400/10 rounded-lg">
                <Trash2 size={18} />
              </button>
              
              <div className="mb-3 pr-8">
                <label className="text-[#F5E6D3]/70 text-xs mb-2 block font-medium">Интервалы баллов:</label>
                <div className="space-y-2">
                  {r.intervals.map((inv, intIdx) => (
                    <div key={intIdx} className="flex gap-2 items-center bg-rose-950/30 p-2 rounded-lg">
                      <div className="flex-1">
                        <label className="text-[#F5E6D3]/60 text-[10px] mb-1 block">От (включительно):</label>
                        <input 
                          type="number" value={inv.range_from} onChange={(e) => updateInterval(idx, intIdx, 'range_from', e.target.value)}
                          className="w-full bg-rose-950/50 text-[#F5E6D3] p-1.5 text-sm rounded focus:outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[#F5E6D3]/60 text-[10px] mb-1 block">До (не включительно):</label>
                        <input 
                          type="number" value={inv.range_to ?? ''} onChange={(e) => updateInterval(idx, intIdx, 'range_to', e.target.value)}
                          placeholder="бескон."
                          className="w-full bg-rose-950/50 text-[#F5E6D3] p-1.5 text-sm rounded focus:outline-none placeholder:text-[#F5E6D3]/20"
                        />
                      </div>
                      <button onClick={() => removeInterval(idx, intIdx)} disabled={r.intervals.length === 1} className="mt-4 text-red-400/70 hover:text-red-400 p-1 disabled:opacity-30">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => addInterval(idx)} className="mt-2 text-green-400 text-xs flex items-center gap-1 hover:text-green-300">
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
          <button onClick={addResult} className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
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
            <div key={qIdx} className="bg-rose-900 p-4 rounded-2xl">
              <div className="flex gap-2 items-start mb-4">
                <span className="bg-rose-950/80 text-[#F5E6D3]/60 px-2 py-1.5 rounded-lg text-sm font-bold mt-1">
                  {qIdx + 1}
                </span>
                <textarea 
                  value={q.name} onChange={(e) => updateQuestion(qIdx, e.target.value)}
                  placeholder="Текст вопроса..."
                  className="flex-1 bg-rose-950/50 text-[#F5E6D3] p-2 rounded-lg focus:outline-none min-h-[60px]"
                />
                <button onClick={() => removeQuestion(qIdx)} className="text-red-400 p-2 hover:bg-red-400/10 rounded-lg mt-1 shrink-0">
                  <Trash2 size={18} />
                </button>
              </div>
              
              <div className="pl-2 sm:pl-10 space-y-2">
                <p className="text-[#F5E6D3]/70 text-xs uppercase tracking-wider font-bold mb-2">Варианты ответов:</p>
                {q.answers.map((a, aIdx) => (
                  <div key={aIdx} className="flex gap-2 items-center bg-rose-950/30 p-2 rounded-xl">
                    <input 
                      type="text" value={a.name} onChange={(e) => updateAnswer(qIdx, aIdx, 'name', e.target.value)}
                      placeholder="Ответ..."
                      className="flex-1 bg-rose-950/50 text-[#F5E6D3] text-sm p-2 rounded-lg focus:outline-none"
                    />
                    <input 
                      type="number" value={a.value} onChange={(e) => updateAnswer(qIdx, aIdx, 'value', e.target.value)}
                      placeholder="Балл" title="Баллы за этот ответ"
                      className="w-16 bg-rose-950/50 text-emerald-400 font-bold text-center p-2 rounded-lg focus:outline-none"
                    />
                    <button onClick={() => removeAnswer(qIdx, aIdx)} className="text-[#F5E6D3]/40 hover:text-red-400 p-1 rounded-lg">
                      <XIcon />
                    </button>
                  </div>
                ))}
                <button onClick={() => addAnswer(qIdx)} className="text-green-600 text-sm flex items-center gap-1 hover:text-green-500 mt-2 px-2 py-1">
                  <Plus size={14} /> Добавить ответ
                </button>
              </div>
            </div>
          ))}
          <button onClick={addQuestion} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            <Plus size={18} /> Вопрос
          </button>
        </div>
      </div>

      <div className="mt-8 pt-4">
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 text-[#F5E6D3] font-bold py-4 rounded-2xl transition-all active:scale-[0.98] shadow-lg flex justify-center items-center gap-2"
        >
          {saving ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div> : <Save size={20} />}
          {saving ? 'Сохранение...' : 'Сохранить тест'}
        </button>
      </div>

    </div>
  );
}

// Simple internal icon for removing answer
function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
