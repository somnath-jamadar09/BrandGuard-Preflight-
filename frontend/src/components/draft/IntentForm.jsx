import { useState } from 'react';
import './IntentForm.css';

export default function IntentForm({ values, onChange }) {
  const [tagInput, setTagInput] = useState('');

  function set(field, val) {
    onChange({ ...values, [field]: val });
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    if (!values.mustSay.includes(tag)) {
      set('mustSay', [...values.mustSay, tag]);
    }
    setTagInput('');
  }

  function removeTag(tag) {
    set('mustSay', values.mustSay.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !tagInput && values.mustSay.length) {
      set('mustSay', values.mustSay.slice(0, -1));
    }
  }

  return (
    <div className="intent-form">
      <div className="form-group">
        <label className="form-label" htmlFor="intent-purpose">
          Purpose <span aria-hidden="true">*</span>
        </label>
        <input
          id="intent-purpose"
          type="text"
          className="form-input"
          value={values.purpose}
          onChange={(e) => set('purpose', e.target.value)}
          placeholder="e.g. Promote new returns policy"
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="intent-audience">
          Target audience <span aria-hidden="true">*</span>
        </label>
        <input
          id="intent-audience"
          type="text"
          className="form-input"
          value={values.audience}
          onChange={(e) => set('audience', e.target.value)}
          placeholder="e.g. Existing customers"
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="intent-mustsay">
          Must-say points <span aria-hidden="true">*</span>
        </label>
        <div className={`intent-tag-box${values.mustSay.length === 0 ? ' intent-tag-box--empty' : ''}`}>
          {values.mustSay.map((tag) => (
            <span key={tag} className="intent-tag">
              {tag}
              <button
                type="button"
                className="intent-tag-remove"
                onClick={() => removeTag(tag)}
                aria-label={`Remove "${tag}"`}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            id="intent-mustsay"
            type="text"
            className="intent-tag-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={addTag}
            placeholder={values.mustSay.length === 0 ? 'Type and press Enter…' : ''}
            aria-label="Add must-say point"
          />
        </div>
        <span className="form-label intent-tag-hint">
          Press Enter or comma to add · Backspace to remove last
        </span>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="intent-constraints">
          What should NOT be changed
        </label>
        <textarea
          id="intent-constraints"
          className="form-input"
          rows={3}
          value={values.constraints}
          onChange={(e) => set('constraints', e.target.value)}
          placeholder="Optional — list anything that must remain unchanged"
        />
      </div>
    </div>
  );
}
