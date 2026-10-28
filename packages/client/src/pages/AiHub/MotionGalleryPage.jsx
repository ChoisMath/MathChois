import { useAiHubData } from '../../hooks/useAiHubData';
import MotionGallery from '../../components/aiHub/MotionGallery';
import '../../components/aiHub/aiHubMotion.css';

export default function MotionGalleryPage() {
  const { access, motion, status } = useAiHubData();
  if (status !== 'ready') return <p className="ai-empty">불러오는 중...</p>;
  if (motion.length === 0) {
    return (
      <div data-testid="motion-empty" className="ai-empty">
        <p>예시를 준비하고 있어요</p>
        {access.canEditOriginal ? <p><code>npm run ai:push</code> 로 자료를 올리세요</p> : null}
      </div>
    );
  }
  return <MotionGallery items={motion} />;
}
