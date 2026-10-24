import { useEffect, useState, type DragEvent } from 'react';
import { emptyCharacterInput, type Character, type CharacterInput, type PdfImportResult } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { CharacterForm } from './CharacterForm.tsx';

interface Props {
  characters: Character[];
  onClose: () => void;
  onCreated: (c: Character) => void;
}

type Step =
  | { kind: 'choose'; error?: string }
  | { kind: 'reading'; fileName: string }
  | { kind: 'review'; result: PdfImportResult | null; initial: CharacterInput };

/** Add Character: upload a PDF sheet (or start blank), review every field, then save. */
export function ImportModal({ characters, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const read = async (file: File | undefined) => {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') return setStep({ kind: 'choose', error: '请选择 PDF 格式的角色卡' });
    setStep({ kind: 'reading', fileName: file.name });
    try {
      const result = await api.importPdf(file);
      setStep({ kind: 'review', result, initial: result.fields });
    } catch (e) {
      setStep({ kind: 'choose', error: e instanceof Error ? e.message : 'PDF 读取失败' });
    }
  };

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); read(e.dataTransfer.files[0]); };

  const save = async (input: CharacterInput) => {
    const c = await api.createCharacter(input);
    onCreated(c);
  };

  const dup = step.kind === 'review' && step.result?.sameNameCharacterId ? characters.find((c) => c.id === step.result!.sameNameCharacterId) : null;

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sheet" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header className="sheet-head">
          <h2 id="import-title">添加角色</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </header>

        {step.kind === 'choose' && (
          <div className="import-choose">
            <label
              htmlFor="import-file"
              className={`dropzone${dragging ? ' dropzone--over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <span className="dropzone-title">上传角色卡 PDF</span>
              <span>点击选择，或把文件拖到这里。支持官方 5e 可填写角色卡。</span>
            </label>
            <input id="import-file" type="file" accept="application/pdf" className="sr-only" onChange={(e) => read(e.target.files?.[0])} />
            {step.error && <p className="form-error" role="alert">{step.error}</p>}
            <p className="import-or">或者</p>
            <button type="button" className="btn btn--ghost" onClick={() => setStep({ kind: 'review', result: null, initial: emptyCharacterInput() })}>
              不用 PDF，手动创建
            </button>
          </div>
        )}

        {step.kind === 'reading' && (
          <div className="import-reading" role="status">
            <p>正在读取 {step.fileName}…</p>
          </div>
        )}

        {step.kind === 'review' && (
          <>
            {step.result && <p className="form-hint">已从 PDF 读出下面的内容。请核对并修改，确认后才会保存。原始 PDF 会保留在角色详情里。</p>}
            {dup && <p className="form-warn">已经有一个叫「{dup.name}」的角色。保存会新建一个角色，不会覆盖原来的。</p>}
            <CharacterForm
              initial={step.initial}
              missing={step.result?.missing}
              submitLabel="确认并保存"
              onSubmit={save}
              onCancel={() => setStep({ kind: 'choose' })}
            />
          </>
        )}
      </div>
    </div>
  );
}
