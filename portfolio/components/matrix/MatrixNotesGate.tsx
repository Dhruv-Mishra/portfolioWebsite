import MatrixNotesWall from './MatrixNotesWall';

/**
 * Compatibility wrapper only. Authorization is enforced by the server page
 * and API using the signed HttpOnly access cookie.
 */
export default function MatrixNotesGate(): React.ReactElement {
  return <MatrixNotesWall />;
}
