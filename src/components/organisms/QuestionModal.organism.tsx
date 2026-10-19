'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveQuestionAction } from '@/services/campaignContent.actions';
import { CATEGORY_LABEL, validateQuestion } from '@/libs/campaign';
import type { QuestionCategory, QuestionDraft, QuestionRow } from '@/types/campaign.types';

const inputCls =
  'mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

export function QuestionModal({ question, onClose }: { question: QuestionRow | null; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<QuestionDraft>(
    question
      ? { prompt: question.prompt, option_a: question.option_a, option_b: question.option_b, correct: question.correct, category: question.category, difficulty: question.difficulty }
      : { prompt: '', option_a: '', option_b: '', correct: 'a', category: 'umum', difficulty: 1 }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientError = validateQuestion(form);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await saveQuestionAction({ ...form, id: question?.id });
      if (!res.ok) return setError(res.error);
      onClose();
      router.refresh();
    } catch {
      setError('Gagal menyimpan soal. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">{question ? 'Ubah soal' : 'Tambah soal'}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-sm text-text-secondary">Pertanyaan</span>
            <textarea rows={3} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            {(['a', 'b'] as const).map((k) => (
              <label key={k} className="block">
                <span className="text-sm text-text-secondary">Pilihan {k.toUpperCase()}</span>
                <input
                  value={k === 'a' ? form.option_a : form.option_b}
                  onChange={(e) => setForm(k === 'a' ? { ...form, option_a: e.target.value } : { ...form, option_b: e.target.value })}
                  className={inputCls}
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm text-text-secondary">Jawaban benar</span>
              <select value={form.correct} onChange={(e) => setForm({ ...form, correct: e.target.value as 'a' | 'b' })} className={inputCls}>
                <option value="a">A</option>
                <option value="b">B</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-text-secondary">Kategori</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as QuestionCategory })} className={inputCls}>
                {(Object.keys(CATEGORY_LABEL) as QuestionCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-text-secondary">Kesulitan</span>
              <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) as 1 | 2 | 3 })} className={inputCls}>
                <option value={1}>1 — mudah</option>
                <option value={2}>2 — sedang</option>
                <option value={3}>3 — sulit</option>
              </select>
            </label>
          </div>
          {(error ?? (form.prompt ? clientError : null)) && <p className="text-sm text-danger">{error ?? clientError}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-border-color p-5">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Batal</button>
          <button onClick={save} disabled={busy || clientError !== null}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50">
            {busy ? 'Menyimpan…' : 'Simpan soal'}
          </button>
        </div>
      </div>
    </div>
  );
}
