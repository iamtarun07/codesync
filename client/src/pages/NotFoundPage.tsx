import { Link } from 'react-router-dom';
import { Brand } from '../components/common/Brand';

export function NotFoundPage() {
  return (
    <div className="cs-grid flex min-h-screen flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <Brand />
      <p className="font-mono text-[52px] font-semibold leading-none text-cyan">404</p>
      <div>
        <h1 className="t-screen-title">Route not found</h1>
        <p className="t-caption mt-1">That page is not part of this workspace.</p>
      </div>
      <Link
        to="/dashboard"
        className="rounded-[6px] border border-line bg-elevated px-3.5 py-2 text-[13px] font-medium text-ink transition hover:border-line-strong"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
