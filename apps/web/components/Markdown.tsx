import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders artifact READMEs. Raw HTML is never enabled — artifacts are untrusted. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-hub">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children: c }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{c}</a> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
