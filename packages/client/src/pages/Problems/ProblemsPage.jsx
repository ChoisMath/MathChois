import { useSearchParams } from 'react-router-dom';
import ProblemRegister from './ProblemRegister';
import RegisteredProblems from './RegisteredProblems';

export default function ProblemsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'register' ? 'register' : 'list';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 border-b">
        <button onClick={() => setParams({ tab: 'register' })}
          className={`px-4 py-2 whitespace-nowrap ${tab === 'register' ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-gray-500'}`}>
          문항등록
        </button>
        <button onClick={() => setParams({ tab: 'list' })}
          className={`px-4 py-2 whitespace-nowrap ${tab === 'list' ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-gray-500'}`}>
          등록된 문항
        </button>
      </div>
      {tab === 'register'
        ? <ProblemRegister onSaved={() => setParams({ tab: 'list' })} />
        : <RegisteredProblems />}
    </div>
  );
}
