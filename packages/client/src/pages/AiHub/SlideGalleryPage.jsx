import { useAiHubData } from '../../hooks/useAiHubData';
import SlideGallery from '../../components/aiHub/SlideGallery';
import '../../components/aiHub/aiHubMotion.css';

export default function SlideGalleryPage() {
  const { slide, status } = useAiHubData();
  if (status !== 'ready') return <p className="ai-empty">불러오는 중...</p>;
  if (slide.length === 0) {
    return (
      <div data-testid="slide-empty" className="ai-empty">
        <p>예시 슬라이드를 준비하고 있어요</p>
      </div>
    );
  }
  return <SlideGallery items={slide} />;
}
