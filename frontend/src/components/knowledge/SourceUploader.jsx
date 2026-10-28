import { useState, useRef } from 'react';
import { uploadSource } from '../../api/sources';
import './SourceUploader.css';

const ACCEPT = '.pdf,.docx,.md';
const MAX_BYTES = 10 * 1024 * 1024;
const SOURCE_TYPES = ['guideline', 'fact-sheet', 'glossary', 'past-content'];
const STAGES = ['Uploading', 'Scanning', 'Parsing', 'Embedding', 'Ready'];

const defaultForm = {
  type: 'guideline',
  ownerName: '',
  version: '1.0',
  effectiveDate: '',
  expiryDate: '',
};

export default function SourceUploader({ onUploaded, onClose }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [fieldError, setFieldError] = useState('');
  const [stage, setStage] = useState(null);
  const [stageIndex, setStageIndex] = useState(-1);
  const [uploadError, setUploadError] = useState('');

  function pickFile(f) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setFieldError('File exceeds 10 MB limit.');
      return;
    }
    setFieldError('');
    setFile(f);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files[0]);
  }

  function handleField(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function canSubmit() {
    return file && form.type && form.ownerName.trim() && !stage;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit()) return;

    setUploadError('');
    const data = new FormData();
    data.append('file', file);
    Object.entries(form).forEach(([k, v]) => { if (v) data.append(k, v); });

    setStageIndex(0);
    setStage(STAGES[0]);

    try {
      await uploadSource(data, (ev) => {
        if (ev.loaded >= ev.total) {
          setStageIndex(1);
          setStage(STAGES[1]);
        }
      });

      for (let i = 2; i < STAGES.length; i++) {
        await new Promise((r) => setTimeout(r, 600));
        setStageIndex(i);
        setStage(STAGES[i]);
      }

      onUploaded?.();
      onClose?.();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Upload failed. Check the file and try again.';
      setUploadError(msg);
      setStage(null);
      setStageIndex(-1);
    }
  }

  return (
    <div className="uploader-backdrop" role="dialog" aria-modal="true" aria-label="Add source">
      <div className="uploader-modal card">
        <div className="uploader-header">
          <h2>Add Source</h2>
          <button className="btn btn-secondary uploader-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div
            className={`uploader-dropzone${dragging ? ' uploader-dropzone--over' : ''}${file ? ' uploader-dropzone--has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            aria-label="Drop file or click to browse"
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="uploader-file-input"
              onChange={(e) => pickFile(e.target.files[0])}
            />
            {file ? (
              <div className="uploader-file-info">
                <span className="uploader-file-name">{file.name}</span>
                <span className="uploader-file-size">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
              </div>
            ) : (
              <div className="uploader-prompt">
                <span className="uploader-icon" aria-hidden="true">📄</span>
                <span>Drag & drop or click to browse</span>
                <span className="uploader-hint">PDF · DOCX · MD · max 10 MB</span>
              </div>
            )}
          </div>

          {fieldError && (
            <p className="form-error" role="alert">{fieldError}</p>
          )}

          <div className="uploader-fields">
            <div className="form-group">
              <label className="form-label" htmlFor="up-type">Source type</label>
              <select id="up-type" name="type" className="form-input" value={form.type} onChange={handleField}>
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="up-owner">Owner</label>
              <input
                id="up-owner"
                name="ownerName"
                type="text"
                className="form-input"
                value={form.ownerName}
                onChange={handleField}
                placeholder="Owner name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="up-version">Version</label>
              <input
                id="up-version"
                name="version"
                type="text"
                className="form-input"
                value={form.version}
                onChange={handleField}
                placeholder="e.g. 1.0"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="up-effective">Effective date</label>
              <input
                id="up-effective"
                name="effectiveDate"
                type="date"
                className="form-input"
                value={form.effectiveDate}
                onChange={handleField}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="up-expiry">Expiry date</label>
              <input
                id="up-expiry"
                name="expiryDate"
                type="date"
                className="form-input"
                value={form.expiryDate}
                onChange={handleField}
              />
            </div>
          </div>

          {stage && (
            <div className="uploader-progress" aria-live="polite">
              <div className="uploader-stages">
                {STAGES.map((s, i) => (
                  <span
                    key={s}
                    className={`uploader-stage${i <= stageIndex ? ' uploader-stage--done' : ''}${i === stageIndex ? ' uploader-stage--active' : ''}`}
                  >
                    {s}
                  </span>
                ))}
              </div>
              <div className="uploader-progress-bar">
                <div
                  className="uploader-progress-fill"
                  style={{ width: `${((stageIndex + 1) / STAGES.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {uploadError && (
            <p className="form-error" role="alert">{uploadError}</p>
          )}

          <div className="uploader-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              id="uploader-submit"
              className="btn btn-primary"
              disabled={!canSubmit()}
              aria-busy={!!stage}
            >
              {stage ? (
                <><span className="spinner" aria-hidden="true" /> {stage}…</>
              ) : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
