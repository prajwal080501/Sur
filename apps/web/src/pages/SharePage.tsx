import type { PublicShare } from '@sur/shared-types';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicShare } from '../features/share/publicShareClient.js';

type ShareState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly share: PublicShare }
  | { readonly status: 'error'; readonly message: string };

export function SharePage() {
  const { slug = '' } = useParams();
  const [state, setState] = useState<ShareState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void getPublicShare(slug, controller.signal)
      .then((share) => setState({ status: 'ready', share }))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: reason instanceof Error ? reason.message : 'Unable to load this share.',
        });
      });
    return () => controller.abort();
  }, [slug]);

  if (state.status === 'loading') {
    return (
      <section className="share-page" aria-live="polite">
        <p className="eyebrow">Shared with Sur</p>
        <h1>Loading performance…</h1>
      </section>
    );
  }
  if (state.status === 'error') {
    return (
      <section className="share-page" role="alert">
        <p className="eyebrow">Shared with Sur</p>
        <h1>Performance unavailable</h1>
        <p className="error">{state.message}</p>
      </section>
    );
  }

  const { share } = state;
  return (
    <article className="share-page">
      <p className="eyebrow">A Sur performance</p>
      <h1>{share.title}</h1>
      <p className="share-byline">Sung by {share.singer}</p>
      <dl className="share-facts">
        <div>
          <dt>Key</dt>
          <dd>{share.key}</dd>
        </div>
        <div>
          <dt>Tempo</dt>
          <dd>{share.tempoBpm} BPM</dd>
        </div>
      </dl>
      {share.videoUrl ? (
        <video className="share-video" controls playsInline preload="metadata" src={share.videoUrl}>
          <track kind="captions" />
        </video>
      ) : (
        <audio className="share-audio" controls preload="metadata" src={share.audioUrl} />
      )}
      {share.chords.length > 0 && (
        <section className="share-chords" aria-labelledby="share-chords-title">
          <h2 id="share-chords-title">Chords</h2>
          <ol>
            {share.chords.map((chord, index) => (
              <li key={`${chord.tMs}-${index}`}>
                <strong>{chord.symbol}</strong>
                <span>{(chord.tMs / 1000).toFixed(1)}s</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
