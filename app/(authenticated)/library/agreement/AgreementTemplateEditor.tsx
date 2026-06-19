'use client'
import { useEffect, useMemo, useState } from 'react'
import type { AgreementTemplate } from '@/lib/supabase/types'
import {
  renderAgreementHtml,
  type AgreementTemplateContent,
} from '@/lib/agreement-template'

type Editable = {
  description_of_coaching: string
  agreement_logistics: string
  method_of_contact: string
  late_policy: string
  cancellation_policy: string
  payment_terms: string
}

// Editor layout: editable sections interleaved with the locked (ICF & legal)
// blocks, in document order. Locked items render muted and non-interactive.
type Item =
  | { kind: 'edit'; key: keyof Editable; label: string; rows: number; placeholder?: string }
  | { kind: 'lock'; label: string; field: keyof AgreementTemplate }

const LAYOUT: Item[] = [
  { kind: 'edit', key: 'description_of_coaching', label: 'Opening / Description of Coaching', rows: 4 },
  { kind: 'lock', label: 'Coach-Client Relationship', field: 'locked_coach_client_relationship' },
  { kind: 'edit', key: 'agreement_logistics', label: 'Agreement Logistics', rows: 6 },
  { kind: 'lock', label: 'Confidentiality', field: 'locked_confidentiality' },
  { kind: 'lock', label: 'AI Recording & Authorization', field: 'locked_ai_recording' },
  { kind: 'lock', label: 'Release of Information', field: 'locked_release_of_information' },
  { kind: 'edit', key: 'method_of_contact', label: 'Method of Contact', rows: 3 },
  { kind: 'edit', key: 'late_policy', label: 'Late Policy', rows: 4 },
  { kind: 'edit', key: 'cancellation_policy', label: 'Cancellation & Rescheduling', rows: 4 },
  {
    kind: 'edit',
    key: 'payment_terms',
    label: 'Payment Terms',
    rows: 2,
    placeholder: 'Leave blank to omit this section. Overridden per client at issue time.',
  },
  { kind: 'lock', label: 'Standard Legal Provisions', field: 'locked_standard_legal' },
]

function emptyEditable(): Editable {
  return {
    description_of_coaching: '',
    agreement_logistics: '',
    method_of_contact: '',
    late_policy: '',
    cancellation_policy: '',
    payment_terms: '',
  }
}

export function AgreementTemplateEditor() {
  const [template, setTemplate] = useState<AgreementTemplate | null>(null)
  const [fields, setFields] = useState<Editable>(emptyEditable())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/agreements/template')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load the template.'))))
      .then((d) => {
        if (cancelled) return
        const t: AgreementTemplate = d.template
        setTemplate(t)
        setFields({
          description_of_coaching: t.description_of_coaching || '',
          agreement_logistics: t.agreement_logistics || '',
          method_of_contact: t.method_of_contact || '',
          late_policy: t.late_policy || '',
          cancellation_policy: t.cancellation_policy || '',
          payment_terms: t.payment_terms || '',
        })
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // Live preview: current editable fields + the loaded locked sections.
  const previewHtml = useMemo(() => {
    if (!template) return ''
    const content: AgreementTemplateContent = {
      ...fields,
      payment_terms: fields.payment_terms,
      locked_coach_client_relationship: template.locked_coach_client_relationship,
      locked_confidentiality: template.locked_confidentiality,
      locked_ai_recording: template.locked_ai_recording,
      locked_release_of_information: template.locked_release_of_information,
      locked_termination: template.locked_termination,
      locked_limited_liability: template.locked_limited_liability,
      locked_standard_legal: template.locked_standard_legal,
    }
    return renderAgreementHtml(content, {
      client_name: 'Client Name',
      coach_name: '',
      zoom_link: '',
      phone: '',
    })
  }, [template, fields])

  async function save() {
    setSaving(true)
    setError('')
    setToast('')
    try {
      const res = await fetch('/api/agreements/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save the template.')
      setTemplate(data.template)
      setToast('Template saved.')
      setTimeout(() => setToast(''), 2500)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Editor */}
      <div className="space-y-5">
        {LAYOUT.map((item, i) =>
          item.kind === 'edit' ? (
            <div key={i}>
              <label className="mb-1.5 block text-[13px] font-medium text-tlw-navy-deep">{item.label}</label>
              <textarea
                value={fields[item.key]}
                onChange={(e) => setFields((f) => ({ ...f, [item.key]: e.target.value }))}
                rows={item.rows}
                placeholder={item.placeholder}
                className="w-full resize-y rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-signal-orange placeholder:text-tlw-warm-gray/60"
              />
            </div>
          ) : (
            <LockedSection key={i} label={item.label} text={(template?.[item.field] as string) || ''} />
          )
        )}

        <div className="sticky bottom-4 flex items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-tlw-lg bg-tlw-navy-rich px-5 py-2.5 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Template'}
          </button>
          {toast && <span className="text-[13px] font-medium" style={{ color: 'var(--color-success)' }}>{toast}</span>}
          {error && <span className="text-[13px] text-tlw-signal-orange">{error}</span>}
        </div>
      </div>

      {/* Live preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Live preview</p>
        <div className="max-h-[80vh] overflow-y-auto rounded-tlw-2xl border border-tlw-warm-gray/15 bg-white p-7">
          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      </div>
    </div>
  )
}

function LockedSection({ label, text }: { label: string; text: string }) {
  return (
    <div
      className="rounded-tlw-md border border-tlw-warm-gray/15 p-3"
      style={{ background: '#F2F2F0' }}
      title="This section is required by ICF ethics standards and cannot be edited."
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full bg-tlw-canvas px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[1px] text-tlw-warm-gray">
          Locked · ICF &amp; Legal
        </span>
        <span className="text-[12px] font-medium" style={{ color: '#8B8680' }}>{label}</span>
      </div>
      <p className="line-clamp-3 whitespace-pre-line text-[11px] leading-relaxed" style={{ color: '#8B8680' }}>
        {text}
      </p>
    </div>
  )
}
