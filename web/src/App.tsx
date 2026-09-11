import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode } from 'react';
import { api, assertionViews } from './api';
import type { AssertionView, Claim, DecisionOutcome, NewClaim } from './api';
import { EXAMPLE_CLAIM } from './example';

const EMPTY: NewClaim = { productRef: '', market: '', claimText: '', evidenceText: '' };
const FIELDS = ['productRef', 'market', 'claimText', 'evidenceText'] as const;
const sameInput = (a: NewClaim, b: NewClaim) => FIELDS.every((k) => a[k] === b[k]);
const isComplete = (f: NewClaim) => FIELDS.every((k) => f[k].trim() !== '');

const LABEL: Record<string, string> = {
  SUPPORTED: 'Supported',
  PARTIAL: 'Partial',
  UNSUPPORTED: 'Unsupported',
  SUBSTANTIATED: 'Substantiated',
  NOT_SUBSTANTIATED: 'Not substantiated',
  DRAFTED: 'Drafted',
  ASSESSED: 'Assessed',
  APPROVED: 'Approved',
  SENT_BACK: 'Sent back',
};

type ErrorState = { scope: 'assess' | 'decide'; message: string } | null;

export function App() {
  const [form, setForm] = useState<NewClaim>(EMPTY);
  // The claim created for the current inputs; reused if they have not changed.
  const [draft, setDraft] = useState<{ id: string; input: NewClaim } | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [busy, setBusy] = useState<'assess' | 'decide' | null>(null);
  const [error, setError] = useState<ErrorState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');

  const run = claim?.runs[0] ?? null;
  const assertions = useMemo(() => (run ? assertionViews(run) : []), [run]);
  const selected = assertions.find((a) => a.id === selectedId) ?? null;
  const stale = claim !== null && draft !== null && !sameInput(form, draft.input);
  const canDecide = claim?.status === 'ASSESSED' && !stale && busy === null;

  const update =
    (field: keyof NewClaim) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleAssess(e: FormEvent) {
    e.preventDefault();
    setBusy('assess');
    setError(null);
    try {
      let id = draft && sameInput(form, draft.input) ? draft.id : null;
      if (!id) {
        id = (await api.createClaim(form)).id;
        setDraft({ id, input: form });
      }
      setClaim(await api.assess(id));
      setSelectedId(null);
      setJustification('');
    } catch (err) {
      setError({ scope: 'assess', message: messageOf(err) });
    } finally {
      setBusy(null);
    }
  }

  async function handleDecision(outcome: DecisionOutcome) {
    if (!claim) return;
    setBusy('decide');
    setError(null);
    try {
      setClaim(await api.decide(claim.id, outcome, justification));
    } catch (err) {
      setError({ scope: 'decide', message: messageOf(err) });
    } finally {
      setBusy(null);
    }
  }

  const notFound = assertions.filter((a) => !a.quoteVerified).length;
  const decision = claim?.decisions[0] ?? null;

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1>Evidence Gate</h1>
          <p>
            Checks a product marketing claim against the evidence behind it. Every quote the model
            cites is verified against the source before a person signs off.
          </p>
        </div>
        {claim && <span className="status">{LABEL[claim.status]}</span>}
      </header>

      <section className="section">
        <SectionHeading step={1} title="Claim and evidence" />
        <form className="input-grid" onSubmit={handleAssess}>
          <label>
            Product reference
            <input value={form.productRef} onChange={update('productRef')} placeholder="TS-T2" />
          </label>
          <label>
            Market
            <input value={form.market} onChange={update('market')} placeholder="US" />
          </label>
          <label className="span-2">
            Claim text
            <textarea rows={3} value={form.claimText} onChange={update('claimText')} />
          </label>
          <label className="span-2">
            <span>
              Evidence text <span className="hint">— e.g. an independent test report, sent to the model in full</span>
            </span>
            <textarea rows={9} value={form.evidenceText} onChange={update('evidenceText')} />
          </label>
          <div className="actions span-2">
            <button type="submit" className="primary" disabled={!isComplete(form) || busy !== null}>
              {busy === 'assess' ? 'Assessing…' : 'Assess'}
            </button>
            <button type="button" className="link" onClick={() => setForm(EXAMPLE_CLAIM)}>
              Load example
            </button>
            {error?.scope === 'assess' && <p className="error">{error.message}</p>}
          </div>
        </form>
      </section>

      <section className="section">
        <SectionHeading
          step={2}
          title="Results"
          aside={
            run && (
              <>
                <span className="summary">
                  {assertions.length} assertions
                  {notFound > 0 && ` · ${notFound} quote${notFound > 1 ? 's' : ''} not found`}
                </span>
                <span className={`badge large ${run.overallVerdict}`}>{LABEL[run.overallVerdict]}</span>
              </>
            )
          }
        />
        {!run || !claim ? (
          <p className="empty">Assess a claim to see each assertion, its verdict, and the passage it rests on.</p>
        ) : (
          <>
            {stale && (
              <p className="notice">The inputs have changed since this assessment. Assess again before deciding.</p>
            )}
            <p className="provenance">
              {run.modelId} · prompt {run.promptVersion} · {(run.latencyMs / 1000).toFixed(1)} s
              {run.inputTokens !== null &&
                ` · ${run.inputTokens.toLocaleString()} in / ${(run.outputTokens ?? 0).toLocaleString()} out tokens`}
            </p>
            <div className="results-grid">
              <div className="cards">
                {assertions.map((a) => (
                  <AssertionCard
                    key={a.id}
                    assertion={a}
                    selected={a.id === selectedId}
                    onSelect={() => setSelectedId(a.id)}
                  />
                ))}
              </div>
              <EvidencePanel text={claim.evidenceText} selected={selected} />
            </div>
          </>
        )}
      </section>

      <section className="section">
        <SectionHeading step={3} title="Decision" />
        <fieldset className="decision" disabled={!canDecide}>
          <label>
            Justification
            <textarea
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Why this claim can go out as written, or what has to change first."
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={!justification.trim()}
              onClick={() => handleDecision('APPROVED')}
            >
              Approve
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!justification.trim()}
              onClick={() => handleDecision('SENT_BACK')}
            >
              Send back
            </button>
            {error?.scope === 'decide' && <p className="error">{error.message}</p>}
          </div>
        </fieldset>
        {!canDecide && !decision && (
          <p className="hint gate">
            {stale ? 'Assess the changed inputs first.' : 'Available once the claim has been assessed.'}
          </p>
        )}
        {decision && claim && (
          <p className="recorded">
            <strong>{LABEL[decision.outcome]}</strong> — “{decision.justification}”
            <span className="hint"> · signed off against run {decision.runId.slice(0, 8)}</span>
          </p>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ step, title, aside }: { step: number; title: string; aside?: ReactNode }) {
  return (
    <div className="section-heading">
      <span className="step">{step}</span>
      <h2>{title}</h2>
      {aside && <div className="aside">{aside}</div>}
    </div>
  );
}

