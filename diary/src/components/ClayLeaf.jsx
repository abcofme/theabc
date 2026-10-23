import oak from '../assets/leaves/oak.webp';
import maple from '../assets/leaves/maple.webp';
import grape from '../assets/leaves/grape.webp';
import olive from '../assets/leaves/olive.webp';
import fig from '../assets/leaves/fig.webp';

const leaves = [oak, maple, grape, olive, fig];

export default function ClayLeaf({ index = 0, className = '' }) {
  return <img className={`clay-leaf ${className}`.trim()} src={leaves[index % leaves.length]} alt="" aria-hidden="true" draggable="false" width="32" height="36" />;
}
