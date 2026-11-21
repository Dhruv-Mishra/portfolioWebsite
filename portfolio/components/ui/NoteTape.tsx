import './note-tape.css';

export function NoteTape({ className }: { className: string }) {
  return (
    <span aria-hidden="true" data-tape-strip data-fastener="tape" className={className}>
      <span className="tape-tail" />
      <span className="tape-track"><span className="tape-coil" /></span>
    </span>
  );
}