function AssertionCard({
  assertion: a,
  selected,
  onSelect,
}: {
  assertion: AssertionView;
  selected: boolean;
  onSelect: () => void;
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };
  const overridden = !a.quoteVerified && a.modelVerdict !== null && a.modelVerdict !== a.verdict;

  return (
    <article
      className={`card${selected ? ' selected' : ''}${a.quoteVerified ? '' : ' unverified'}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <div className="card-head">
        <span className={`badge ${a.verdict}`}>{LABEL[a.verdict]}</span>
        <span className="confidence">Confidence {a.confidence}/100</span>
      </div>
      <p className="assertion">{a.text}</p>
      <p className="rationale">{a.rationale}</p>
      <blockquote className="quote">{a.quotedExcerpt ? `“${a.quotedExcerpt}”` : 'No quote given'}</blockquote>
      {!a.quoteVerified && (
        <p className="unverified-marker">
          <span aria-hidden="true">✕</span>
          <span>
            Quote not found in source
            {overridden && (
              <span className="detail">
                {' '}
                — the model said {LABEL[a.modelVerdict!]}; overridden to Unsupported
              </span>
            )}
          </span>
        </p>
      )}
    </article>
  );
}

function EvidencePanel({ text, selected }: { text: string; selected: AssertionView | null }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLElement>(null);

  const span =
    selected && selected.matchedAt !== null && selected.matchedLength !== null
      ? { start: selected.matchedAt, end: selected.matchedAt + selected.matchedLength }
      : null;

  useEffect(() => {
    const body = bodyRef.current;
    const mark = markRef.current;
    if (body && mark) {
      body.scrollTo({ top: Math.max(0, mark.offsetTop - body.clientHeight / 3), behavior: 'smooth' });
    }
  }, [selected?.id]);

  return (
    <aside className="evidence">
      <div className="evidence-head">
        Evidence
        {!selected && <span className="hint">Click an assertion to find its quote here.</span>}
        {selected && !span && (
          <span className="evidence-miss">No matching passage: this quote does not appear in the source.</span>
        )}
      </div>
      <div className="evidence-body" ref={bodyRef}>
        {span ? (
          <>
            {text.slice(0, span.start)}
            <mark ref={markRef}>{text.slice(span.start, span.end)}</mark>
            {text.slice(span.end)}
          </>
        ) : (
          text
        )}
      </div>
    </aside>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
