interface TranscriptContextProps {
  readonly text: string;
  readonly particle: string;
}

export function TranscriptContext({
  text,
  particle,
}: TranscriptContextProps) {
  const particleIndex = text.lastIndexOf(particle);
  const before = particleIndex < 0 ? text : text.slice(0, particleIndex);
  const highlighted = particleIndex < 0 ? "" : particle;
  const after =
    particleIndex < 0 ? "" : text.slice(particleIndex + particle.length);

  return (
    <section className="transcript-context" aria-labelledby="transcript-heading">
      <div>
        <h2 id="transcript-heading" className="visually-hidden">
          Transcript context
        </h2>
        <p>Alignment follows the corrected transcript.</p>
      </div>
      <blockquote lang="zh-Hans">
        {before}
        {highlighted.length === 0 ? null : <mark>{highlighted}</mark>}
        {after}
      </blockquote>
    </section>
  );
}
